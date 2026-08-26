# Évolution proposée : Indicateurs en microservice réel

## Constat de départ

Le pipeline décrit dans [`ingestion.md`](./ingestion.md) fonctionne, mais Indicateurs
n'est pas un microservice au sens strict : son code et son déploiement sont bien
séparés de PLaTon, mais il **accède directement à la base de données de PLaTon**
(`platon_db`), en lecture comme en écriture :

- **Lecture** : `PlatonService` (`api/src/modules/core/platon/platon.service.ts`)
  exécute du SQL directement sur `platon_db` (`getUserSessionData`, `queryTable`,
  `getAvailableTables`...), pour alimenter le moteur de formules (`fetch`/`join` du
  DSL) et l'explorateur de schéma de l'admin.
- **Écriture (DDL)** : `EventRulesService.installTrigger()` exécute `CREATE TRIGGER`
  directement sur `platon_db`, via une connexion admin séparée
  (`PLATON_DB_ADMIN_USERNAME`/`PASSWORD`, voir `ingestion.md` § "Droits Postgres
  requis").

C'est un couplage fort ("database per service" non respecté), accepté jusqu'ici parce
que la contrainte du projet était de **ne jamais modifier ni redéployer le code de
PLaTon**. Ce document décrit ce qu'il faudrait construire pour lever ce couplage, si
cette contrainte est un jour levée - sans rien perdre de la souplesse actuelle
(configurer un nouvel indicateur ou un nouvel événement reste entièrement piloté
depuis l'admin d'Indicateurs, sans jamais retoucher le code de PLaTon).

---

## Principe général

PLaTon expose une petite API HTTP dédiée à Indicateurs (nouveau module, isolé du
reste de son code). Indicateurs n'ouvre plus aucune connexion à `platon_db` : tout
passe par cette API (lecture) et par RabbitMQ (événements), exactement comme
n'importe quel autre client externe le ferait.

```
Indicateurs                              PLaTon (nouveau module PedagogicalDataModule)
─────────────                            ──────────────────────────────────────────────
FormulaInterpreterService  ──HTTP───────▶  POST /api/external/query        (lecture)
Admin - explorateur schéma ──HTTP───────▶  GET  /api/external/schema       (introspection)
Admin - "Événements"       ──HTTP───────▶  POST /api/external/watchers     (inscription)
                                                    │
                                                    ▼ (en interne, propres droits PLaTon)
                                              trigger + outbox + relais PLaTon
                                                    │
IngestionConsumerService   ◀──RabbitMQ────  publication (événement déjà nommé)
```

---

## 1. Ce que PLaTon doit construire

Nouveau module, par exemple `PedagogicalDataModule`, séparé du reste du code
métier de PLaTon. Il **réutilise la logique déjà écrite côté Indicateurs** dans
`platon.service.ts` (elle a juste besoin de changer de côté de la frontière réseau) :
`getSafeColumns`/`buildSafeSelect`/`assertValidTableColumn` implémentent déjà
l'introspection et l'exclusion des colonnes sensibles (mots de passe, jetons,
e-mails via `SENSITIVE_COLUMN_PATTERN`) - c'est exactement ce dont ce module a
besoin, il n'y a rien à réinventer.

### 1.1 Lecture - `POST /api/external/query`

Le moteur de formules d'Indicateurs (étapes `fetch`/`join` du DSL) a besoin d'un
accès **générique**, pas d'une poignée de routes fixes par cas d'usage - c'est ce
qui permet aujourd'hui de construire un indicateur sur n'importe quelle table/colonne
de PLaTon sans écrire de code. La route mirror directement la forme de
`PlatonService.queryTable()` :

```jsonc
// Requête
{
  "table": "SessionData",
  "filters": { "activity_id": "53100bc2-..." },
  "join": {                          // optionnel, reprend join du DSL
    "table": "Users",
    "leftKey": "user_id",
    "rightKey": "id",
    "joinType": "left"
  },
  "limit": 10000
}

// Réponse
{ "rows": [ { "activity_id": "...", "attempts_at_success": 2, "...": "..." } ] }
```

Sécurité inchangée par rapport à aujourd'hui : validation du nom de table/colonne,
liste blanche des colonnes exposées par introspection de `information_schema`,
exclusion des colonnes sensibles. Seule différence : cette validation tourne côté
PLaTon, avec ses propres droits, au lieu d'être exécutée par Indicateurs depuis
l'extérieur.

### 1.2 Introspection - `GET /api/external/schema`

Reprend `getAvailableTables()`/`getSchemaWithRelations()` : liste des tables et
colonnes exposables, utilisée par l'explorateur de schéma de l'admin (constructeur
de pipeline). Réponse identique à ce que `PlatonService` renvoie déjà aujourd'hui.

### 1.3 Inscription à un événement - `POST /api/external/watchers`

Remplace `EventRulesService.installTrigger()`. Mêmes paramètres que ceux déjà
stockés dans `indicator_event_rules` (table `indicators`) :

```jsonc
// Requête
{
  "eventName": "exercice.completed",   // nom métier choisi par Indicateurs
  "table": "SessionData",
  "watchedColumn": "attempts_at_success",
  "operation": "INSERT_OR_UPDATE",
  "condition": { "kind": "changed" },  // always | changed | equals | not_equals | threshold_crossed
  "contextMapping": {                  // colonnes → champs du message publié
    "userId": "user_id",
    "courseId": "course_id",
    "activityId": "activity_id"
  }
}

// Réponse
{ "watcherId": "...", "installed": true }
```

Différence clé avec le mécanisme actuel : **le nom de l'événement est fixé au
moment de l'inscription**, pas deviné après coup. En interne, PLaTon peut garder un
vrai déclencheur SQL (le mécanisme lui-même ne change pas, juste qui l'exécute) :

- table `platon_outbox_events` interne à PLaTon (Indicateurs n'y accède plus) ;
- un petit relais équivalent à `IngestionRelayService`, mais **côté PLaTon** et
  **sans étape de classification** (l'événement à publier est déjà nommé dans le
  déclencheur créé à l'inscription) - juste lire l'outbox et publier tel quel sur
  RabbitMQ.

`DELETE /api/external/watchers/:id` retire la règle et réduit/supprime le
déclencheur, même logique qu'aujourd'hui (§ "Supprimer" dans `ingestion.md`).

### 1.4 Authentification

Appels service-à-service, pas d'utilisateur derrière : une clé partagée dans un
en-tête (`X-Service-Key`), vérifiée par un garde dédié sur les trois routes
ci-dessus. Pas de JWT utilisateur.

---

## 2. Ce qui change côté Indicateurs

| Composant | Aujourd'hui | Après |
|---|---|---|
| `PlatonService` | requêtes SQL directes sur `platon_db` | client HTTP vers `POST /api/external/query` et `GET /api/external/schema` |
| `EventRulesService.installTrigger()` | exécute `CREATE TRIGGER` via connexion admin | appelle `POST /api/external/watchers` |
| `IngestionRelayService` | interroge `platon_outbox_events` toutes les 2s, classifie via `classify()` | **supprimé** - PLaTon publie déjà l'événement nommé sur RabbitMQ |
| `IngestionConsumerService` | inchangé | inchangé - consomme toujours RabbitMQ |
| `IndicatorsService.computeView`/`computeViewIncremental` | inchangé | inchangé |
| `IndicatorsGateway` (WebSocket) | inchangé | inchangé |
| Config `.env` | `PLATON_DB_HOST/PORT/USERNAME/PASSWORD`, `PLATON_DB_ADMIN_USERNAME/PASSWORD` | remplacés par `PLATON_API_URL`, `PLATON_SERVICE_KEY` |
| `indicator_event_rules`, `indicator_event_types` (base `indicators`) | inchangé | inchangé - reste la source de vérité de la config, seule la méthode d'installation change |

**Ce qui ne change pas**, et c'est le point important : l'admin d'Indicateurs
("Événements & déclencheurs", constructeur de pipeline) garde exactement le même
fonctionnement pour la personne qui configure - même wizard, mêmes étapes, mêmes
tables `indicator_event_rules`/`indicator_event_types`. Seule la façon dont
l'installation se fait *en coulisses* change.

---

## 3. Ce que ça corrige

- Indicateurs n'a plus aucune connexion réseau vers `platon_db` : plus de
  `PLATON_DB_*`, plus d'identifiants admin sur une base qui n'est pas la sienne.
- La classification à l'exécution (`classify()`, comparaison d'un événement brut
  contre les règles actives) disparaît : l'événement est nommé une fois pour
  toutes à l'inscription, publié déjà classifié.
- Un nouveau type d'événement sur une table déjà couverte reste configurable
  entièrement depuis l'admin d'Indicateurs, sans toucher au code de PLaTon (seul
  un besoin sur une table encore jamais exposée demanderait un ajout côté PLaTon,
  dans `getAvailableTables()`/les colonnes sûres).
- Chaque service ne possède et ne modifie plus que sa propre base de données -
  Indicateurs devient un microservice au sens strict, pas seulement en pratique.

## 4. Ce que ça coûte

- Développement et maintenance du module `PedagogicalDataModule` côté PLaTon (accès
  au dépôt de PLaTon, coordination avec son équipe - la contrainte de départ que ce
  document suppose levée).
- Une étape réseau supplémentaire sur chaque lecture (HTTP au lieu d'une requête SQL
  directe) - latence à mesurer, en particulier pour les formules qui font beaucoup
  de petites requêtes.
- Le relais interne à PLaTon (partie 1.3) doit être écrit et maintenu par son
  équipe, même simplifié par rapport à celui d'Indicateurs aujourd'hui.
