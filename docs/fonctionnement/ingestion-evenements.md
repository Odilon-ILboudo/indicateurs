# Pipeline d'ingestion des événements PLaTon → Indicateurs

## Vue d'ensemble

Quand un apprenant répond à un exercice dans PLaTon, la valeur de ses indicateurs se met à jour automatiquement en temps réel. Ce document décrit toutes les couches de ce pipeline.

```
SessionData (PLaTon DB)
       │ trigger PostgreSQL
       ▼
platon_outbox_events
       │ relais NestJS (toutes les 2 s, côté LMS hôte, voir étape 2)
       ▼
RabbitMQ : exchange platon.events (topic)
   │  routing key = event_type de la ligne (par exemple "raw:SessionData")
   ├ queue indicators.learner   → onLearnerEvent   (contextType = 'learner')
   └ queue indicators.aggregate → onAggregateEvent (contextType ≠ 'learner')
       │ consumers NestJS
       ▼
indicator_values (indicators DB)
       │ EventEmitter2
       ▼
IndicatorsGateway (WebSocket /indicators)
       │ socket.io
       ▼
Frontend : mise à jour temps réel sans rechargement
```

---

## Infrastructure requise

### RabbitMQ

```bash
# Lancer RabbitMQ (et le reste de l'infra locale) via le compose du projet
cd indicateurs && ./bin/docker/up.sh

# Interface web : http://localhost:15672
# Identifiants : RABBITMQ_USER et RABBITMQ_PASSWORD dans .env (voir docs/deploiement/docker.md).
# Un autre conteneur RabbitMQ lancé à la main entrerait en conflit de port avec indicateurs_rabbitmq.
```

### Variables d'environnement (api/.env)

```env
RABBITMQ_URI=amqp://indicateurs:<mot-de-passe>@localhost:5672
```

`api/.env` est généré par `./bin/generate-api-env.sh` à partir du `.env` racine.

---

## Étape 1 : table outbox (base PLaTon)

### Installation (à exécuter une seule fois sur la BDD PLaTon)

```bash
PGPASSWORD=... psql -h localhost -p 5432 -U platon -d platon_db \
  -f api/scripts/migrations/platon-outbox.sql
```

### Ce que le script crée

**Uniquement la table `platon_outbox_events`**, qui reçoit une ligne à
chaque changement capté par un déclencheur installé (voir étape 1bis) :

