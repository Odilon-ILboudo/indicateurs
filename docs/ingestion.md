# Pipeline d'ingestion des événements PLaTon → Indicateurs

## Vue d'ensemble

Quand un apprenant répond à un exercice dans PLaTon, la valeur de ses indicateurs se met à jour automatiquement en temps réel. Ce document décrit toutes les couches de ce pipeline.

```
SessionData (PLaTon DB)
       │ trigger PostgreSQL
       ▼
platon_outbox_events
       │ relay NestJS (toutes les 2s)
       ▼
RabbitMQ : exchange platon.events (topic)
   │  routing key = event_type (dynamique, ex: "exercise.answered")
   ├── queue indicators.learner   → onLearnerEvent   (contextType = 'learner')
   └── queue indicators.aggregate → onAggregateEvent (contextType ≠ 'learner')
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

## Étape 1 - Trigger PostgreSQL (PLaTon DB)

### Installation (à exécuter une seule fois sur la BDD PLaTon)

```bash
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d platon \
  -f api/scripts/migrations/platon-outbox.sql
```

### Ce que le script crée

**Table `platon_outbox_events`** - reçoit un enregistrement à chaque réponse :

| Colonne      | Type        | Description                                              |
|--------------|-------------|-----------------------------------------------------------|
| `id`         | BIGSERIAL   | Clé primaire auto-incrémentée                              |
| `event_type` | VARCHAR     | Toujours `exercise.answered`                               |
| `payload`    | JSONB       | userId, sessionId, activityId, courseId, grade, attempts, timestamp |
| `created_at` | TIMESTAMPTZ | Horodatage automatique                                     |

**Trigger `trg_platon_outbox_session_data`** - se déclenche sur `SessionData` après `INSERT OR UPDATE OF grade`.

### Vérifier que le trigger est en place

```bash
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d platon -c \
  "SELECT trigger_name FROM information_schema.triggers
   WHERE event_object_table = 'SessionData';"
```

---

## Étape 1bis - Déclencheurs dynamiques (no-redeploy réel)

Le trigger de l'étape 1 est câblé en dur : il ne produit **que** `exercise.answered`,
sur `SessionData.grade`. Pour ajouter un nouvel événement (une autre table, une
autre colonne, une autre condition) sans toucher au code, il existe un second
mécanisme, entièrement piloté depuis l'admin (**Indicateurs → "Événements &
déclencheurs"**).

### Principe

```
Table PLaTon (INSERT/UPDATE)
       │ trigger générique installé via l'admin (fn_platon_outbox_generic)
       ▼
platon_outbox_events   (event_type = 'raw:<Table>', payload = {table, op, new, old})
       │ IngestionRelayService.relay()
       ▼
  event_type commence par 'raw:' ?
       │
       ├─ NON → republié tel quel (chemin historique, ex. exercise.answered)
       │
       └─ OUI → classify() : évalue chaque IndicatorEventRule active
                (table, colonne surveillée, condition, mapping contexte)
                → 0..N messages RabbitMQ, un par règle qui matche
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

### Événement historique `exercise.answered`

Le trigger `trg_platon_outbox_session_data` (étape 1 ci-dessus) tourne de
façon autonome, indépendamment de tout `IndicatorEventRule` - rien dans ce
mécanisme n'y touche. Aucune règle ne le référence par défaut :
`exercise.answered` n'apparaît dans le sélecteur "configuré" du wizard
d'indicateur qu'une fois qu'une règle équivalente est créée via "Nouvelle
règle" (table `SessionData`, colonne `grade`, condition `always`, mapping
`user_id`/`course_id`/`activity_id`/`id`) puis installée.

---

## Étape 2 - Relay NestJS (Outbox → RabbitMQ)

**Fichier :** `api/src/modules/features/ingestion-relay/ingestion-relay.service.ts`

Le relay s'exécute toutes les **2 secondes** via un `@Cron`. Il :
1. Lit `platon_outbox_events` où `id > last_id` (lecture seule sur PLaTon DB)
2. Si `event_type` commence par `raw:` (trigger générique, voir étape 1bis) →
   `classify()` détermine le(s) `event_type` métier réel(s) via les règles
   actives. Sinon, injecte simplement le champ `type` depuis la colonne
   `event_type` dans le payload (chemin historique, inchangé).
3. Publie chaque événement dans RabbitMQ
4. Met à jour le curseur `ingestion_cursors.last_id` dans la BDD indicators

