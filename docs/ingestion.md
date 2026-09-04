# Pipeline d'ingestion des événements PLaTon → Indicateurs

## Vue d'ensemble

Quand un apprenant répond à un exercice dans PLaTon, la valeur de ses indicateurs se met à jour automatiquement en temps réel. Ce document décrit toutes les couches de ce pipeline.

```
SessionData (PLaTon DB)
       │ trigger PostgreSQL
       ▼
platon_outbox_events
       │ relais NestJS (toutes les 2s, côté LMS hôte - voir étape 2)
       ▼
RabbitMQ : exchange platon.events (topic)
   │  routing key = event_type (dynamique, ex: "exercice.completed")
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
# Login : voir RABBITMQ_USER/RABBITMQ_PASSWORD dans .env (jamais guest/guest,
# voir docker.md - un conteneur "rabbitmq" lancé à la main comme ci-avant
# entre en conflit de port avec indicateurs_rabbitmq)
```

### Variables d'environnement (api/.env)

```env
RABBITMQ_URI=amqp://indicateurs:<mot-de-passe>@localhost:5672
```

---

## Étape 1 - Table outbox (PLaTon DB)

### Installation (à exécuter une seule fois sur la BDD PLaTon)

```bash
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d platon \
  -f api/scripts/migrations/platon-outbox.sql
```

### Ce que le script crée

**Uniquement la table `platon_outbox_events`** - reçoit un enregistrement à
chaque événement produit par un déclencheur installé (voir étape 1bis) :