| Colonne      | Type        | Description                                              |
|--------------|-------------|-----------------------------------------------------------|
| `id`         | BIGSERIAL   | Clé primaire auto-incrémentée                              |
| `event_type` | VARCHAR     | `raw:<Table>` (déclencheur générique installé via l'admin) |
| `payload`    | JSONB       | `{ table, op, new, old, timestamp }`, voir étape 1bis      |
| `created_at` | TIMESTAMPTZ | Horodatage automatique                                     |

**Aucun déclencheur n'est créé par ce script**, par choix délibéré : tous les
déclencheurs d'événements, y compris pour `exercise.answered`, se créent depuis
l'administration Indicateurs (étape 1bis), jamais dans une migration SQL, pour
que tout reste réglable sans redéploiement.

### Vérifier qu'un déclencheur est en place

```bash
PGPASSWORD=... psql -h localhost -p 5432 -U platon -d platon_db -c \
  "SELECT trigger_name, event_object_table FROM information_schema.triggers
   WHERE trigger_name LIKE 'trg_platon_outbox_generic_%';"
```

(Vide tant qu'aucune règle n'a été installée depuis l'admin : c'est normal juste
après l'exécution du script ci-dessus.)

---

## Étape 1bis : déclencheurs dynamiques (sans redéploiement)

Tous les déclencheurs d'événements se créent depuis l'admin (**Indicateurs →
« Événements & déclencheurs »**), sans exception : aucun n'est câblé en dur
dans le code ou dans une migration SQL. Pour ajouter un nouvel événement
(nouvelle table, nouvelle colonne, nouvelle condition), il n'y a rien à
modifier dans le code. (Le déclencheur `trg_platon_attempts_at_success`,
installé par un script SQL, n'est pas un déclencheur d'événement : il tient à
jour une colonne de `SessionData`, voir readme section 4.1.)

### Principe

```
Table PLaTon (INSERT/UPDATE)
       │ trigger générique installé via l'admin (fn_platon_outbox_generic)
       ▼
platon_outbox_events   (event_type = 'raw:<Table>', payload = {table, op, new, old})
       │ OutboxRelayService.relay(), côté LMS hôte, republie tel quel (étape 2)
       ▼
RabbitMQ (message reçu par les deux consumers Indicateurs)
       │ EventClassifierService.classify(), dans chaque consumer (étape 3)
       ▼
  type commence par 'raw:' ?
       │
       ├─ NON → traité tel quel comme événement déjà résolu (possible, mais
       │        inutilisé aujourd'hui : tous les déclencheurs installés
       │        depuis l'admin produisent 'raw:*')
       │
       └─ OUI → classify() : évalue chaque IndicatorEventRule active
                (table, colonne surveillée, condition, mapping contexte)
                → 0..N événements métier, un par règle qui matche
```

`indicator_event_rules` (table, base `indicators`) porte une règle par
`(sourceTable, watchedColumn, operation, condition, contextMapping)` →
`eventTypeId`. Le catalogue `indicator_event_types` reste la source des *noms*
exposés au wizard (`GET /api/event-types?configured=true` ne renvoie que les
types associés à une règle active **et** dont le trigger est réellement
installé).

### Créer et installer une règle (admin uniquement)

Module frontend : `frontend/src/app/features/admin/event-rule-manager.component.ts`
(+ `event-rule-builder.component.ts`, `event-rule-install-modal.component.ts`).
Backend : `api/src/modules/features/event-rules/`.

1. **« Nouvelle règle »** : un wizard guidé demande la table PLaTon, la colonne
   surveillée, l'opération (INSERT, UPDATE ou les deux), la condition
   (`always`, `changed`, `equals`, `not_equals`, `threshold_crossed`), le
   mapping du contexte (colonnes → `userId`, `courseId`, `activityId`,
   `sessionId`) et le type d'événement (existant ou nouveau).
   `POST /api/event-rules` : **aucun SQL n'est exécuté à cette étape**, la
   règle est seulement enregistrée.
2. **« Installer »** (icône éclair) : ouvre un aperçu du SQL
   (`GET /api/event-rules/:id/preview-sql`), toujours sans effet. Le bouton
   **« Confirmer l'installation »** exécute réellement le DDL
   (`POST /api/event-rules/:id/install`) : `CREATE OR REPLACE FUNCTION
   fn_platon_outbox_generic()` (partagée par toutes les tables, sans effet si
   elle existe déjà), puis `DROP TRIGGER IF EXISTS` et `CREATE TRIGGER
   trg_platon_outbox_generic_<table>`, avec la liste des colonnes surveillées
   recalculée (union de toutes les règles actives déjà installées sur cette
   table, plus celle-ci).
3. **« Désactiver »** : la règle cesse de produire des événements, mais le
   trigger reste tel quel dans PLaTon. **« Réactiver »** la remet en service.
4. **« Supprimer définitivement »** (icône corbeille) : si le trigger n'est pas
   installé, la règle est simplement effacée. S'il l'est, un aperçu du SQL de
   retrait s'ouvre d'abord : le retrait **réduit** le trigger (recalcule les
   colonnes sans celle de cette règle) s'il sert à d'autres règles actives sur
   la même table, ou le supprime entièrement sinon.

Désactiver et supprimer sont refusés tant qu'un indicateur actif utilise
l'événement de la règle.

### Droits Postgres requis : `PLATON_DB_ADMIN_USERNAME`/`PASSWORD`

`DROP TRIGGER` exige en PostgreSQL d'être **propriétaire** de la table (pas
juste d'avoir le privilège `TRIGGER`, contrairement à `CREATE TRIGGER`). Le
rôle applicatif (`PLATON_DB_USERNAME`) n'est pas forcément propriétaire des
tables PLaTon. Deux options :

- **Régler une fois pour toutes** (recommandé si vous savez déjà quelles
  tables seront utilisées) :
  ```sql
  ALTER TABLE "NomDeLaTable" OWNER TO platon;  -- remplacer 'platon' par PLATON_DB_USERNAME
  ```
- **Ou configurer un identifiant admin** dans `api/.env` (superuser, ou
  propriétaire des tables concernées) :
  ```env
  PLATON_DB_ADMIN_USERNAME=postgres
  PLATON_DB_ADMIN_PASSWORD=...
  ```
  Si ces variables sont renseignées, `EventRulesService.execDdl()` exécute le
  DDL directement par cette connexion (ouverte le temps de la commande, puis
  fermée) : **le propriétaire des tables n'est pas modifié**, il n'y a rien à
  restaurer. Sans elles, l'installation passe par la connexion habituelle et,
  si les droits manquent, la fenêtre affiche un message clair avec le SQL à
  faire exécuter à la main.

### Exemple : recréer `exercise.answered`

C'est le cas d'usage central du projet (réponse à un exercice), sans
traitement spécial : une règle comme les autres. Table `SessionData`, colonne
surveillée `grade`, condition `always`, mapping du contexte `user_id`,
`course_id`, `activity_id`, `id`, type d'événement `exercise.answered`.
`exercise.answered` n'apparaît dans la liste des événements du wizard
d'indicateur qu'une fois cette règle créée **et** installée ; avant cela, aucun
indicateur qui en dépend ne peut être activé.

---

## Étape 2 : relais (outbox → RabbitMQ), côté LMS hôte et non Indicateurs

**Ce relais ne vit pas dans ce dépôt** : il tourne côté LMS hôte (PLaTon), lit
sa propre base, et publie vers RabbitMQ (hébergé par Indicateurs), sans jamais
avoir besoin d'accéder à la base Indicateurs. Fichier prêt à copier et guide
complet : [`docs/platon-integration/integration-platon-relay.md`](../platon-integration/integration-platon-relay.md).

Le relais republie chaque ligne de `platon_outbox_events` **telle quelle**,
sans l'interpréter, en ajoutant seulement un champ `type` égal à `event_type`.
La classification des événements génériques (`raw:<Table>`) se fait dans les
consumers, à l'étape 3 ci-dessous.

Le curseur de position (`indicateurs_outbox_cursor`) vit côté LMS hôte, dans
sa propre base.

---

## Étape 3 : consumers RabbitMQ

**Fichier :** `api/src/modules/features/ingestion/ingestion-consumer.service.ts`

Deux consumers avec routing key `'#'` (reçoivent tous les types d'événements).
**Chacun classifie d'abord le message reçu** (`resolveEvents()`) : si
`type` commence par `raw:` (déclencheur générique installé depuis l'admin),
délègue à `EventClassifierService.classify()` (`event-rules/`) pour obtenir
0..N événements métier réels avant de les traiter un par un ; sinon, traite le message reçu
directement comme un événement métier déjà résolu.

### Consumer `indicators.learner`

- **Ce qu'il traite :** indicateurs `contextType = 'learner'`
- **Comment :** `ingestForContext(raw, 'learner')` appelle directement
  `IndicatorsService.computeViewIncremental()` (calcul différentiel si le
  pipeline s'y prête, recalcul complet sinon : voir `docs/fonctionnement/calcul-differentiel.md`).
  `courseId` n'est cherché dans PLaTon que si la formule en a réellement besoin
  (`isCourseAware` ; voir la définition d'`activity-aware` et `course-aware` dans
  [`docs/fonctionnement/parcours-donnees.md` section 0](./parcours-donnees.md#0-conventions)) ;
  `computeViewIncremental` choisit lui-même `activityId` ou `courseId` selon
  ce que la formule déclare.
- **Résultat :** met à jour `indicator_values` pour `(indicatorId, learner, userId)` (clé suffixée par l'activité ou le cours si la formule en dépend), puis envoie la valeur par WebSocket

### Consumer `indicators.aggregate`

- **Ce qu'il traite :** tous les indicateurs `contextType ≠ 'learner'`
- **Comment :** `getAffectedIndicators()` filtre `contextType !== 'learner'` → `processAggregateIndicator()` dispatch par contextType :

| contextType | Action |
|---|---|
| `activity` | `computeViewIncremental(activityId)`, puis envoi WebSocket ; rien si l'événement n'a pas d'`activityId` |
| `course` | `computeViewIncremental(courseId)`, puis envoi WebSocket ; rien si l'événement n'a pas de `courseId` |
| `group`, non course-aware | `refreshSnapshots({activityId})` et `refreshActivityViews()` (qui envoient eux-mêmes par WebSocket) ; rien sans `activityId` |
| `group`, course-aware | `refreshSnapshots({courseId})` et `refreshCourseGroupViews()` (agrège toutes les activités du cours pour ce groupe) ; le cours est cherché dans PLaTon s'il manque |
| `teacher` | `getTeacherByCourse(courseId)` (propriétaire du cours), puis `computeViewIncremental` et envoi WebSocket ; rien sans `courseId` |
| `admin` et tout autre | `refreshCachedContextValues()` (différentiel si le pipeline s'y prête, recalcul complet sinon) |

Le mapping du contexte de la règle compte donc : une règle qui ne renseigne
pas `courseId` ne fera jamais recalculer les indicateurs `course` ni
`teacher`. Toutes ces branches tentent d'abord le calcul différentiel, et ne
retombent sur un recalcul complet que si le pipeline n'est pas reconnu ou si
l'état intermédiaire manque (voir `docs/fonctionnement/calcul-differentiel.md`).

---

## Étape 4 : WebSocket temps réel

**Fichier :** `api/src/modules/features/ingestion/indicators.gateway.ts`

`'indicator.updated'` n'est **pas** un des événements métier de l'étape 1bis
(`exercise.answered` et compagnie, configurables en admin, potentiellement
des dizaines). C'est un signal interne à ce dépôt, un seul nom, toujours le
même, qui ne veut dire qu'une chose : *« un indicateur vient d'être recalculé,
sa valeur a peut-être changé »*, quel que soit l'événement métier qui en est
la cause.

```
exercise.answered, activity.completed, ... (autant que voulu, définis en admin)
       │
       ▼
requiredEvents matché → indicateur recalculé
       │
       ▼
emitUpdated() : IngestionService (étape 3) ou IndicatorsService (rafraîchissement des snapshots et des vues)
       │
       ▼
eventEmitter.emit('indicator.updated', ...)   ← toujours ce même nom, pas de wildcard
       │
       ▼
IndicatorsGateway @OnEvent('indicator.updated') → broadcast socket.io (namespace /indicators)
```

Ajouter un nouveau type d'événement métier en admin ne touche jamais ce
fichier : la gateway ne connaît pas le vocabulaire métier, seulement ce
signal générique unique.

**Côté Angular**, `IndicatorSocketService` :
- se connecte à l'affichage de la première `IndicatorCardComponent` ;
- filtre les événements par `(indicatorId, contextType, contextId)` ;
- met à jour la valeur de la carte sans rechargement (`markForCheck()`).

Le recalcul périodique des indicateurs sans événement passe par `computeView`,
qui n'envoie rien par WebSocket : ces valeurs apparaissent au prochain
affichage de la page.

---

## Commandes de test

### Prérequis

```bash
# Terminal 1 : démarrer RabbitMQ (et le reste de l'infrastructure locale)
cd indicateurs && ./bin/docker/up.sh

# Terminal 2 : démarrer le backend
cd indicateurs/api && yarn start

# Terminal 3 : démarrer le frontend (facultatif, pour voir la mise à jour par WebSocket)
cd indicateurs/frontend && ng serve
```

### Test 1 : publication directe sur RabbitMQ (sans passer par l'outbox ni le relais)

Les valeurs `...` sont à remplacer par des données de votre propre base PLaTon (table `SessionData` :
colonnes `id`, `user_id`, `activity_id`, `course_id` d'une même ligne, et valeurs de `attempts_at_success`).

Le relais tourne côté LMS hôte (étape 2) ; ce dépôt ne peut donc pas le
lancer seul. Pour tester uniquement les consumers et la classification
(étape 3), on publie un événement générique directement sur l'exchange, via
l'API HTTP de gestion de RabbitMQ (identifiants dans `.env`, interface sur
`http://localhost:15672`). Le message est le même que celui que le relais
publierait pour une ligne `raw:SessionData` :

```bash
curl -u "$RABBITMQ_USER:$RABBITMQ_PASSWORD" -X POST \
  http://localhost:15672/api/exchanges/%2f/platon.events/publish \
  -H "Content-Type: application/json" -d '{
    "properties": {},
    "routing_key": "raw:SessionData",
    "payload_encoding": "string",
    "payload": "{\"type\":\"raw:SessionData\",\"table\":\"SessionData\",\"op\":\"UPDATE\",\"new\":{\"id\":\"...\",\"user_id\":\"...\",\"activity_id\":\"...\",\"course_id\":\"...\",\"attempts_at_success\":...},\"old\":{\"attempts_at_success\":...}}"
  }'
```

La table et les colonnes sont à adapter à une règle réellement active (voir
`SELECT * FROM indicator_event_rules` dans la base `indicators`).
`attempts_at_success` correspond à la règle `exercice.completed` décrite dans
`docs/guides/guide-creation-indicateur.md`, section 0.

### Test 2 : déclenchement par le trigger (de bout en bout)

Ce test demande que le relais tourne vraiment (côté LMS hôte, voir
`docs/platon-integration/integration-platon-relay.md`) : sans lui, l'événement
s'accumule dans `platon_outbox_events` sans jamais atteindre RabbitMQ. On
modifie une vraie session, et le trigger générique installé depuis l'admin
écrit tout seul dans l'outbox :

```bash
# Session 1
PGPASSWORD=... psql -h localhost -p 5432 -U platon -d platon_db -c "
UPDATE \"SessionData\"
SET attempts_at_success = attempts_at_success + 1
WHERE id = '...';"

# Session 2
PGPASSWORD=... psql -h localhost -p 5432 -U platon -d platon_db -c "
UPDATE \"SessionData\"
SET attempts_at_success = attempts_at_success + 1
WHERE id = '...';"
```

**Contexte de ces sessions :**

| Champ       | Valeur                                         |
|-------------|------------------------------------------------|
| Étudiant    | `...`                                          |
| Cours       | `...`                                          |
| Activité    | `...`                                          |
| Indicateur  | Tentatives avant réussite - Apprenant          |
| Calcul      | Moyenne des tentatives par exercice réussi     |

### Test 3 : vérifications après traitement

```bash
# Vérifier que l'outbox a bien reçu les événements
PGPASSWORD=... psql -h localhost -p 5432 -U platon -d platon_db -c \
  "SELECT id, event_type, payload->'new'->>'attempts_at_success' AS attempts_at_success, created_at
   FROM platon_outbox_events ORDER BY id DESC LIMIT 5;"

# Vérifier que le curseur a avancé (BDD PLaTon, voir étape 2)
PGPASSWORD=... psql -h localhost -p 5432 -U platon -d platon_db -c \
  "SELECT * FROM indicateurs_outbox_cursor;"

# Vérifier la valeur calculée de l'indicateur
PGPASSWORD=... psql -h localhost -p 5432 -U platon -d indicators -c \
  "SELECT id_def.name, iv.\"contextType\", iv.value, iv.\"updatedAt\"
   FROM indicator_values iv
   JOIN indicator_definitions id_def ON id_def.id = iv.\"indicatorId\"
   WHERE iv.\"contextId\" LIKE '...%'
   ORDER BY iv.\"updatedAt\" DESC LIMIT 10;"
```

---

## Lecture des logs NestJS

Lors du traitement d'un événement, les logs apparaissent dans deux applications
distinctes : le relais tourne côté LMS hôte (ses logs à lui, hors de ce dépôt),
les consumers côté Indicateurs :

```
# Relais : côté LMS hôte (PLaTon), journaux distincts de ceux d'Indicateurs
[OutboxRelayService]        DEBUG Relay : ... événement(s) publié(s) (curseur → ...)

# Les 2 consumers reçoivent le même message, côté Indicateurs (après classification)
[IngestionConsumerService]  LOG [learner] ← exercice.completed user=...
[IngestionConsumerService]  LOG [aggregate] ← exercice.completed user=...

# Consumer learner : indicateurs concernés
[IngestionService]          LOG [learner] ... indicateur(s) à traiter pour event="exercice.completed" user=...

# WebSocket : diffusion aux clients connectés
[IndicatorsGateway]         DEBUG WS broadcast: "Tentatives avant réussite - Apprenant" (learner) contextId=... value=...

# Fin du traitement de chaque consumer
[IngestionConsumerService]  LOG [learner] ✓ ...ms user=...
[IngestionConsumerService]  LOG [aggregate] ✓ ...ms
```

Les lignes `DEBUG` n'apparaissent que si le niveau de log de NestJS les
affiche. Les journaux d'étapes (`Étape [fetch] → ... éléments`) ne sortent que
pour une formule calculée en entier par `interpret()`, pas pour un calcul
différentiel.

---

## Fiabilité et reprise sur panne

Le motif outbox évite de perdre un événement :

- **Si le relais (côté LMS hôte) s'arrête** : les événements s'accumulent dans `platon_outbox_events`. Au redémarrage, il reprend depuis `indicateurs_outbox_cursor.last_id`.
- **Si RabbitMQ s'arrête** : le relais ne peut pas publier ; il s'arrête au premier message en erreur sans avancer le curseur. Une fois RabbitMQ revenu, il republie les événements non encore publiés.
- **Si un consumer (côté Indicateurs) lève une erreur** : la bibliothèque `@golevelup/nestjs-rabbitmq` remet le message dans la file (comportement par défaut), et il est retraité. Il n'y a ni limite de tentatives ni file d'erreurs : un message qui échoue toujours revient sans fin (readme, section 13.10). La plupart des erreurs de calcul sont toutefois interceptées et seulement écrites dans les logs, sans remettre le message en file.
- **Rejeu** : si le même événement est traité deux fois, la valeur est recalculée à partir des mêmes données, donc le résultat est identique.