**Curseur de position** - table `ingestion_cursors` (indicators DB) :

| Colonne       | Description                                   |
|---------------|-----------------------------------------------|
| `stream_name` | `platon_outbox` (clé primaire)               |
| `last_id`     | Dernier id traité - garantit zéro perte       |
| `updated_at`  | Mis à jour à chaque batch                     |

### Vérifier la position du curseur

```bash
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d indicators -c \
  "SELECT * FROM ingestion_cursors;"
```

---

## Étape 3 - Consumers RabbitMQ

**Fichier :** `api/src/modules/features/ingestion/ingestion-consumer.service.ts`

Deux consumers avec routing key `'#'` (reçoivent tous les types d'événements) :

### Consumer `indicators.learner`

- **Ce qu'il traite :** indicateurs `contextType = 'learner'`
- **Comment :** `ingestForContext(raw, 'learner')` appelle directement
  `IndicatorsService.computeViewIncremental()` (calcul différentiel si le
  pipeline s'y prête, recalcul complet sinon - voir `calcul-differentiel.md`).
  `courseId` n'est résolu via PLaTon que si la formule en a réellement besoin
  (`isCourseAware`) ; `computeViewIncremental` choisit lui-même `activityId`
  ou `courseId` selon ce que la formule déclare.
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

Après chaque mise à jour d'une valeur, `IngestionService` émet l'événement `indicator.updated` via `EventEmitter2`. Le gateway le capte avec `@OnEvent('indicator.updated')` et le broadcaste à tous les clients connectés via socket.io sur le namespace `/indicators`.

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

### Test 1 - Écriture directe dans l'outbox (bypass trigger)

Utile pour tester le relay et les consumers sans modifier PLaTon :

```bash
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d platon -c "
INSERT INTO platon_outbox_events (event_type, payload)
VALUES ('exercise.answered', jsonb_build_object(
  'userId',     'e901cddd-0e08-4a3d-8aad-4d2c49f39fdd',
  'sessionId',  '3fd495b1-4ffd-4d6b-86cb-6c99caa77e17',
  'activityId', '53100bc2-e4a7-470b-95ea-bcf65a5d0f2d',
  'courseId',   '02055cfb-eb0a-41c0-86f6-601feef99598',
  'grade',      100,
  'attempts',   6
));"
```

### Test 2 - Déclenchement via trigger (simulation réaliste)

Met à jour une session réelle → le trigger écrit dans l'outbox automatiquement.  
⚠️ Il faut inclure `grade = grade` pour que le trigger `UPDATE OF grade` se déclenche même si seul `attempts` change :

```bash
# Exercice 1 : [Projet 2025] Activité de tests
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d platon -c "
UPDATE \"SessionData\"
SET attempts = attempts + 1, grade = grade
WHERE id = '3fd495b1-4ffd-4d6b-86cb-6c99caa77e17';"

# Exercice 2 : [Projet 2025] Compteur Allocations
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d platon -c "
UPDATE \"SessionData\"
SET attempts = attempts + 1, grade = grade
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

# Vérifier que le curseur a avancé
PGPASSWORD=test psql -h localhost -p 5432 -U platon -d indicators -c \
  "SELECT * FROM ingestion_cursors;"

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

Lors du traitement d'un événement, les logs suivants apparaissent dans l'ordre :

```
# Relay - lit l'outbox et publie
[IngestionRelayService]    DEBUG Relay : 1 événement(s) publiés (cursor → 7)

# 2 consumers reçoivent en parallèle
[IngestionConsumerService]  LOG [learner]    ← événement reçu user=e901cddd... session=3fd495b1...
[IngestionConsumerService]  LOG [aggregate]  ← événement reçu activity=53100bc2...

# Consumer learner - formule exécutée
[IngestionService]          LOG [learner] 4 indicateur(s) à traiter event="exercise.answered"
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

- **Si NestJS s'arrête** : les événements s'accumulent dans `platon_outbox_events`. Au redémarrage, le relay reprend depuis `ingestion_cursors.last_id`.
- **Si RabbitMQ s'arrête** : le relay ne peut pas publier → il s'arrête au premier message en erreur sans avancer le curseur. À la reconnexion de RabbitMQ, le relay retraite les événements non-publiés.
- **Si un consumer échoue** : RabbitMQ requeue le message. Le message sera retraité au prochain cycle.
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