| Colonne      | Type        | Description                                              |
|--------------|-------------|-----------------------------------------------------------|
| `id`         | BIGSERIAL   | Clé primaire auto-incrémentée                              |
| `event_type` | VARCHAR     | `raw:<Table>` (déclencheur générique installé via l'admin) |
| `payload`    | JSONB       | Dépend du déclencheur - voir étape 1bis                    |
| `created_at` | TIMESTAMPTZ | Horodatage automatique                                     |

**Aucun déclencheur n'est créé par ce script**, par choix délibéré : tous les
déclencheurs, y compris pour `exercise.answered`, se créent depuis
l'administration Indicateurs (étape 1bis) - jamais codés en dur dans une
migration SQL manuelle, pour que la logique reste entièrement pilotable
sans redéploiement.

### Vérifier qu'un déclencheur est en place

```bash
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d platon -c \
  "SELECT trigger_name, event_object_table FROM information_schema.triggers
   WHERE trigger_name LIKE 'trg_platon_outbox_generic_%';"
```

(Vide tant qu'aucune règle n'a été installée depuis l'admin - normal juste
après l'exécution du script ci-dessus.)

---

## Étape 1bis - Déclencheurs dynamiques (no-redeploy réel)

Tous les déclencheurs se créent depuis l'admin (**Indicateurs → "Événements &
déclencheurs"**), sans exception - aucun n'est câblé en dur dans le code ou
dans une migration SQL. Pour ajouter un nouvel événement (nouvelle table,
nouvelle colonne, nouvelle condition), rien à toucher côté code.

### Principe

```
Table PLaTon (INSERT/UPDATE)
       │ trigger générique installé via l'admin (fn_platon_outbox_generic)
       ▼
platon_outbox_events   (event_type = 'raw:<Table>', payload = {table, op, new, old})
       │ OutboxRelayService.relay() - côté LMS hôte, republie tel quel (étape 2)
       ▼
RabbitMQ (message reçu par les deux consumers Indicateurs)
       │ EventClassifierService.classify(), dans chaque consumer (étape 3)
       ▼
  type commence par 'raw:' ?
       │
       ├─ NON → traité tel quel comme événement déjà résolu (supporté mais
       │        inutilisé aujourd'hui - tous les déclencheurs installés
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

1. **"Nouvelle règle"** → wizard guidé : table PLaTon → colonne surveillée →
   opération (INSERT/UPDATE/les deux) → condition (`always`/`changed`/
   `equals`/`not_equals`/`threshold_crossed`) → mapping contexte (colonnes →
   `userId`/`courseId`/`activityId`/`sessionId`) → type d'événement (existant
   ou nouveau). `POST /api/event-rules` - **aucun SQL exécuté à cette étape**,
   juste enregistrement.
2. **"Installer"** (icône ⚡) → ouvre un aperçu du SQL (`GET
   /api/event-rules/:id/preview-sql`) - toujours sans effet. Le bouton
   **"Confirmer l'installation"** exécute réellement le DDL
   (`POST /api/event-rules/:id/install`) : `CREATE OR REPLACE FUNCTION
   fn_platon_outbox_generic()` (idempotente, partagée par toutes les tables)
   puis `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER trg_platon_outbox_generic_
   <table>` avec la liste de colonnes surveillées recalculée (union de toutes
   les règles actives et déjà installées sur cette table).
3. **"Supprimer"** (icône corbeille) : si le trigger n'est pas installé, retrait
   simple de la règle. S'il est installé, ouvre le même type d'aperçu SQL, mais
   pour un retrait - qui **réduit** le trigger (recalcule les colonnes sans
   celle de la règle supprimée) s'il est partagé par d'autres règles actives
   sur la même table, ou le supprime entièrement sinon.

### Droits Postgres requis - `PLATON_DB_ADMIN_USERNAME`/`PASSWORD`

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
  DDL directement via cette connexion (ouverte le temps de la requête, puis
  fermée) - **aucune modification d'ownership**, rien à restaurer. Sans elles,
  l'installation tente la connexion applicative habituelle et affiche le SQL
  en repli si les droits manquent (message d'erreur explicite dans la modale).

### Exemple : recréer `exercise.answered`

Cas d'usage central du projet (réponse à un exercice) - pas de traitement
spécial, une règle comme les autres : table `SessionData`, colonne surveillée
`grade`, condition `always`, mapping contexte `user_id`/`course_id`/
`activity_id`/`id`, type d'événement `exercise.answered`. `exercise.answered`
n'apparaît dans le sélecteur "configuré" du wizard d'indicateur qu'une fois
cette règle créée **et** installée - avant ça, aucun indicateur qui en
dépend ne peut être configuré.

---

## Étape 2 - Relais (Outbox → RabbitMQ) - côté LMS hôte, pas Indicateurs

**Ce relais ne vit pas dans ce dépôt** : il tourne côté LMS hôte (PLaTon), lit
sa propre base, et publie vers RabbitMQ (hébergé par Indicateurs), sans jamais
avoir besoin d'accéder à la base Indicateurs. Fichier prêt à copier et guide
complet : [`integration-platon-relay.md`](./integration-platon-relay.md).

Le relais republie chaque ligne de `platon_outbox_events` **telle quelle**,
sans l'interpréter (voir §"Principe" du guide ci-dessus) - la classification
des événements génériques (`raw:<Table>`) se fait dans les consumers, étape 3
ci-dessous.

Le curseur de position (`indicateurs_outbox_cursor`) vit côté LMS hôte, dans
sa propre base.

---

## Étape 3 - Consumers RabbitMQ

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
  pipeline s'y prête, recalcul complet sinon - voir `calcul-differentiel.md`).
  `courseId` n'est résolu via PLaTon que si la formule en a réellement besoin
  (`isCourseAware` - voir définition d'`activity-aware`/`course-aware` dans
  [`parcours-donnees.md` §0](./parcours-donnees.md#0-conventions)) ;
  `computeViewIncremental` choisit lui-même `activityId` ou `courseId` selon
  ce que la formule déclare.
- **Résultat :** met à jour `indicator_values` pour `(indicatorId, learner, userId)` + émet WS

### Consumer `indicators.aggregate`

- **Ce qu'il traite :** tous les indicateurs `contextType ≠ 'learner'`
- **Comment :** `getAffectedIndicators()` filtre `contextType !== 'learner'` → `processAggregateIndicator()` dispatch par contextType :

| contextType | Action |
|---|---|
| `activity` | `computeViewIncremental(activityId)` + emit WS |
| `course` | `computeViewIncremental(courseId)` + emit WS |
| `group`, activity-aware | `refreshSnapshots({activityId})` + `refreshActivityViews()` (émettent WS eux-mêmes) |
| `group`, course-aware | `refreshSnapshots({courseId})` + `refreshCourseGroupViews()` (agrège toutes les activités du cours pour ce groupe) |
| `teacher` | `getTeacherByCourse(courseId)` → `computeViewIncremental` + emit WS |
| `admin` + futurs | `refreshCachedContextValues()` (différentiel si le pipeline s'y prête, recalcul complet sinon) |

Toutes ces branches tentent d'abord le calcul différentiel et ne retombent
sur un recalcul complet que si le pipeline n'est pas reconnu automatiquement
(voir `calcul-differentiel.md`).

---

## Étape 4 - WebSocket temps réel

**Fichier :** `api/src/modules/features/ingestion/indicators.gateway.ts`

`'indicator.updated'` n'est **pas** un des événements métier de l'étape 1bis
(`exercise.answered` et compagnie, configurables en admin, potentiellement
des dizaines). C'est un signal interne à ce dépôt, un seul nom, toujours le
même, qui ne veut dire qu'une chose : *"un indicateur vient d'être recalculé,
sa valeur a peut-être changé"* - peu importe quel événement métier (ou quel
recalcul périodique sans déclencheur) en est la cause.

```
exercise.answered, activity.completed, ... (autant que voulu, définis en admin)
       │
       ▼
requiredEvents matché → indicateur recalculé
       │
       ▼
emitUpdated() - IngestionService (étape 3) ou IndicatorsService (refresh de snapshots/vues)
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

**Côté Angular** - `IndicatorSocketService` :
- Se connecte automatiquement au montage du premier `IndicatorCardComponent`
- Filtre les événements par `(indicatorId, contextType, contextId)`
- Met à jour la valeur de la card sans rechargement via `markForCheck()`

---

## Commandes de test

### Prérequis

```bash
# Terminal 1 - démarrer RabbitMQ (et le reste de l'infra locale)
cd indicateurs && ./bin/docker/up.sh

# Terminal 2 - démarrer le backend
cd indicateurs/api && yarn start

# Terminal 3 - démarrer le frontend (optionnel pour le test WebSocket)
cd indicateurs/frontend && ng serve
```

### Test 1 - Publication directe sur RabbitMQ (bypass outbox ET relais)

Le relais tournant côté LMS hôte (étape 2), le tester en local ici n'a pas de
sens direct. Pour tester uniquement les consumers + la
classification (étape 3), publier un événement générique directement sur
l'exchange, via l'API HTTP de gestion de RabbitMQ (identifiants dans `.env`,
UI sur `http://localhost:15672`) - simule exactement ce que le relais
publierait pour une ligne `raw:SessionData` :

```bash
curl -u "$RABBITMQ_USER:$RABBITMQ_PASSWORD" -X POST \
  http://localhost:15672/api/exchanges/%2f/platon.events/publish \
  -H "Content-Type: application/json" -d '{
    "properties": {},
    "routing_key": "raw:SessionData",
    "payload_encoding": "string",
    "payload": "{\"type\":\"raw:SessionData\",\"table\":\"SessionData\",\"op\":\"UPDATE\",\"new\":{\"id\":\"3fd495b1-4ffd-4d6b-86cb-6c99caa77e17\",\"user_id\":\"e901cddd-0e08-4a3d-8aad-4d2c49f39fdd\",\"activity_id\":\"53100bc2-e4a7-470b-95ea-bcf65a5d0f2d\",\"course_id\":\"02055cfb-eb0a-41c0-86f6-601feef99598\",\"attempts_at_success\":6},\"old\":{\"attempts_at_success\":5}}"
  }'
```

`table`/colonnes à adapter à une règle réellement active et installée (voir
`SELECT * FROM indicator_event_rules` en base `indicators`) - `attempts_at_success`
correspond à la règle "Exercice complet" (`exercice.completed`) installée par
défaut pour ce guide (§0).

### Test 2 - Déclenchement via trigger (simulation réaliste, bout en bout)

Nécessite le relais réellement démarré (côté LMS hôte, voir
`integration-platon-relay.md`) - sans lui, l'événement s'accumule dans
`platon_outbox_events` mais n'atteint jamais RabbitMQ. Met à jour une session
réelle → le trigger générique installé depuis l'admin écrit dans l'outbox
automatiquement :

```bash
# Exercice 1 : [Projet 2025] Activité de tests
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d platon -c "
UPDATE \"SessionData\"
SET attempts_at_success = attempts_at_success + 1
WHERE id = '3fd495b1-4ffd-4d6b-86cb-6c99caa77e17';"

# Exercice 2 : [Projet 2025] Compteur Allocations
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d platon -c "
UPDATE \"SessionData\"
SET attempts_at_success = attempts_at_success + 1
WHERE id = '2871a397-cf72-49c8-b8c1-1ce7d8cb9b9d';"
```

**Contexte de ces sessions :**

| Champ       | Valeur                                         |
|-------------|------------------------------------------------|
| Étudiant    | `e901cddd-0e08-4a3d-8aad-4d2c49f39fdd`       |
| Cours       | Initiation à la Prog C                         |
| Activité    | [Projet 2025] Activité de tests               |
| Indicateur  | Tentatives avant réussite - Apprenant         |
| Calcul      | Moyenne des tentatives par exercice réussi    |

### Test 3 - Vérifications post-traitement

```bash
# Vérifier que l'outbox a bien reçu les événements
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d platon -c \
  "SELECT id, event_type, payload->>'attempts' AS attempts, created_at
   FROM platon_outbox_events ORDER BY id DESC LIMIT 5;"

# Vérifier que le curseur a avancé (BDD PLaTon, voir étape 2)
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d platon -c \
  "SELECT * FROM indicateurs_outbox_cursor;"

# Vérifier la valeur calculée de l'indicateur
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d indicators -c \
  "SELECT id_def.name, iv.\"contextType\", iv.value, iv.\"updatedAt\"
   FROM indicator_values iv
   JOIN indicator_definitions id_def ON id_def.id = iv.\"indicatorId\"
   WHERE iv.\"contextId\" = 'e901cddd-0e08-4a3d-8aad-4d2c49f39fdd'
   ORDER BY iv.\"updatedAt\" DESC LIMIT 10;"
```

---

## Lecture des logs NestJS

Lors du traitement d'un événement, les logs apparaissent dans deux applications
distinctes : le relais tourne côté LMS hôte (ses logs à lui, hors de ce dépôt),
les consumers côté Indicateurs :

```
# Relay - côté LMS hôte (PLaTon), logs distincts de ceux d'Indicateurs
[OutboxRelayService]        DEBUG Relay : 1 événement(s) publié(s) (curseur → 7)

# 2 consumers reçoivent en parallèle, côté Indicateurs
[IngestionConsumerService]  LOG [learner]    ← événement reçu user=e901cddd... session=3fd495b1...
[IngestionConsumerService]  LOG [aggregate]  ← événement reçu activity=53100bc2...

# Consumer learner - classification puis formule exécutée
[IngestionService]          LOG [learner] 4 indicateur(s) à traiter event="exercice.completed"
[FormulaInterpreterService] DEBUG Étape [fetch] → 2 éléments
[FormulaInterpreterService] DEBUG Étape [aggregate] → 8
[IngestionService]          LOG [indicator] ✓ mis à jour "Tentatives avant réussite - Apprenant"
                                             (learner) user=e901cddd : 7 → 8 [complet]

# WebSocket - broadcast aux clients connectés
[IndicatorsGateway]         DEBUG WS broadcast: "Tentatives avant réussite..." value=8

# Confirmation consumer
[IngestionConsumerService]  LOG [learner] ✓ traité en 114ms user=e901cddd...
```

---

## Fiabilité et reprise sur panne

Le pattern Outbox garantit zéro perte d'événement :

- **Si le relais (côté LMS hôte) s'arrête** : les événements s'accumulent dans `platon_outbox_events`. Au redémarrage, il reprend depuis `indicateurs_outbox_cursor.last_id`.
- **Si RabbitMQ s'arrête** : le relais ne peut pas publier → il s'arrête au premier message en erreur sans avancer le curseur. À la reconnexion de RabbitMQ, il retraite les événements non-publiés.
- **Si un consumer (côté Indicateurs) échoue** : RabbitMQ requeue le message. Le message sera retraité au prochain cycle.
- **Idempotence** : si le même événement est traité deux fois, la valeur est recalculée depuis les données PLaTon → le résultat est identique.

---

## IDs de référence (environnement de développement)

| Ressource   | ID                                     |
|-------------|----------------------------------------|
| Étudiant    | `e901cddd-0e08-4a3d-8aad-4d2c49f39fdd` |
| Enseignant  | `ee225671-e8b5-422d-9191-7189a5be58c8` |
| Admin       | `055dc07c-3f4a-41d8-8d2d-828b75d441b4` |
| Cours       | `02055cfb-eb0a-41c0-86f6-601feef99598` (Initiation à la Prog C) |
| Activité    | `53100bc2-e4a7-470b-95ea-bcf65a5d0f2d` ([Projet 2025] Activité de tests) |
| Session 1   | `3fd495b1-4ffd-4d6b-86cb-6c99caa77e17` ([Projet 2025] Activité de tests) |
| Session 2   | `2871a397-cf72-49c8-b8c1-1ce7d8cb9b9d` ([Projet 2025] Compteur Allocations) |
