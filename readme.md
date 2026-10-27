# Indicateurs : documentation complète du projet

Ce document décrit le dépôt `indicateurs/` : architecture, modèle de
données, moteur de calcul DSL, routes API, frontend, sécurité, limites connues,
choix techniques et câblage avec PLaTon.
L'objectif est qu'une lecture complète de ce fichier suffise à comprendre le
fonctionnement global du projet sans avoir à parcourir tout le code source.

> Documents complémentaires :
> - [`docs/deploiement/platon-local-setup.md`](docs/deploiement/platon-local-setup.md) : installer
>   l'environnement de développement sur une nouvelle machine, étape par étape.
> - [`docs/guides/guide-creation-indicateur.md`](docs/guides/guide-creation-indicateur.md) : guide de création d'un indicateur, illustré par
>   l'exemple « tentatives avant première réussite » (22 cas prêts à importer, les 6 `contextType`).
> - [`docs/fonctionnement/parcours-donnees.md`](docs/fonctionnement/parcours-donnees.md) : pour chaque écran, la chaîne
>   de fichiers de l'écran à la base, et ce que chaque action écrit en plus de répondre.
> - [`docs/platon-integration/integration-indicateurs.md`](docs/platon-integration/integration-indicateurs.md) et
>   [`docs/platon-integration/integration-platon.md`](docs/platon-integration/integration-platon.md) : le second point
>   d'entrée de build (`indicateurs-embed`, voir section 10 « Point d'entrée embarqué »),
>   qui expose `<indicateurs-app>` comme Web Component intégrable dans un LMS
>   hôte (PLaTon aujourd'hui, potentiellement un autre demain).
> - [`docs/platon-integration/integration-platon-relay.md`](docs/platon-integration/integration-platon-relay.md) : le
>   relais d'événements (`platon_outbox_events` → RabbitMQ, voir section 6bis et
>   `docs/fonctionnement/ingestion-evenements.md` étape 2), qui vit côté LMS hôte, pas dans ce dépôt ;
>   fichiers prêts à copier dans `docs/platon-integration/`.

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Démarrage](#2-démarrage)
3. [Architecture des dossiers](#3-architecture-des-dossiers)
4. [Bases de données](#4-bases-de-données)
5. [Modèle de données : entités `indicators`](#5-modèle-de-données--entités-indicators)
6. [Moteur DSL : calcul des indicateurs](#6-moteur-dsl--calcul-des-indicateurs)
6bis. [Déclencheurs dynamiques (event-rules)](#6bis-déclencheurs-dynamiques-event-rules)
7. [Modèle : contextType + visualizations](#7-modèle--contexttype--visualizations)
8. [Familles d'indicateurs et visibilité par rôle](#8-familles-dindicateurs-et-visibilité-par-rôle)
9. [Routes API](#9-routes-api)
10. [Frontend](#10-frontend)
11. [Flux métier de bout en bout](#11-flux-métier-de-bout-en-bout)
12. [Sécurité et authentification](#12-sécurité-et-authentification)
13. [Choix techniques et câblage avec PLaTon](#13-choix-techniques-et-câblage-avec-platon)

---

## 1. Vue d'ensemble

Le projet est un microservice de **suivi de performance e-learning** pour la
plateforme PLaTon. Il combine :

- un **frontend Angular 18** (`frontend/`)
- un **backend NestJS** (`api/`, port 3001)
- un accès à la **base PLaTon** : surtout en lecture (données pédagogiques), avec
  quelques écritures précises décrites en section 4.1
- un stockage des définitions et valeurs d'indicateurs dans une **base
  `indicators` distincte** (lecture/écriture)

**Philosophie centrale : zéro redéploiement.** Un administrateur crée et configure
des indicateurs (formule de calcul, visualisations, seuils, contextes) entièrement
depuis l'interface. La formule est stockée en JSONB et interprétée à la volée par
un **moteur DSL « pipeline »** (voir section 6) : aucune modification de code ni
redéploiement n'est nécessaire pour ajouter un nouvel indicateur.

---

## 2. Démarrage

### Prérequis

- Node.js + yarn
- Deux bases PostgreSQL accessibles, sur le même serveur :
  - **PLaTon** (données pédagogiques existantes, surtout lues, voir section 4.1)
  - **indicators** (lecture/écriture ; schéma géré uniquement par les
    migrations TypeORM, `synchronize: false` en toute circonstance, y
    compris en développement)
- **RabbitMQ**, pour recevoir les événements de PLaTon (voir section 6bis)

L'installation complète (Docker, bases, RabbitMQ, données) est décrite dans
`docs/deploiement/platon-local-setup.md`.

### Variables d'environnement (`api/.env`)

`api/.env` ne s'écrit pas à la main : `./bin/generate-api-env.sh` le génère à
partir du `.env` racine. Les variables lues par l'API (`configuration.ts`) :

```env
# Connexion BDD PLaTon
PLATON_DB_HOST=
PLATON_DB_PORT=
PLATON_DB_USERNAME=
PLATON_DB_PASSWORD=
PLATON_DB_NAME=

# Connexion BDD indicators (lecture/écriture)
INDICATORS_DB_HOST=
INDICATORS_DB_PORT=
INDICATORS_DB_USERNAME=
INDICATORS_DB_PASSWORD=
INDICATORS_DB_NAME=

# Optionnel : identifiant Postgres à privilèges élevés (superuser, ou propriétaire
# des tables PLaTon concernées), utilisé uniquement pour exécuter le DDL d'installation
# des déclencheurs dynamiques (section 6bis). Sans lui, l'installation passe par la
# connexion habituelle et ne réussit que si ce compte a les droits nécessaires.
PLATON_DB_ADMIN_USERNAME=
PLATON_DB_ADMIN_PASSWORD=

NODE_ENV=development
PORT=3001
JWT_SECRET=
RABBITMQ_URI=amqp://<utilisateur>:<mot-de-passe>@localhost:5672

# Optionnel : fréquence du recalcul des indicateurs sans événement (cron, défaut chaque minute)
# TRIGGERLESS_RECALC_CRON=*/1 * * * *
```

### Lancer le projet

Backend et frontend n'ont pas de script racine commun : deux commandes,
dans deux terminaux.

```bash
cd api && yarn start
```

```bash
cd frontend && ng serve
```

Le backend écoute sur `http://localhost:3001`, préfixe global `/api`.
Le frontend est disponible sur `http://localhost:4200`.

---

## 3. Architecture des dossiers

### 3.1 Backend (`api/src/`)

```
main.ts                : bootstrap NestJS, préfixe /api, CORS, ValidationPipe global
app.module.ts          : module racine, importe tous les modules ci-dessous
modules/
  core/
    core.module.ts              : configuration + connexion TypeORM nommée 'indicators'
    config/configuration.ts     : lecture des variables d'env (port, BDD, JWT, cron, RabbitMQ)
    platon/platon.module.ts     : connexion à la BDD PLaTon (fournisseur PLATON_DATA_SOURCE)
    platon/platon.service.ts    : requêtes SQL brutes vers la BDD PLaTon utilisées par le DSL
    auth/auth.guard.ts          : vérifie le token Authorization: Bearer (voir section 12)
    guards/admin.guard.ts       : restreint une route au rôle 'admin' (lit request.user.id posé par AuthGuard)
    guards/indicator-visibility.guard.ts : refuse un indicateur que le rôle ne peut pas voir (section 8)
  features/
    indicators/                 : cœur du projet (entités, moteur DSL, CRUD, snapshots)
      entities/                 : 6 entités TypeORM de ce module (voir section 5 pour les 10 au total)
      interpreter/formula-interpreter.service.ts : moteur DSL (voir section 6)
      indicators.controller.ts  : toutes les routes /api/indicators*
      indicators.service.ts     : logique métier (computeView, recalculate, snapshots…)
    event-types/                : types d'événements gérés en BDD (CRUD, seed au démarrage)
    event-rules/                : déclencheurs dynamiques, règle → trigger PostgreSQL généré (section 6bis)
      event-classifier.service.ts : interprète un événement générique brut selon les règles actives
    indicator-pins/             : indicateurs figés par un enseignant sur un cours/activité (voir section 5)
    user-preferences/           : préférences d'affichage par utilisateur
    ingestion/                  : consumers RabbitMQ, passerelle WebSocket, service d'ingestion
      ingestion-consumer.service.ts : 2 consumers, routing key '#' (learner + aggregate)
      indicators.gateway.ts     : WebSocket /indicators, émet indicator.updated
      ingestion.service.ts      : aiguille chaque événement vers le calcul des indicateurs concernés
    outbox-maintenance/         : purge quotidienne de platon_outbox_events (> 7 jours) sur la BDD PLaTon
    aggregation/                : recalcul périodique des indicateurs actifs sans déclencheur (TRIGGERLESS_RECALC_CRON, voir section 6)
    courses/                    : cours, sections, activités, groupes, résultats ; ajoute, retire et modifie aussi des membres de cours (écriture, section 4.1)
    resources/                  : lecture des ressources PLaTon et de l'arbre de cercles
    users/                      : lecture des utilisateurs PLaTon
```

### 3.2 Frontend (`frontend/src/app/`)

```
app.routes.ts           : route racine, redirige vers /dashboard
core/
  auth/                             : AuthProvider (auth.types.ts, current-user.ts, remote-auth.provider.ts)
  guards/
    auth.guard.ts                   : exige un jeton dans localStorage, sinon renvoie vers /authentification
    indicator.guard.ts              : vérifie l'existence d'un indicateur :id (branché sur aucune route)
  interceptors/auth.interceptor.ts : injecte le Bearer token, gère les 401
                                      (déconnexion en standalone, ou événement
                                      indicateurs-token-expired en mode embarqué)
  models/indicator.model.ts        : types partagés (IndicatorDefinition, IndicatorVisualization…)
  tokens/
    embedded-mode.token.ts         : bascule standalone / embarqué
    route-base-path.token.ts       : préfixe des routes ('/dashboard' en standalone, racine en embarqué)
  services/
    indicator.service.ts           : client HTTP + caches (préférences viz, visibilité)
    indicator-list-state.service.ts : mémorise filtres et onglets des listes pendant la session
    indicator-socket.service.ts    : WebSocket (indicator.updated)
    dashboard-settings.service.ts  : indicateurs activés par l'utilisateur courant
    role.service.ts                : rôle courant + règles de visibilité (section 8)
    user.service.ts                : lecture d'un utilisateur par son id
features/
  authentification/       : page de connexion standalone
  dashboard/
    dashboard.page.ts/html         : coquille (sidebar + toolbar + router-outlet)
    pages/
      overview/                    : grille des indicateurs actifs
      indicators/                  : onglet « Indicateurs » : préférences, et gestion pour l'admin
      context-indicators/          : page utilisée uniquement par les routes embarquées (section 10)
      embed-test/                  : page de diagnostic du mode embarqué, jamais liée dans la navigation
      widgets/sidebar/ + toolbar/
  admin/
    admin-indicator-manager.component.ts  : table CRUD admin
    indicator-builder.component.ts        : wizard de création/édition (3 étapes, voir sections 6 et 7)
    event-rule-manager.component.ts       : écran « Événements & déclencheurs » (section 6bis)
    event-rule-builder.component.ts       : wizard guidé de création d'une règle
    event-rule-install-modal.component.ts : aperçu SQL + confirmation d'installation ou de retrait
  indicator-selector/    : l'utilisateur active ou désactive ses indicateurs
  indicator-detail/      : page détail d'un indicateur (un onglet par visualisation)
  pin-indicator-modal/   : figer un indicateur sur un cours ou une activité (enseignant, voir section 5)
  courses/               : pages « Cours » copiées et adaptées depuis PLaTon (voir 3.3)
shared/
  ui/indicator-card/ (dont indicator-config-modal.component.ts, réglages rapides d'affichage) + indicator-reuse-card/ + layout-block/
  utils/indicator-family-grouping.ts    : regroupement par famille (section 8)
  utils/indicator-chart-options.util.ts : options de graphique partagées (section 10)
  styles/                 : SCSS, thèmes Material clair et sombre, ng-zorro
```

### 3.3 Stubs PLaTon (`frontend/src/platon-stubs/`)

Les pages « Cours » viennent de PLaTon et ont été adaptées. Leurs dépendances
`@platon/*` et `@cisstech/nge/*` sont remplacées par des stubs locaux, via des
alias déclarés dans `tsconfig.json` :

| Stub (`src/platon-stubs/`) | Alias tsconfig |
|---|---|
| `core-common.ts` / `core-browser.ts` / `core-server.ts` | `@platon/core/common` / `@platon/core/browser` / `@platon/core/server` |
| `core-browser/user-search-bar/` | composant `UserSearchBarComponent` (ControlValueAccessor) |
| `course-common.ts` / `course-browser.ts` | `@platon/feature/course/{common,browser}` |
| `resource-browser/nge-ui-list/` | `@cisstech/nge/ui/list` (liste générique ; il n'y a pas de page Ressources) |
| `feature-result-common.ts` / `feature-result-browser.ts` | `@platon/feature/result/{common,browser}` |
| `feature-peer-browser.ts`, `shared-ui.ts` | `@platon/feature/peer/browser`, `@platon/shared/ui` |
| `nge-directives.ts`, `nge-pipes.ts` | `@cisstech/nge/{directives,pipes}` |

Points clés de ces stubs :
- `AuthService.ready()` lit l'utilisateur connecté depuis `localStorage.currentUser`
  (rempli à la connexion, section 12), avec un repli sur un utilisateur anonyme
  (`role: student`) s'il est absent.
- `CourseService` fait de **vrais appels HTTP** vers `/api/v1/courses*`
  (module `courses` du backend) pour la lecture, et pour trois écritures :
  ajouter un membre, le retirer, changer son rôle. Ces trois appels modifient
  réellement la table `CourseMembers` de PLaTon (section 4.1). Les autres
  opérations d'écriture (créer, déplacer, modifier un cours ou une activité…)
  ne font rien.
- Les composants UI (`UiLayoutTabsComponent`, `UiStatisticCardComponent`,
  `UiSearchBarComponent`, etc.) sont réimplémentés localement, sans dépendre
  du workspace Nx de PLaTon.

---

## 4. Bases de données

### 4.1 Base PLaTon

Toutes les tables du schéma `public` sont accessibles dynamiquement dans le
builder DSL, sans liste blanche de tables. Les noms sont vérifiés
(`information_schema` et une expression régulière contre l'injection SQL dans
`PlatonService.queryTable()`), et les colonnes au nom sensible (mot de passe,
e-mail, jeton, téléphone…) ne sont jamais renvoyées.

Tables principales :

| Table | Rôle |
|---|---|
| `SessionData` | Table dénormalisée : une ligne = une session utilisateur × exercice (`user_id`, `activity_id`, `course_id`, `resource_id`, `grade`, `attempts`, `created_at`, …). Table principale pour les formules. |
| `Sessions` / `Activities` / `Resources` / `Users` / `Courses` | Tables sources |
| `CourseMembers` (`course_id`, `user_id`, `role`) | Membres d'un cours (étudiants, enseignants) |
| `CourseGroups` (`id` UUID, `group_id` varchar, `course_id`, `name`) | Groupes de TP |
| `CourseGroupsMember` (`group_id` varchar, `user_id`) | Appartenance aux groupes |

**Ce qu'Indicateurs écrit dans la base PLaTon.** L'essentiel des accès est en
lecture, mais pas tout :

| Écriture | Où | Quand |
|---|---|---|
| Ajout, retrait et changement de rôle d'un membre de cours (`CourseMembers`) | `courses.service.ts` (`createMember`, `deleteMember`, `updateMemberRole`) | depuis les pages « Cours », par un admin ou un enseignant du cours |
| Suppression des lignes de plus de 7 jours de `platon_outbox_events` | `outbox-maintenance.service.ts` | chaque nuit à minuit |
| Création ou retrait de la fonction `fn_platon_outbox_generic` et d'un déclencheur par table | `event-rules.service.ts` | sur clic dans l'écran « Événements & déclencheurs » (section 6bis) |
| Création de la table `platon_outbox_events` | `api/scripts/migrations/platon-outbox.sql` | script à exécuter une fois, à la main |
| Ajout des colonnes `status` et `attempts_at_success` sur `SessionData`, et d'un déclencheur sur `Answers` | `api/src/scripts/migrations/` | scripts à exécuter une fois, à la main (voir ci-dessous) |

Une fois installés, les déclencheurs écrivent eux-mêmes dans PLaTon, dans la
transaction de la modification d'origine : une ligne dans `platon_outbox_events`
(section 6bis), et la colonne `attempts_at_success` (ci-dessous).

**Colonnes ajoutées sur `SessionData` par ce projet** (pas présentes dans
PLaTon d'origine ; scripts dans `api/src/scripts/migrations/`, à exécuter avec un
rôle Postgres propriétaire des tables, voir `PLATON_DB_ADMIN_*`) :
- **`status`** (`add-platon-status-column.sql`) : anticipe une colonne annoncée
  par l'équipe PLaTon. Le script la remplit une fois, à partir de
  `grade`, `attempts` et `started_at`. Valeurs :
  `non commencé | commencé | réussi | échoué | erreur`. Rien ne la tient à jour
  ensuite.
- **`attempts_at_success`** (`add-platon-attempts-at-success-column.sql`) :
  rang de la première réponse notée 100 parmi les réponses de la session
  (calculé depuis `Answers`), `NULL` si la session n'a jamais été réussie. Le
  script la remplit pour les données existantes, puis installe le déclencheur
  `trg_platon_attempts_at_success` sur `Answers`, qui la fixe à la première
  réussite suivante. À utiliser à la place de `attempts` pour tout calcul de
  type « tentatives avant réussite » : `attempts` continue d'augmenter après
  une réussite et donne un résultat faux si l'étudiant retente ensuite.

**Particularités du schéma PLaTon (à connaître pour écrire des requêtes ou des formules)** :
- `Activities` n'a **pas** de colonne `name` : le titre est dans
  `source->'variables'->>'title'`, avec repli sur `Resources.name` via
  `LEFT JOIN "Resources" r ON r.id = (a.source->>'resource')::uuid`.
- Les clés étrangères de PLaTon ne sont pas toutes visibles dans
  `information_schema` quand les tables appartiennent à un autre utilisateur
  PostgreSQL que celui d'Indicateurs. L'explorateur de schéma du wizard
  (`GET /api/indicators/schema/full`) les lit donc dans `pg_constraint`.

### 4.2 Base `indicators` (lecture/écriture)

Gérée par TypeORM, `synchronize: false` en toute circonstance (développement
compris) : le schéma n'évolue que par de vraies migrations TypeORM
(`api/src/migrations/`), jamais par synchronisation automatique, pour ne
jamais laisser le schéma dériver. 10 entités, détaillées section 5. La
migration initiale crée aussi une table `ingestion_cursors`, qu'aucun code
n'utilise.

---

## 5. Modèle de données : entités `indicators`

### `IndicatorDefinition` (table `indicator_definitions`)

La définition d'un indicateur.

| Champ | Type | Rôle |
|---|---|---|
| `id` | uuid | identifiant |
| `name` | string (unique) | nom affiché |
| `description` | text \| null | description |
| `contextType` | `'learner'\|'teacher'\|'admin'\|'course'\|'activity'\|'group'` | contexte unique de cet indicateur (voir section 7) ; vide seulement pour une ligne technique de famille |
| `familyName` | string \| null | regroupement nominal de plusieurs indicateurs créés ensemble sous une même famille (section 8) |
| `baseIndicatorId` | string \| null | indicateur à partir duquel celui-ci a été créé (réutilisation) ; traçabilité uniquement, aucun lien vivant : modifier l'indicateur de base n'a plus aucun effet après la création |
| `requiredEvents` | jsonb (string[]) | noms des événements qui déclenchent un recalcul (section 6bis) ; vide = recalcul périodique |
| `visualizations` | jsonb (`IndicatorVisualization[]`) | une ou plusieurs visualisations, c'est-à-dire des représentations différentes d'une même formule (section 7) |
| `isActive` | boolean | actif ou désactivé ; `false` par défaut à la création par l'API |
| `isComplete` | boolean | complétude réelle du formulaire, indépendante de `isActive` : `true` seulement si l'indicateur est enregistré depuis la dernière étape du wizard avec un contexte, au moins une visualisation et une formule ; `false` pour « Sauvegarder le brouillon » |
| `isFamilyPlaceholder` | boolean | ligne technique qui ne représente aucun indicateur réel : elle sert uniquement à faire exister une famille vide (pas de table dédiée, `familyName` est un simple champ partagé). Toujours `isActive=false`, jamais affichée aux utilisateurs finaux ; l'interface d'administration la supprime dès qu'un premier vrai indicateur rejoint la famille |
| `usageCount` | number | nombre d'utilisateurs qui ont activé l'indicateur (incrémenté et décrémenté par les préférences) |
| `formula` | jsonb \| null | **formule unique partagée par toutes les visualisations** (1 indicateur = 1 formule) |
| `thresholds` | jsonb \| null | seuils `{ good?: number; warning?: number; critical?: number }` qui colorent la carte : valeur ≤ `good` en vert, ≤ `warning` en orange, au-delà en rouge (une valeur basse est donc considérée comme bonne). `critical` ne sert qu'à la légende ; optionnel |
| `interpretationHint` | text \| null | aide à l'analyse : texte libre expliquant comment interpréter les résultats, affiché dans la page détail ; optionnel |
| `visibilityRoles` | jsonb (string[]) \| null | restreint la visibilité de cet indicateur à des rôles précis, à la place de la règle par défaut du `contextType`. Utile pour un indicateur course ou activity dont le résultat est nominatif et ne doit donc pas être montré aux étudiants ; optionnel |

### `IndicatorValue` (table `indicator_values`)

La valeur calculée pour un contexte donné.

- Contrainte unique `(indicatorId, contextType, contextId)`.
- `contextId` peut être une **clé composite** `contexte:portée`, construite par
  `resolveCacheContextId` (section 13.4.3) :
  - `learner`, `teacher`, `admin` : `userId`, ou `userId:activityId` si la
    formule filtre par activité, ou `userId:courseId` si elle filtre par cours ;
  - `course` : `courseId`, ou `courseId:activityId` quand une activité est
    précisée ;
  - `group` : `groupId:activityId`, ou `groupId:courseId` ;
  - `activity` : `activityId`.
- `value: float` : toujours présent (0 si le résultat n'est pas un nombre).
- `metadata: jsonb` : `{ lastUpdate, history, structuredValue?, incremental? }`.
  `structuredValue` porte les résultats non scalaires (bar-chart, histogram),
  `incremental` les valeurs intermédiaires du calcul différentiel (section
  13.4). `history` reçoit une entrée à chaque calcul, sans limite de taille.

### `IndicatorExecutionLog` (table `indicator_execution_logs`)

Une ligne par exécution complète d'une formule par `interpret()` (formule
non éligible au calcul différentiel, ou calcul fait à l'activation d'un
indicateur personnel) : `indicatorId`, `userId` (ou
`groupId`), `value`, `durationMs`, `error`, `executedAt`. Les calculs
différentiels et les calculs complets des formules éligibles n'y écrivent pas.

### `IndicatorFeedback` (table `indicator_feedback`)

Retour d'un utilisateur sur un indicateur : `indicatorId`, `userId`, `rating` (entier de 1 à 5), `comment`, `createdAt`. Chaque envoi crée une nouvelle ligne.

### `IndicatorNotification` (table `indicator_notifications`)

Notification liée à un indicateur (pas ciblée par utilisateur) : `indicatorId`, `title`, `message`, `createdAt`.

### `IndicatorEventType` (table `indicator_event_types`)

Types d'événements déclarés en BDD : `id`, `name`, `label`, `description`, `isActive`.
Gérés via `GET/POST/PATCH/DELETE /api/event-types`. Au démarrage, si la table est vide, l'API crée `exercise.answered`. `GET /api/event-types?configured=true` ne renvoie que les types associés à une `IndicatorEventRule` active **et** installée (voir section 6bis) : c'est ce filtre qui alimente le sélecteur du wizard d'indicateur. Un type encore utilisé par une règle ne peut pas être supprimé.

### `IndicatorEventRule` (table `indicator_event_rules`)

Une règle de classification : transforme un changement brut sur une table PLaTon en un `IndicatorEventType`. Voir section 6bis pour le détail complet.

| Champ | Rôle |
|---|---|
| `eventTypeId` | type d'événement produit si la règle matche |
| `sourceTable` / `watchedColumn` | table et colonne PLaTon surveillées ; sans `watchedColumn`, le déclencheur généré ne réagit qu'aux `INSERT` |
| `operation` | `INSERT` \| `UPDATE` \| `INSERT_OR_UPDATE` |
| `condition` | `{ kind: 'always'\|'changed'\|'equals'\|'not_equals'\|'threshold_crossed', value?, operator?, threshold? }` |
| `contextMapping` | colonnes source → `userId` (obligatoire) / `courseId` / `activityId` / `sessionId` |
| `triggerInstalled` / `installedAt` / `lastAppliedSql` / `lastInstallError` | suivi de l'installation réelle du trigger PostgreSQL |

### `IndicatorSnapshot` (table `indicator_snapshots`)

« Carte épinglée » d'un indicateur `group` pour une activité ou un cours donné
(panneau « Par groupe » de la page activité ou cours). Les doublons sont
empêchés par deux index uniques partiels en base (et non par une contrainte
`@Unique()`) : `activityId` et `courseId` sont mutuellement exclusifs, un seul
des deux est renseigné à la fois (contrainte `CHECK`). Champs : `contextId`
(= `groupId`), `activityId`, `courseId`, `title`.

### `IndicatorPin` (table `indicator_pins`)

Permet à un enseignant du cours (membre `teacher` dans `CourseMembers`) ou à
un admin de figer un indicateur existant sur un cours ou une activité précis :
la page de ce cours ou de cette activité l'affiche alors à tous ses membres,
quel que soit leur réglage personnel, avec des seuils propres à ce contexte.
Seuls les indicateurs de contexte `course` (page cours) ou `activity` (page
activité) sont concernés. Contrainte unique `(indicatorId, contextType, contextId)`.

| Champ | Rôle |
|---|---|
| `indicatorId` | indicateur figé |
| `contextType` | `'course'` \| `'activity'` |
| `contextId` | identifiant du cours ou de l'activité |
| `thresholdsOverride` | seuils propres à ce contexte `{ good?, warning?, critical? }`, remplacent ceux de l'indicateur ; optionnel |
| `pinnedByUserId` | enseignant à l'origine de l'épinglage |

Totalement indépendant de `UserIndicatorPreference` : aucune écriture croisée
entre les deux, pour ne jamais faire fuiter un indicateur épinglé sur les
autres cours/activités d'un membre, ni laisser une désactivation personnelle
effacer un indicateur figé par l'enseignant.

### `UserIndicatorPreference` (table `user_indicator_preferences`)

Préférences par utilisateur, contrainte unique `(userId, indicatorId)` :

| Champ | Rôle |
|---|---|
| `isVisible` | l'indicateur est-il activé dans le tableau de bord de cet utilisateur |
| `displayPreferences` | `{ icon?, color? }` |
| `activeVizId` | quelle visualisation est affichée par défaut |
| `enabledVizIds` | sous-ensemble des visualisations que l'utilisateur veut voir (`null` = toutes) |

---

## 6. Moteur DSL : calcul des indicateurs

Cœur du projet : `FormulaInterpreterService`
(`api/src/modules/features/indicators/interpreter/formula-interpreter.service.ts`).

### Principe

Une formule (`FormulaDefinition`) est une liste ordonnée d'**étapes**
(`FormulaStep[]`), chacune transformant la sortie de la précédente :

```typescript
interface FormulaDefinition {
  version: '1.0';
  pipeline: FormulaStep[];
}

interface FormulaStep {
  id: string;
  type: 'fetch' | 'join' | 'filter' | 'groupBy' | 'findFirst'
      | 'extract' | 'aggregate' | 'round' | 'divide' | 'js';
  label?: string;
  params: Record<string, any>;
}

interface FormulaContext {
  userId?: string;
  activityId?: string;
  courseId?: string;
  groupId?: string;
  indicatorId?: string;
}
```

`interpret(formula, context)` exécute le pipeline et retourne :
- `number` → valeur scalaire (card, gauge, line-chart)
- `object` → résultat structuré `{ clé: valeur }` (bar-chart)
- `array` → distribution `[{ bucket, count, users? }]` (histogram)
- `0` si le pipeline est vide ou si une étape échoue : l'erreur est écrite dans
  les logs du serveur (et dans `indicator_execution_logs` si l'indicateur est
  connu), mais **ne fait pas planter l'appelant**

`interpretWithSteps(formula, context)` exécute le même pipeline mais retourne le
**résultat de chaque étape** (`{ index, type, durationMs, output, error?, truncated? }`),
utilisé par le débogueur pas-à-pas du builder (`POST /preview-steps`). La sortie
affichée de chaque étape est limitée à 200 éléments, et les données passées
d'une étape à la suivante à 5 000 lignes.

### Catalogue des étapes

| Type | Rôle | Paramètres principaux |
|---|---|---|
| `fetch` | Charge des lignes depuis une table PLaTon, filtrées selon le contexte. | `table`, `contextFields: string[]` (`user_id`, `activity_id`, `course_id`, `group_id` → mappés depuis `FormulaContext`). Si `group_id` est demandé et que `context.groupId` est défini, déclenche une jointure `CourseGroupsMember`/`CourseGroups` via `queryTableForGroup` (nécessite `activityId` **ou** `courseId` dans le contexte : une seule activité, ou tout le cours si la formule est course-aware ; sinon l'étape renvoie `[]`). |
| `join` | LEFT/INNER/RIGHT/FULL JOIN entre la sortie courante (table gauche) et une seconde table PLaTon (table droite), indexée en `Map` (O(n)). | `table`, `leftKey`, `rightKey`, `contextFields?` (mêmes filtres que `fetch`), `joinType?: 'left'\|'inner'\|'right'\|'full'` (défaut `'left'`). En cas de fusion, les champs de gauche écrasent ceux de droite en cas de conflit de nom. `right`/`full` ajoutent les lignes droites jamais matchées. CROSS JOIN volontairement non supporté. |
| `filter` | Filtre les lignes selon `field operator value`. | `field`, `operator: '=='\|'!='\|'>'\|'<'\|'>='\|'<='`, `value`. Un opérateur inconnu **lève une erreur** (le pipeline s'arrête, résultat 0). |
| `groupBy` | Regroupe des lignes plates en `any[][]`. | `groupField` |
| `findFirst` | Pour chaque groupe (ou tableau plat), retourne une ligne (triée par `sortField` puis filtrée par `whereField == whereValue`, ou la première sinon). | `whereField?`, `whereValue?`, `sortField?` |
| `extract` | Extrait un champ numérique de chaque ligne (groupes ou plat) → `number[]`. | `extractField` |
| `aggregate` | Agrège un `number[]`. | `aggregateFn: 'avg'\|'sum'\|'count'\|'min'\|'max'` |
| `round` | Arrondit un nombre. | `decimals` (défaut 2) |
| `divide` | Divise par une constante (0 si `divideBy === 0`). | `divideBy` |
| `js` | Exécute du JS arbitraire ; `input` = sortie de l'étape précédente, doit `return` un résultat. | `code`, exécuté dans un **isolate V8 séparé** (`isolated-vm`, 32 Mo, 2 s maximum), après une analyse du texte qui refuse 13 motifs dangereux (section 13.3.2). |

Rétro-compatibilité : les anciens noms de table `sessions`/`activities` sont
mappés vers `SessionData`/`Activities` (`LEGACY_TABLE_MAP`).

### Exemple : « Tentatives moyennes avant première réussite »

Attention : `attempts` sur `SessionData` est un compteur cumulatif qui continue
d'augmenter même après une première réussite (si l'étudiant retente encore
après coup). Il ne faut donc jamais l'extraire directement pour mesurer « le
nombre de tentatives qu'il a fallu pour réussir ». La colonne
`attempts_at_success` (calculée depuis `Answers`, figée au moment de la
première réponse notée 100) porte la bonne valeur, déjà prête sur chaque
ligne : `groupBy` et `findFirst` ne sont donc pas nécessaires, un simple filtre
suffit :

```yaml
pipeline:
  - type: fetch
    label: Charger sessions
    params: { table: SessionData, contextFields: [user_id, activity_id] }
  - type: filter
    label: Sessions réussies
    params: { field: attempts_at_success, operator: ">", value: 0 }
  - type: extract
    label: Tentatives avant réussite
    params: { extractField: attempts_at_success }
  - type: aggregate
    label: Moyenne
    params: { aggregateFn: avg }
  - type: round
    label: Arrondir
    params: { decimals: 2 }
```

### `computeView` (`indicators.service.ts`) : calcul et cache

`POST /indicators/:id/compute-view` appelle `computeView(indicatorId, contextType,
contextId, activityId?, vizId?, forceRefresh?, courseId?)` :

- **Résolution de la formule** : `indicator.formula` ; toutes les visualisations partagent la même formule (**1 indicateur = 1 formule**).
- **Résolution `activityId`/`courseId`** : fournis par l'appelant, sans valeur par défaut, pour aucun contextType. `courseId` n'est pertinent que pour un indicateur `group` course-aware ou un indicateur personnel (`learner`/`teacher`/`admin`) dont la formule est course-aware (voir `isCourseAware()`) ; il est ignoré sinon.
- **Clé de cache** (`resolveCacheContextId()`, partagée avec `computeViewIncremental()`) : jamais de `vizId` (1 formule = 1 valeur, partagée par toutes les visualisations).
  - `course` → `${contextId}:${activityId}` quand une activité est fournie, sinon `contextId` seul.
  - `group` → `${contextId}:${activityId}` ou `${contextId}:${courseId}` selon que le groupe est scopé à une activité ou à tout le cours.
  - `learner`/`teacher`/`admin` → `contextId` seul (valeur globale), sauf si la formule est activity-aware (`${contextId}:${activityId}`) ou course-aware (`${contextId}:${courseId}`).
  - `activity` → `contextId` seul.
  - Si une `IndicatorValue` existe déjà pour cette clé et que `forceRefresh` est
    faux → retournée directement (pas de recalcul).
- **Résolution des noms d'utilisateurs** : si le résultat est un tableau avec un
  champ `userIds[]`, ces identifiants sont remplacés par « Prénom Nom » via
  `PlatonService.getUserNameMap()` avant stockage et retour. L'identifiant
  n'apparaît que pour un utilisateur sans prénom ni nom.

### Rafraîchissement après un événement

Après chaque événement PLaTon, `IngestionService` (section 6bis) recalcule
les indicateurs concernés, en passant le `deltaEvent` de l'événement. Avec un
`deltaEvent`, chaque méthode tente `computeViewIncremental()` (calcul
différentiel, voir
[`docs/fonctionnement/calcul-differentiel.md`](docs/fonctionnement/calcul-differentiel.md))
plutôt que `computeView(forceRefresh=true)` (recalcul complet). Ce qui est
recalculé dépend du `contextType` :

| `contextType` | Ce qui est recalculé |
|---|---|
| `learner` | la valeur de l'utilisateur de l'événement (file `indicators.learner`) |
| `activity` | la valeur de l'activité de l'événement |
| `course` | la valeur du cours de l'événement, pour l'activité de l'événement |
| `teacher` | la valeur du propriétaire du cours (`Courses.owner_id`) |
| `group` | voir les deux méthodes ci-dessous |
| `admin` (et tout autre) | voir `refreshCachedContextValues` ci-dessous |

Pour `group` et `admin`, trois méthodes de `IndicatorsService` :

1. `refreshSnapshots(indicatorId, scope, deltaEvent?)` : recalcule **toutes**
   les `IndicatorSnapshot` épinglées pour ce périmètre, pour chaque
   visualisation. `scope` est `{ activityId }` (une seule activité) ou
   `{ courseId }` (indicateur `group` course-aware, voir `isCourseAware()`).
   Les erreurs par snapshot sont écrites dans les logs sans bloquer les autres.

2. `refreshActivityViews(indicatorId, activityId, deltaEvent?)` : recalcule
   toutes les `indicator_values` de type `course`, `group` ou `activity` dont la
   clé contient cette `activityId` (recherche `LIKE` : la clé est l'activité
   elle-même, ou commence, finit ou contient `:activityId`). Elle déduit les
   couples uniques (contextType, identifiant d'origine) et recalcule chaque
   visualisation. Pour un indicateur `group` course-aware, l'équivalent est
   `refreshCourseGroupViews(indicatorId, courseId, deltaEvent?)`.

3. `refreshCachedContextValues(indicatorId, contextType, deltaEvent?)` :
   utilisée pour `admin`, dont les contextes concernés ne sont pas connus à
   l'avance. Elle relit toutes les clés déjà en cache pour ce
   `(indicatorId, contextType)` et les recalcule une par une.

Ces appels sont attendus (`Promise.allSettled`) avant de passer à
l'indicateur suivant, et un échec n'arrête pas les autres. Seules les valeurs
déjà calculées une fois sont rafraîchies : une vue jamais consultée n'a pas
de valeur en cache, et sera calculée à sa première consultation.

**Coût** : chaque événement déclenche le recalcul de toutes les vues déjà
consultées pour cette activité. Pour une activité avec beaucoup de groupes ou
de vues, cela peut représenter de nombreux calculs en arrière-plan. Aucune
limite ni regroupement des événements n'est en place.

### Recalcul (`recalculate`)

`POST /indicators/:id/recalculate` ne recalcule **que** les utilisateurs qui
ont une préférence enregistrée pour l'indicateur (table
`user_indicator_preferences`, y compris une préférence désactivée), et non
tous les utilisateurs. Il délègue toujours à `computeView(forceRefresh=true)` :

- Indicateur personnel (`learner`/`teacher`/`admin`) **non scopé** : une seule
  valeur globale par utilisateur.
- Indicateur personnel **scopé** (formule activity-aware ou course-aware) :
  une valeur par activité ou cours où l'utilisateur a une trace dans
  `SessionData`, chacune avec la même clé de cache que celle lue par
  `computeView()`.
- Indicateur `course`, `activity` ou `group` : le code passe aussi
  l'identifiant de l'utilisateur comme contexte, ce qui n'a pas de sens pour
  ces types (voir section 13.10).

C'est ce même mécanisme qu'utilise le recalcul périodique des indicateurs
sans déclencheur (`AggregationService.recalculateTriggerlessIndicators()`,
fréquence réglable par `TRIGGERLESS_RECALC_CRON`, chaque minute par défaut) :
un seul chemin de calcul pour le bouton admin et pour le minuteur.

### Import / export YAML / JSON dans le builder

Dans l'étape 3 du wizard, la construction du pipeline a deux modes :
**Visuel** et **Import**. Le panneau Import permet de coller ou modifier un
pipeline en YAML ou JSON (`{ pipeline: [{ type, label?, params }] }`), avec :
- une validation détaillée en français et une aide qui liste les 10 types
  d'étapes et leurs paramètres ;
- un refus explicite d'une étape au type inconnu (le message rappelle qu'il
  faut utiliser `type: js` avec `params.code` pour du JavaScript) ;
- un aller-retour : ouvrir « Import » pré-remplit le texte avec le pipeline
  courant (`pipelineToText`), ce qui permet de modifier, appliquer, rouvrir et
  modifier encore.

Un **débogueur pas-à-pas** (bouton « Déboguer pas à pas ») appelle
`POST /preview-steps` et affiche le contexte utilisé, puis chaque étape (type,
durée, aperçu des résultats sous forme de tableau, « Afficher tout » au-delà
de 5 lignes).

---

## 6bis. Déclencheurs dynamiques (`event-rules`)

Aucun événement n'est câblé en dur dans le code : `api/scripts/migrations/platon-outbox.sql`
crée uniquement la table `platon_outbox_events` (voir
[`docs/fonctionnement/ingestion-evenements.md`](docs/fonctionnement/ingestion-evenements.md) étape 1). Tous les déclencheurs, y
compris pour l'événement `exercise.answered` créé au démarrage, se créent depuis
l'écran admin **« Événements & déclencheurs »** (`event-rule-manager.component.ts`).
Cet écran s'ouvre depuis le wizard d'indicateur, par l'option « Autres
(configurer un nouvel événement…) » de la liste des événements déclencheurs :

1. **Créer une règle** (`event-rule-builder.component.ts`) : table PLaTon →
   colonne surveillée → opération → condition → mapping contexte (colonnes →
   `userId`/`courseId`/`activityId`/`sessionId`) → type d'événement (existant
   ou nouveau) → `POST /api/event-rules`. Aucun SQL exécuté à cette étape.
2. **Installer le trigger** (`event-rule-install-modal.component.ts`) :
   aperçu du SQL (`GET /api/event-rules/:id/preview-sql`), puis exécution
   réelle sur confirmation (`POST /api/event-rules/:id/install`). Elle crée
   ou met à jour un trigger générique `trg_platon_outbox_generic_<table>` (un
   par table, avec une fonction partagée `fn_platon_outbox_generic()`,
   réutilisée par toutes les tables).
3. **Désactiver** (`DELETE /api/event-rules/:id`) : la règle cesse de
   produire des événements, mais le trigger reste en place ; **Réactiver** la
   remet en service. **Supprimer définitivement**
   (`POST /api/event-rules/:id/hard-delete`) retire le trigger, ou le réduit
   s'il sert à d'autres règles actives sur la même table, puis efface la
   règle. Désactiver et supprimer sont refusés tant qu'un indicateur actif
   utilise l'événement de la règle. L'API propose aussi
   `POST /api/event-rules/:id/uninstall` (retirer le trigger puis désactiver),
   que l'écran n'utilise pas.

`EventClassifierService.classify()` (voir [`docs/fonctionnement/ingestion-evenements.md`](docs/fonctionnement/ingestion-evenements.md)
étape 3) évalue les règles actives contre chaque événement générique brut
(`event_type` préfixé `raw:`) pour déterminer le ou les événements métier
réels. Elle est appelée depuis les consumers RabbitMQ, pas depuis le relais :
celui-ci vit côté LMS hôte (voir [`docs/platon-integration/integration-platon-relay.md`](docs/platon-integration/integration-platon-relay.md))
et republie tout tel quel sans l'interpréter. Un message dont le type ne
commence pas par `raw:` est traité directement comme un événement déjà classé.

`DROP TRIGGER` exigeant en PostgreSQL la propriété de la table (pas juste un
privilège `GRANT`), l'installation peut échouer si le rôle applicatif n'est
pas propriétaire. Voir `PLATON_DB_ADMIN_USERNAME`/`PASSWORD` (section 2) pour
un contournement sans jamais modifier le propriétaire des tables.

---

## 7. Modèle : `contextType` + `visualizations[]`

**1 indicateur = 1 `contextType` unique**, mais peut avoir **N visualisations**
(`visualizations: IndicatorVisualization[]`), chacune avec :

```typescript
interface IndicatorVisualization {
  id: string;     // uuid stable, généré côté builder
  label: string;
  type: 'card' | 'gauge' | 'line-chart' | 'bar-chart' | 'histogram';
  icon?: string;
  color?: string;
  unit?: string;
  // Pas de formule propre ni de seuils : tout est au niveau de l'indicateur.
}
```

`contextType ∈ { learner, teacher, admin, course, activity, group }`.

### Sélection de la visualisation par l'utilisateur, enregistrée en BDD

Si un indicateur a plusieurs visualisations, l'utilisateur choisit laquelle
afficher. Le choix est enregistré dans `user_indicator_preferences.active_viz_id`
(pas dans `localStorage`), via `IndicatorService.setVizPreference()` (cache en
mémoire + `PATCH /preferences/:indicatorId`). Ce cache partagé garantit que la
carte et la page détail montrent la même visualisation.

- Sur la **carte** : aucun sélecteur visible ; la visualisation active est celle
  enregistrée (ou la première par défaut). Le changement se fait uniquement via
  la **fenêtre de réglages** (icône crayon).
- Sur la **page détail** : un onglet (`nz-tabset`) par visualisation, calculé
  seulement à son ouverture (`onVizTabChange`).

### Modal d'édition de la carte (`IndicatorConfigModalComponent`)

Le bouton crayon de chaque carte ouvre `IndicatorConfigModalComponent` via
`NzModalService.create()`. Les données sont transmises par
`ModalDataService.setData()` (service partagé), lu dans le `ngOnInit` de la
fenêtre.

La fenêtre permet de **cocher ou décocher les visualisations visibles** (au
moins une : la dernière cochée ne peut pas être décochée). La sélection est
enregistrée dans `user_indicator_preferences.enabled_viz_ids` via
`IndicatorService.setEnabledVizIds()`.

### Masquage de visualisations : `enabledVizIds`

L'utilisateur peut ainsi masquer certaines visualisations d'un indicateur
(`user_indicator_preferences.enabled_viz_ids`, `null` = toutes visibles). La
carte passe par un getter `visibleVisualizations` (filtre `isVizEnabled`, et
retour à toutes les visualisations si le filtre n'en laissait aucune) au lieu
de lire directement `indicator.visualizations`.

### Wizard admin (`indicator-builder.component.ts`) : 3 étapes

| Étape | Contenu |
|---|---|
| 1. Définition | Nom, description, aide à l'analyse (`interpretationHint`) |
| 2. Contexte | `contextType` unique, liste de visualisations (type, couleur, unité), **seuils de performance** (`good`, `warning`, `critical`, optionnels) |
| 3. Formules | Pipeline DSL **unique, partagé par toutes les visualisations** (mode Visuel ou Import), « Tester » et « Déboguer pas à pas », restriction de visibilité (contextes `course` et `activity` seulement), événements déclencheurs (`requiredEvents`) |

**Principe clé** : 1 indicateur = 1 formule. Les visualisations diffèrent uniquement par leur rendu, jamais par les données calculées. À l'enregistrement, `submit()` sauvegarde la formule au niveau de l'indicateur.

`FORMULA_RECIPES` fournit des recettes prêtes à l'emploi : Tentatives avant
réussite, Note moyenne, Exercices réussis, Notes moyennes par ressource (avec
un `join` sur `Resources`), Tentatives par étudiant (groupe).

---

## 8. Familles d'indicateurs et visibilité par rôle

### Familles (`familyName`)

Un indicateur n'a qu'un seul `contextType`. Pour couvrir un même thème (par
exemple *Tentatives avant réussite*) sur plusieurs contextes (`learner`,
`course`, `group`, `activity`…), on crée **plusieurs indicateurs partageant le
même `familyName`**. L'administration propose de les créer à la suite, un
wizard par contexte.

`buildIndicatorDisplayRows(indicators, expandedFamilies)`
(`shared/utils/indicator-family-grouping.ts`) regroupe la liste affichée :
les membres d'une famille apparaissent sous une **ligne d'en-tête repliable**
(chevron, badge « N indicateurs »), insérée à la première occurrence du nom de
famille ; les indicateurs sans famille restent à leur place. Utilisé dans
`IndicatorSelectorComponent` et `AdminIndicatorManagerComponent`, qui
proposent deux onglets : « Indicateurs uniques » et « Familles ».

### Visibilité par rôle (`RoleService.canSeeIndicatorContext`)

`frontend/src/app/core/services/role.service.ts` contient la table
`INDICATOR_VISIBILITY: Record<IndicatorScope, UserRole[]>`, avec
`UserRole = 'student' | 'teacher' | 'admin'` :

| `contextType` | Rôles qui voient cet indicateur (frontend) |
|---|---|
| `learner` | `student` |
| `teacher` | `teacher` |
| `admin` | `admin` |
| `course` | `student`, `teacher`, `admin` |
| `activity` | `student`, `teacher`, `admin` |
| `group` | `teacher`, `admin` |

**La règle est aussi appliquée côté backend**, pas seulement à l'affichage,
mais avec une table légèrement différente :
`api/src/modules/features/indicators/indicator-visibility.util.ts`
(`INDICATOR_VISIBILITY`) ajoute un rôle `demo` pour `course` et `activity`.
Ce rôle est absent du type `UserRole` du frontend : un compte `demo` est vu
comme `student` par l'interface, alors que l'API lui ouvre les contextes
`course` et `activity`. Les deux tables sont à maintenir à la main, il n'y a
pas de source unique partagée.

Côté backend, la règle est appliquée par `IndicatorVisibilityGuard`
(`api/src/modules/core/guards/indicator-visibility.guard.ts`) sur
`getIndicatorValues`, `computeView`, `getSnapshots` et `createSnapshot`
(`indicators.controller.ts`), et sur `createPreference` et `updatePreference`
(`user-preferences.controller.ts`). Le rôle vient de la table `Users` de
`platon_db` (jamais du rôle envoyé par le client), pour que la restriction
tienne aussi face à un appel direct à l'API.

### Comment changer de rôle pour tester

Il n'existe aucun mécanisme de simulation de rôle côté frontend. Pour tester
sous un rôle donné, il faut se connecter avec un compte qui a ce rôle, puis se
déconnecter et se reconnecter avec un autre compte pour en changer. Hors
production, la page de connexion propose aussi un formulaire de connexion
locale, qui s'authentifie auprès d'un PLaTon lancé en local (section 12).

### Contextes orphelins `teacher`/`admin`

Un indicateur `contextType: 'teacher'` ou `'admin'` est affiché dans le tableau
de bord de l'enseignant ou de l'administrateur lui-même (`contextId` = son
`userId`), exactement comme pour `learner`.

---

## 9. Routes API

Toutes les routes sont préfixées `/api`. Les contrôleurs `courses`,
`resources` et `user-preferences` exigent un token valide sur toutes leurs
routes (`AuthGuard`, voir section 12). `event-rules` exige en plus le rôle
`admin` (`AdminGuard`) sur **toutes** ses routes, y compris les `GET`. Dans
`indicators` et `event-types`, chaque route a sa propre protection, indiquée
ci-dessous ; une route sans annotation n'exige **aucun token**. Le module
`users` n'a aucune protection.

Légende : **(admin)** = `AuthGuard` + `AdminGuard` ; **(connecté)** =
`AuthGuard` seul ; **(rôle visible)** = `AuthGuard` + `IndicatorVisibilityGuard`
(section 8).

### Indicateurs (`/api/indicators`, `indicators.controller.ts`)

```
GET  /indicators                       : indicateurs actifs
GET  /indicators/all                   : tous, y compris inactifs (ouverte, bien que réservée à l'admin dans l'interface)
GET  /indicators/search?q=&excludeId=  : recherche par nom ou description (détection de doublons)
GET  /indicators/schema                : tables et colonnes PLaTon disponibles (colonnes sensibles exclues)
GET  /indicators/schema/full           : schéma complet avec relations (explorateur de schéma de l'admin)
GET  /indicators/courses/search?q=&offset=   : recherche de cours (tous les cours) pour le panneau « Tester cette formule »
GET  /indicators/course/:courseId/activities : activités d'un cours
GET  /indicators/course/:courseId/students   : étudiants d'un cours (id, e-mail, prénom, nom)
GET  /indicators/pins?contextType=&contextId= : indicateurs figés sur un cours ou une activité (connecté)
GET  /indicators/pins/counts           : nombre de pins par indicateur, tous cours et activités confondus (connecté)
GET  /indicators/:id
GET  /indicators/:id/values?contextType=&contextId=&period=&limit= (rôle visible)
GET  /indicators/:id/usage
GET  /indicators/:id/logs?limit=

POST /indicators                       : créer (admin)
POST /indicators/preview               : { formula, context } → { result }, exécute le DSL (admin)
POST /indicators/preview-steps         : idem, étape par étape (admin)
POST /indicators/:id/compute-view      : { contextType, contextId, vizId?, activityId?, courseId? } (rôle visible)
POST /indicators/:id/recalculate       : (admin)
POST /indicators/:id/pins              : { contextType, contextId, thresholdsOverride? }, figer (connecté, puis contrôle admin ou enseignant*)
DELETE /indicators/:id/pins?contextType=&contextId= : défiger (connecté, puis contrôle admin ou enseignant*)

PATCH  /indicators/:id                 : (admin)
PATCH  /indicators/:id/status          : (admin)
DELETE /indicators/:id                 : (admin)

GET    /indicators/:id/snapshots?activityId= ou ?courseId= (rôle visible)
POST   /indicators/:id/snapshots       : { contextType, contextId, activityId ou courseId, title }, 409 si doublon (rôle visible)
PATCH  /indicators/:id/snapshots/:snapshotId  : renommer (ouverte)
DELETE /indicators/:id/snapshots/:snapshotId  : supprimer (ouverte)

POST   /indicators/:id/notify          : notification liée à l'indicateur (admin)
GET    /indicators/notifications/all   : toutes les notifications

POST   /indicators/:id/feedback        : { userId, rating, comment? }, crée un retour (ouverte ; userId vient du corps de la requête)
GET    /indicators/:id/feedback        : retours d'un indicateur, avec nom de l'auteur
DELETE /indicators/:id/feedback/:feedbackId : (admin)
```

> \* Pas d'`AdminGuard` sur ces deux routes : le contrôle fin (admin global,
> ou membre `teacher` du cours dans `CourseMembers`) est fait dans
> `IndicatorPinsService#assertCanManagePins`.

> Dans le contrôleur, les routes `GET` littérales d'un seul segment (`all`,
> `search`, `schema`, `pins`) et leurs sous-routes sont déclarées **avant**
> `GET /:id`, pour qu'Express ne les prenne pas pour un identifiant.

### Préférences utilisateur (`/api/preferences`, `user-preferences.controller.ts`)

```
GET    /preferences                  : préférences de l'utilisateur connecté
GET    /preferences/:indicatorId
POST   /preferences/:indicatorId     : { isVisible?, displayPreferences?, activeVizId?, enabledVizIds? } (rôle visible)
PATCH  /preferences/:indicatorId     : mêmes champs (rôle visible)
DELETE /preferences/:indicatorId
```

Protégé par `AuthGuard` (voir section 12) : l'utilisateur concerné est
toujours `request.user.id` (identité tirée du token), jamais un `?userId=`
fourni par le client. Accepter un identifiant venu du client permettrait de
lire ou modifier les préférences de n'importe qui en changeant l'URL. Le
frontend envoie encore `?userId=` dans l'URL, mais l'API l'ignore. Le corps
peut contenir `userRole`, que l'API ignore aussi.

Quand un indicateur `learner`, `teacher` ou `admin` est activé, l'API calcule
et enregistre aussitôt sa valeur pour l'utilisateur
(`calculateAndStoreValue`), sauf si la formule filtre par activité ou par
cours. Les autres types sont calculés à leur première consultation.

### Cours (`/api/v1/courses`, `courses.controller.ts`)

```
GET /v1/courses                              : recherche (filtres : search, members, period, offset, limit, order, direction)
GET /v1/courses/:id                          : détail (+ statistic : studentCount, teacherCount, activityCount, progression, timeSpent)
GET /v1/courses/:id/sections
GET /v1/courses/:id/activities               : filtres sectionId, challenge ; titre, état, progression et exerciseCount calculés
GET /v1/courses/:id/groups                   : groupes de TP du cours
GET /v1/courses/:id/groups/:groupId/members
GET /v1/courses/:id/members
POST /v1/courses/:id/members                 : ajoute un membre (CreateCourseMemberDto), écrit dans PLaTon
PATCH /v1/courses/:id/members/:memberId      : change le rôle d'un membre (UpdateCourseMemberRoleDto), écrit dans PLaTon
DELETE /v1/courses/:id/members/:memberId     : retire un membre, écrit dans PLaTon
GET /v1/courses/:courseId/activities/:activityId
GET /v1/courses/:courseId/activities/:activityId/results   : résultats par exercice et par étudiant (avec e-mail)
GET /v1/courses/:courseId/activities/:activityId/results/date?start=&end=
GET /v1/courses/:courseId/activities/:activityId/csv       : téléchargement CSV
```

> `:courseId` est ignoré par les routes `results`, `results/date` et `csv` :
> seul `:activityId` compte (le frontend envoie souvent `_`). Il est en
> revanche utilisé par `GET /:courseId/activities/:activityId`.

Protégé par `AuthGuard` seulement : tout utilisateur connecté peut lire ces
routes, quel que soit son lien avec le cours. `GET /:id`, `GET /:id/activities`
et `GET /:courseId/activities/:activityId` utilisent `request.user.id` pour
calculer les permissions renvoyées, selon la règle de PLaTon :
- pour un cours, `update` = propriétaire, admin global ou membre `teacher` du
  cours ; `delete` = propriétaire ou admin global ;
- pour une activité, `update` et `viewResource` = admin global ou membre
  `teacher` du cours ; `viewStats` est toujours vrai.

Les trois routes d'écriture sur les membres exigent la même condition que
l'`update` d'une activité (admin global ou membre `teacher` du cours).

### Ressources (`/api/v1/resources`, `resources.controller.ts`)

```
GET /v1/resources                : recherche (filtres multiples)
GET /v1/resources/tree           : arbre de cercles (type=CIRCLE, personal=false)
GET /v1/resources/completion     : autocomplétion des noms
GET /v1/resources/owners         : propriétaires distincts
GET /v1/resources/user-circle    : cercle personnel de l'utilisateur courant
GET /v1/resources/:id
```

Protégé par `AuthGuard`. `user-circle` et `GET /:id` utilisent
`request.user.id`. `GET /:id` calcule les permissions
(`write`, `member`, `watcher`, `waiting`) selon la règle de PLaTon :
propriétaire du cercle, admin global sur un cercle non personnel, membre
accepté du cercle ou d'un cercle ancêtre ; `read` est toujours `true`. Ce
module ne fait que lire.

### Types d'événements (`/api/event-types`, `event-types.controller.ts`)

```
GET    /event-types?configured=true   : sans le filtre, tous les types ; avec, seulement ceux qui ont une règle active et installée
GET    /event-types/:id
POST   /event-types          : (admin)
PATCH  /event-types/:id      : (admin)
DELETE /event-types/:id      : (admin), refusé si une règle utilise encore ce type
```

### Déclencheurs dynamiques (`/api/event-rules`, `event-rules.controller.ts`, section 6bis)

Toutes les routes sont protégées par `AuthGuard` + `AdminGuard`, y compris
les `GET`, car elles exposent des noms de tables et de colonnes PLaTon et du
SQL généré.

```
GET    /event-rules
GET    /event-rules/:id
POST   /event-rules
PATCH  /event-rules/:id
DELETE /event-rules/:id                    : simple désactivation (isActive = false), ne touche pas au trigger
POST   /event-rules/:id/reactivate         : réactive une règle désactivée (isActive = true)

GET    /event-rules/:id/preview-sql        : aperçu du DDL d'installation, sans effet
POST   /event-rules/:id/install            : exécute réellement le DDL

GET    /event-rules/:id/preview-uninstall-sql  : aperçu du DDL de retrait, sans effet
POST   /event-rules/:id/uninstall          : exécute le retrait (ou la réduction), puis désactive la règle

GET    /event-rules/:id/preview-hard-delete-sql  : aperçu du DDL de suppression définitive, sans effet
POST   /event-rules/:id/hard-delete        : retire le trigger puis supprime la règle en base (irréversible)
```

### Utilisateurs (`/api/users`, `users.controller.ts`)

```
GET /users?search=&roles=&limit= : recherche d'utilisateurs actifs (id, nom d'utilisateur, prénom, nom, rôle, e-mail)
GET /users/:id                   : un utilisateur (mêmes champs)
```

Aucune protection : ces deux routes répondent sans token (voir section 13.10).

### Ingestion

Le module `ingestion` (`api/src/modules/features/ingestion/`) n'expose
aucune route HTTP : c'est uniquement un consommateur RabbitMQ
(`IngestionConsumerService`, voir [`docs/fonctionnement/ingestion-evenements.md`](docs/fonctionnement/ingestion-evenements.md)).
Aucun point d'entrée HTTP ne permet d'injecter un événement.

---

## 10. Frontend

### Routing

```
/                                      → redirige vers /dashboard
/authentification                     : page de connexion
/dashboard
  /overview                           : grille des indicateurs actifs
  /indicators                         : onglet « Indicateurs » (sélecteur, et administration pour l'admin)
  /indicators/family/:name            : page dédiée d'une famille (vue admin)
  /indicators/selector-family/:name   : page dédiée d'une famille (vue sélecteur)
  /indicator/:id                      : détail d'un indicateur
  /embed-test                         : diagnostic du mode embarqué, lié nulle part
  /courses/...                        : pages Cours (copiées et adaptées de PLaTon, voir 3.3)
```

### Sidebar

Liens : Tableau de bord, Indicateurs, Cours. Il n'y a pas d'onglet
« Admin » dans la navigation principale : les composants d'administration
(`admin-indicator-manager`, `indicator-builder`) sont accessibles dans l'onglet
« Indicateurs », pour le rôle `admin` seulement (`canCreateIndicators`).

### Point d'entrée embarqué (`<indicateurs-app>`)

Second point d'entrée de build (`ng build indicateurs-embed`, cible
`src/main-embed.ts`), à côté de l'application autonome ci-dessus : sans
administration, sans sidebar ni toolbar propres (le LMS hôte fournit les
siennes), compilé comme
[Web Component](https://developer.mozilla.org/fr/docs/Web/API/Web_components)
(`@angular/elements`). Le LMS hôte (PLaTon aujourd'hui) charge deux scripts
(`polyfills.js` puis `main.js`) et place
`<indicateurs-app access-token="..." user="...">` dans ses propres pages, avec
6 attributs optionnels supplémentaires : `initial-view` et les 5 attributs
`context-type`, `context-activity-id`, `context-course-id`,
`context-activity-name`, `context-course-name`. Ces derniers font naviguer
automatiquement vers la route interne `context` (`ContextIndicatorsPage`) :
c'est ainsi qu'une page cours ou activité de PLaTon affiche les indicateurs qui
la concernent, sans passer par `overview` ni `indicators`.
Le routage interne est isolé (`MemoryLocationStrategy`, qui ne touche jamais
`window.location`), et `ROUTE_BASE_PATH` est vide (routes montées à la racine,
pas sous `/dashboard`). Le widget est servi par le serveur d'Indicateurs
lui-même sous `/embed/` (voir `.docker/frontend/Dockerfile` et `nginx.conf`).
Détail complet et contrat exact dans [`docs/platon-integration/integration-indicateurs.md`](docs/platon-integration/integration-indicateurs.md) et
[`docs/platon-integration/integration-platon.md`](docs/platon-integration/integration-platon.md).

### `DashboardContext` et navigation par page cours/activité

```typescript
interface DashboardContext {
  scope: IndicatorScope;   // 'learner' | 'course' | 'group' | ...
  scopeId: string;         // userId | courseId | groupId
  userId: string;
  activityId?: string;
  courseId?: string;
  groupId?: string;
  academicYear?: string;
  semester?: string;
}
```

Il n'y a pas de sélecteur de contexte séparé : chaque page cours ou activité
calcule et affiche directement les indicateurs qui la concernent, à partir du
presenter de la page (`contextChange`, alimenté par la route Angular
courante). Naviguer vers un cours ou une activité *est* le changement de
contexte. La page **cours** (`courses/course/dashboard/dashboard.page.ts`)
affiche sur la même page les indicateurs `course` (« Indicateurs du cours »),
les indicateurs personnels (`learner`, `teacher`, `admin`, restreints à ce
cours) et les indicateurs `group` scopés au cours entier (« Indicateurs par
groupe »). La page **activité** (`activity.page.ts`) affiche de même « Mes
statistiques » (indicateurs personnels restreints à cette activité),
« Indicateurs de l'activité » (`activity`) et « Indicateurs par groupe »
(`group`, scopés à l'activité).

### Familles d'indicateurs : pages dédiées

Dans l'administration (`admin-indicator-manager.component.ts`) comme dans le
sélecteur de l'utilisateur (`indicator-selector.component.ts`), l'onglet
« Familles » affiche une grille de cartes (une par `familyName`, paginée).
Cliquer une carte ouvre une page dédiée (`/dashboard/indicators/family/:name`
ou `/dashboard/indicators/selector-family/:name`) qui réutilise le même
composant avec un `@Input() familyNameFilter` : seuls les membres de cette
famille sont affichés, à plat. Un bouton « Retour à la liste » ramène à la
liste principale. `IndicatorListStateService` mémorise l'onglet, la recherche
et les filtres de la liste principale (administration et sélecteur, chacun de
son côté) pour que ce retour restaure l'état au lieu de repartir des valeurs
par défaut.

### `IndicatorCardComponent`

- `learner`, `teacher`, `admin` **non scopé** (pas d'`activityId` ni de
  `courseId` dans le contexte) → `getIndicatorValue()` (valeur déjà calculée)
- `course`, `group`, `activity`, et `learner`, `teacher`, `admin` **scopé** à
  une activité ou un cours → `computeView()` (cache backend)
- Visualisation active : celle de la préférence enregistrée, sinon
  `visibleVisualizations[0]`. **Pas de sélecteur de visualisation sur la
  carte** : le changement se fait uniquement dans la fenêtre de réglages
  (icône crayon).
- Navigation vers `IndicatorDetailComponent` : `queryParams.from` détermine le
  contexte affiché : `activity` ou `course` (indicateur `activity` ou `course`),
  `group-snapshot` (clic sur un snapshot de groupe), ou `activity-personal` et
  `course-personal` (carte personnelle cliquée depuis une section « Mes
  statistiques » ; `contextType` est alors passé en paramètre, car il dépend de
  l'indicateur cliqué).

### Page activité (`/dashboard/courses/:id/activities/:activityId`)

Trois sections d'indicateurs, toutes sur la même page (pas d'onglet séparé,
comme la page cours) :
1. **« Mes statistiques »** : indicateurs personnels (`learner`, `teacher`,
   `admin`) dont la formule est activity-aware, restreints à cette activité
   (voir `isActivityAware()`).
2. **« Indicateurs de l'activité »** : `contextType: 'activity'`.
3. **« Indicateurs par groupe »** : `GroupSnapshotsPanelComponent`
   (`contextType: 'group'`), un bloc par indicateur avec une carte par
   `IndicatorSnapshot`. Ajout par une liste déroulante qui masque les groupes
   déjà ajoutés, puis `POST .../snapshots` (un doublon renvoie 409, géré par
   l'interface) ; titre modifiable sur place, suppression avec confirmation.

### `IndicatorDetailComponent` : filtres de période

Pour les visualisations `line-chart`, un sélecteur de période est affiché :
`7 jours | 30 jours | 90 jours | Tout | Personnalisé`, sous forme de
`nz-radio-group` (`nzButtonStyle="solid"`), 7 jours par défaut. L'option
« Personnalisé » affiche un `nz-range-picker` avec bornes incluses
(00:00 à 23:59). La courbe s'appuie sur `metadata.history` de la valeur.

### Graphiques (`buildIndicatorChartOptions`, `shared/utils/indicator-chart-options.util.ts`)

Utilitaire partagé, appelé par `IndicatorDetailComponent` pour les types
`gauge`, `bar-chart` et `histogram` (le type `line-chart` est construit
directement dans le composant) :

- **bar-chart** : libellés lisibles (par exemple `resource_name`), tronqués à
  25 caractères avec infobulle complète, valeur affichée sur la barre.
- **histogram** : `structuredValue: [{ bucket, count, users?: string[] }]`,
  infobulle qui liste les noms.

---

## 11. Flux métier de bout en bout

1. Le frontend charge les indicateurs actifs et les préférences de l'utilisateur
   (`GET /indicators`, `GET /preferences`).
2. Pour un indicateur `learner`, `teacher` ou `admin` non scopé, la valeur est
   calculée d'avance (à l'activation de l'indicateur, puis à chaque événement
   ou recalcul) et simplement lue.
3. Pour `course`, `group`, `activity` et les indicateurs personnels scopés, le
   frontend appelle `compute-view` ; le backend regarde le cache
   (`indicator_values`), sinon exécute le pipeline DSL sur la base PLaTon via
   `FormulaInterpreterService` et `PlatonService`, enregistre le résultat et le
   renvoie.
4. Une modification dans PLaTon déclenche un trigger générique installé depuis
   l'admin (par exemple sur `SessionData`), qui écrit dans `platon_outbox_events`.
   Un relais côté LMS hôte (toutes les 2 s, voir
   `docs/platon-integration/integration-platon-relay.md`) republie la ligne telle
   quelle vers RabbitMQ. Deux consumers (`indicators.learner` et
   `indicators.aggregate`) la classent (`EventClassifierService`) puis la
   traitent chacun de son côté. Le consumer `learner` met à jour la valeur par
   calcul différentiel, ou la recalcule en entier. Le consumer `aggregate`
   aiguille selon le `contextType` (section 6, « Rafraîchissement après un
   événement »). Chaque valeur recalculée est envoyée par WebSocket
   (`/indicators`, événement `indicator.updated`) pour mettre à jour l'écran
   sans le recharger. Voir [`docs/fonctionnement/ingestion-evenements.md`](docs/fonctionnement/ingestion-evenements.md) pour le détail.
5. Le frontend affiche la visualisation choisie (carte, jauge, courbe, barres,
   histogramme) selon les préférences (`activeVizId`, `enabledVizIds`) et les
   règles de visibilité par rôle (`RoleService`).

---

## 12. Sécurité et authentification

### Contexte : pourquoi pas un simple `JwtStrategy` classique

Le frontend attache un `Authorization: Bearer <accessToken>` à chaque requête
(`auth.interceptor.ts`). Ce token est obtenu en redirigeant l'utilisateur vers
le **PLaTon de production** (`https://platon.univ-eiffel.fr/login`), pas vers
une instance locale dont on connaîtrait le `.env`. Le secret de signature réel
(`SECRET_KEY` de production) est donc **inconnu** en développement : impossible
de vérifier la signature du token comme le fait PLaTon lui-même
(`platon/libs/core/server/.../jwt.strategy.ts`). Hors production, la page de
connexion propose aussi un formulaire de connexion locale, qui demande le
token à un PLaTon lancé en local (`platonLocalApiUrl`, `POST /api/v1/auth/signin`).

### `AuthGuard` (`api/src/modules/core/auth/auth.guard.ts`)

Comportement choisi par `NODE_ENV` (`api/.env`) :

- **toute valeur autre que `production`** (par exemple `development`) : décode
  le contenu du token (`sub`, `username`, `exp`) **sans vérifier la
  signature**, et ne rejette (401) que si `exp` est dépassé ou absent. Cela
  suffit à écarter une session expirée, mais n'empêche pas un client de
  fabriquer un `sub` arbitraire.
- **`production`** : vérification cryptographique complète
  (`jsonwebtoken.verify` avec `JWT_SECRET`). À utiliser quand Indicateurs est
  déployé à côté de **son propre** PLaTon, avec un secret réellement partagé,
  et non avec le PLaTon universitaire externe.

Dans les deux cas, `request.user = { id, username }` est rempli pour les
gardes et contrôleurs suivants.

### `AdminGuard` (`api/src/modules/core/guards/admin.guard.ts`)

Doit toujours être posé **après** `AuthGuard` (`@UseGuards(AuthGuard, AdminGuard)`) :
lit `request.user.id`, vérifie `Users.role === 'admin'` dans la base PLaTon,
sinon 403.

### `IndicatorVisibilityGuard` (`api/src/modules/core/guards/indicator-visibility.guard.ts`)

Doit toujours être posé **après** `AuthGuard`
(`@UseGuards(AuthGuard, IndicatorVisibilityGuard)`) : lit le rôle réel de
`request.user.id` dans la base PLaTon (jamais un rôle envoyé par le client) et
applique la règle de la section 8 (avec la table du backend), pour que la
restriction tienne aussi face à un appel direct à l'API. Un indicateur
introuvable n'est pas refusé ici : le contrôleur renvoie alors 404. Posé sur
`getIndicatorValues`, `computeView`, `getSnapshots` et `createSnapshot`
(`indicators.controller.ts`), et sur `createPreference` et `updatePreference`
(`user-preferences.controller.ts`).

### Ce que ça protège concrètement

| Zone | Protection actuelle |
|---|---|
| Permissions cours et activités | calculées (propriétaire, admin, membre `teacher`), voir section 9 ; l'ajout et le retrait de membres sont refusés aux autres |
| Permissions ressources | calculées en lecture (propriétaire, admin, membre de cercle), voir section 9 |
| Écritures sur les indicateurs, les types d'événements et les règles | rôle `admin` vérifié (`AdminGuard`), sauf le renommage et la suppression de snapshots et l'envoi d'un retour, qui sont ouverts |
| Visibilité des indicateurs par rôle et contexte | rôle réel vérifié (`IndicatorVisibilityGuard`), voir section 8 |
| Préférences utilisateur | utilisateur toujours tiré de `request.user.id`, jamais accepté depuis le client |
| Session expirée | 401 → `auth.interceptor.ts` vide le `localStorage`, puis renvoie vers `/authentification` (ou prévient la page hôte en mode embarqué) |

Plusieurs routes de lecture restent ouvertes sans token, dont certaines
renvoient des données personnelles : voir section 9 et la liste de la
section 13.10.

### Limite connue

En développement, un appel direct à l'API (hors navigateur) avec un `sub`
inventé et un `exp` dans le futur passe le contrôle : hors production,
`AuthGuard` ne garantit pas l'authenticité du token, seulement qu'il n'est pas
expiré. Fermer complètement ce trou demanderait soit de connaître le secret de
production (qu'il n'est pas souhaitable de dupliquer), soit de valider chaque
token par un appel à l'API PLaTon de production (`GET /api/v1/users/:username`
avec le même Bearer, comme le fait `authentification.page.ts` à la connexion).
Ce n'est pas implémenté, faute de besoin de sécurité renforcée en développement.

---

## 13. Choix techniques et câblage avec PLaTon

Cette section explique, à partir du code réel, comment Indicateurs est construit
et comment il se branche sur PLaTon : quels choix ont été faits, pourquoi, et où
les retrouver dans le code. Chaque affirmation renvoie au fichier qui la porte.

### 13.1 Vue d'ensemble

```
   PLaTon (Postgres)                         Indicateurs
 ┌──────────────────────┐
 │ SessionData, Users   │◄──────── lecture (SQL) ─────────────────┐
 │        │             │                                         │
 │  déclencheur généré  │                                         │
 │        ▼             │                                         │
 │ platon_outbox_events │                                         │
 └────────┬─────────────┘                                         │
          │ relais (côté PLaTon, toutes les 2 s)                  │
          ▼                                                       │
     RabbitMQ  ──► file indicators.learner  ─┐                    │
  (exchange       file indicators.aggregate ─┤                    │
   platon.events)                            ▼                    │
                                 classification + calcul ─────────┘
                                             │
                                             ▼
                            base "indicators" (valeurs en cache)
                                             │
                                   WebSocket (socket.io)
                                             ▼
                 navigateur (app autonome ou <indicateurs-app> dans PLaTon)
```

Trois idées tiennent tout le reste :

1. **Un indicateur est une donnée, pas du code** : on le crée depuis l'interface
   d'administration, sans redéployer l'application.
2. **Indicateurs ne touche pas au code de PLaTon** : il lit surtout sa base
   (les quelques écritures sont listées en section 4.1), et tout ce qui doit
   vivre côté PLaTon (relais, page hôte) est fourni à part, prêt à copier.
3. **Le calcul suit les événements** : une action d'un étudiant dans PLaTon
   déclenche le recalcul des seuls indicateurs concernés, quand c'est possible
   sans tout recalculer.

### 13.2 Un indicateur = une définition stockée en base

Un indicateur est une ligne de la table `indicator_definitions`. Sa formule est
un objet JSON, pas une fonction compilée :

```ts
// api/src/modules/features/indicators/entities/indicator-definition.entity.ts
export interface FormulaDefinition {
  version: '1.0';
  pipeline: { id: string; type: string; label?: string; params: Record<string, any> }[];
}
```

La formule est un **pipeline** : une suite d'étapes appliquées l'une après
l'autre. Exemple réel, la recette « Note moyenne » proposée dans le wizard
(`frontend/src/app/features/admin/indicator-builder.component.ts`, `FORMULA_RECIPES`).
C'est le format du wizard ; en base, les réglages de chaque étape sont rangés
dans `params` :

```ts
pipeline: [
  { type: 'fetch',     label: 'Charger sessions', table: 'SessionData', contextFields: ['user_id', 'activity_id'] },
  { type: 'extract',   label: 'Notes',            extractField: 'grade' },
  { type: 'aggregate', label: 'Moyenne',          aggregateFn: 'avg' },
  { type: 'round',     label: 'Arrondir',         decimals: 1 },
]
```

Lecture : « prends les lignes de `SessionData` de cet utilisateur pour cette
activité, garde la colonne `grade`, fais la moyenne, arrondis à 1 décimale ».

Les types d'étapes disponibles : `fetch`, `join`, `filter`, `groupBy`,
`findFirst`, `extract`, `aggregate`, `round`, `divide`, `js`.

**Pourquoi ce choix** : ajouter un indicateur ne demande ni développeur ni
redéploiement. C'est le principe directeur du projet, et il explique plusieurs
choix qui suivent (bac à sable pour le code JS, accès protégé à la base PLaTon).

**Autres champs importants de l'entité** :

| Champ | Rôle |
|---|---|
| `contextType` | À qui ou à quoi s'applique l'indicateur : `learner`, `teacher`, `admin`, `course`, `activity`, `group`. Un indicateur a un seul contexte. |
| `requiredEvents` | Noms des événements qui déclenchent son recalcul. Vide : recalcul périodique (voir §13.6.6). |
| `visualizations` | Une ou plusieurs vues (carte, jauge, barres, histogramme, courbe). |
| `thresholds` | Seuils pour la couleur de la carte : ≤ `good` vert, ≤ `warning` orange, au-delà rouge ; `critical` ne sert qu'à la légende. |
| `visibilityRoles` | Restreint la visibilité à certains rôles, en remplacement de la règle par défaut. |

### 13.3 L'interpréteur de formules

Le service `FormulaInterpreterService`
(`api/src/modules/features/indicators/interpreter/formula-interpreter.service.ts`)
exécute le pipeline étape par étape. Chaque étape reçoit la sortie de la
précédente.

#### 13.3.1 Accès protégé à la base PLaTon

Les étapes `fetch` et `join` lisent des tables PLaTon choisies par
l'administrateur. Ce sont donc des noms de tables et de colonnes **saisis par
un humain** qui finissent dans du SQL. Trois protections dans
`api/src/modules/core/platon/platon.service.ts` :

**a) Les noms sont vérifiés, les valeurs sont paramétrées** (`queryTable`, l.468) :

```ts
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
  throw new Error(`Nom de table invalide : '${table}'`);
}
// ...
conditions.push(`"${col}" = $${idx++}`);   // la valeur part en paramètre $1, $2…
params.push(val);
```

**b) Jamais de `SELECT *`** : la liste des colonnes est lue dans
`information_schema`, puis filtrée par un motif de noms sensibles (l.9) :

```ts
private static readonly SENSITIVE_COLUMN_PATTERN =
  /password|passwd|secret|token|api[_-]?key|hash|salt|credential|email|phone|discord|ip_address/i;
```

Une formule ne peut donc jamais lire un mot de passe ou un email, même si
l'administrateur le demande.

**c) Les tables/colonnes doivent exister** (`assertValidTableColumn`, l.429)
avant d'être utilisées dans du SQL généré (déclencheurs, voir §13.6.1).

#### 13.3.2 L'étape `js` : du code dans un bac à sable

Quand les étapes prédéfinies ne suffisent pas, l'administrateur peut écrire du
JavaScript. Ce code est écrit par des administrateurs, pas par l'équipe de
développement : il ne doit jamais pouvoir toucher au serveur.

Deux barrières :

**1. Analyse du texte avant exécution** (`JS_FORBIDDEN_PATTERNS`, l.589) : refus
de `process`, `require(`, `import(`, `eval(`, `Function(`, `.constructor(`,
`fetch(`, `child_process`, `fs.*`, etc.

**2. Exécution dans un isolate V8 séparé** (`executeJs`, l.615), avec la
bibliothèque `isolated-vm` :

```ts
const isolate = new ivm.Isolate({ memoryLimit: 32 });          // 32 Mo max
const context = await isolate.createContext();
const inputCopy = new ivm.ExternalCopy(input);                 // copie, pas de référence partagée
await context.global.set('input', inputCopy.copyInto());
const script = await isolate.compileScript(`(function(input) { ${code} })(input)`);
return await script.run(context, { timeout: 2000, copy: true }); // 2 s max
```

Un isolate est un moteur V8 à part : il n'a ni `process`, ni `require`, ni
système de fichiers, ni réseau. L'analyse de texte est un filet en plus, pas la
protection principale.

**Pourquoi l'analyse de texte ne suffit pas** : c'est une recherche de mots, facile
à contourner (`globalThis["pro"+"cess"]` ne contient jamais le mot `process`). Elle
sert à refuser vite les cas évidents. Le contournement échoue quand même dans
l'isolate, où `process` et `require` n'existent pas.

**Points à connaître** :

- Un isolate est créé puis détruit à chaque exécution : rien ne persiste d'un
  calcul à l'autre.
- Le code est le corps d'une fonction : il doit se terminer par `return`.
- Les données sont copiées dans l'isolate et le résultat est recopié dehors :
  modifier `input` ne change rien côté serveur.
- Un code refusé, une boucle infinie ou un dépassement de mémoire donnent
  `{"result": 0}` à la prévisualisation. La cause est visible seulement dans les
  logs du serveur.
- Les routes de prévisualisation (`POST /indicators/preview` et `preview-steps`)
  exigent un administrateur, comme la création d'un indicateur.

**Coût de ce choix** : `isolated-vm` est un module natif, écrit en C++ (il n'est
pas fourni avec Node). À l'installation, `yarn install` télécharge un binaire
déjà compilé quand il en existe un pour la machine, et sinon le compile sur
place, ce qui demande `python3`, `make` et `g++` (voir
`docs/deploiement/platon-local-setup.md`, étape 0). Le binaire est lié à la
version de Node : il faut le réinstaller si Node change.

### 13.4 Le calcul incrémental

Recalculer une moyenne sur toutes les sessions à chaque nouvel événement coûte
une requête complète à chaque fois. Pour les formules simples, Indicateurs met
à jour le résultat à partir de la seule ligne qui a changé.

#### 13.4.1 Quelles formules sont éligibles

`getIncrementalShape` (l.134 de l'interpréteur) reconnaît la forme :

```
fetch(SessionData, user_id) → [join]* → [filter]* → [groupBy]? → [findFirst]?
  → extract → 1 aggregate (avg|sum|count|min|max) → [round|divide|js]*
```

La recette « Note moyenne » ci-dessus est éligible. Une formule qui ne suit pas
cette forme est simplement recalculée en entier : plus lente, mais toujours
juste. Limite du calcul différentiel : les déclencheurs ne surveillent que
`INSERT` et `UPDATE`, pas `DELETE`. Une session supprimée dans PLaTon reste
donc dans le cache jusqu'au prochain calcul complet.

#### 13.4.2 Comment ça marche

Au premier calcul complet, Indicateurs garde en cache, dans la colonne
`metadata` de `indicator_values`, la valeur extraite **par session** :

```ts
// api/src/modules/features/indicators/indicators.service.ts, computeView (l.350)
metadata: buildValueMetadata(existing?.metadata, scalarValue, {
  structuredValue,
  ...(rowValues ? { incremental: { rowValues } } : {}),   // { sessionId: valeur, ... }
  ...
}),
```

Quand un événement arrive pour une session, `computeViewIncremental` (l.539)
remplace seulement cette entrée, puis réapplique l'agrégat sur les valeurs
gardées (extrait simplifié) :

```ts
const newRowValues = { ...existingRowValues };
if (passesFilters(row)) newRowValues[deltaEvent.sessionId] = v;   // ajoute ou remplace
else delete newRowValues[deltaEvent.sessionId];                    // la ligne ne passe plus le filtre
const newValue = await this.formulaInterpreter.applyPostSteps(Object.values(newRowValues), shape.postSteps);
```

Sans `join`, la ligne vient directement de l'événement : **zéro requête SQL**.
Avec `join`, une seule requête ciblée sur la session concernée.

#### 13.4.3 Une clé de cache par contexte

Une même valeur peut dépendre d'un utilisateur seul, ou d'un utilisateur dans
une activité précise. `resolveCacheContextId` (l.309) construit la clé
(détail des formes en section 5, `IndicatorValue`) :
- pour `learner`, `teacher` et `admin`, selon ce que **la formule** déclare
  utiliser (`activity_id` ou `course_id` dans ses `contextFields`) :
  `userId`, `userId:activityId` ou `userId:courseId` ;
- pour `course` et `group`, selon ce qui est fourni à l'appel : une activité
  ajoute `:activityId`, sinon (groupe seulement) un cours ajoute `:courseId`.

Cette fonction est partagée par le calcul complet et le calcul incrémental :
si les deux calculaient la clé différemment, l'incrémental ne retrouverait
jamais le cache.

### 13.5 Les données : deux connexions, un seul serveur

Indicateurs n'a pas son propre serveur Postgres. Il utilise celui de PLaTon,
avec deux bases distinctes :

| Base | Accès | Comment | Fichier |
|---|---|---|---|
| `platon_db` | lecture, et quelques écritures (section 4.1) | SQL brut, `DataSource` fournie sous le nom `PLATON_DATA_SOURCE` | `api/src/modules/core/platon/platon.module.ts` |
| `indicators` | lecture/écriture | TypeORM, connexion nommée `indicators` | `api/src/modules/core/core.module.ts` |

**Pourquoi** : pas de copie des utilisateurs, cours et sessions. Indicateurs
lit toujours la donnée à jour. Sa propre base ne contient que ce qui lui
appartient (définitions, valeurs calculées, règles d'événements, pins…).

**Schéma de la base `indicators`** : uniquement par migrations TypeORM
(`api/src/migrations/`), jamais par génération automatique (`synchronize: false`,
y compris en dev). La base se reconstruit à l'identique sur n'importe quelle
machine.

### 13.6 Les événements : de PLaTon jusqu'au navigateur

#### 13.6.1 Des déclencheurs Postgres générés depuis l'admin

L'administrateur décrit une règle (« quand une ligne de `SessionData` est
insérée, ou quand `grade` change ») dans l'écran « Événements & déclencheurs ».
Indicateurs génère le déclencheur Postgres correspondant
(`api/src/modules/features/event-rules/event-rules.service.ts`, `buildDdl`, l.273) :

```sql
CREATE OR REPLACE FUNCTION fn_platon_outbox_generic() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO platon_outbox_events (event_type, payload)
  VALUES ('raw:' || TG_TABLE_NAME, jsonb_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'new', to_jsonb(NEW),
    'old', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    'timestamp', extract(epoch from now())::bigint
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_platon_outbox_generic_sessiondata
AFTER INSERT OR UPDATE OF "grade" ON "SessionData"
FOR EACH ROW EXECUTE FUNCTION fn_platon_outbox_generic();
```

Points à retenir :

- **Un seul déclencheur par table**, quel que soit le nombre de règles : les
  colonnes surveillées de toutes les règles actives sont réunies dans
  `UPDATE OF …` (`updateClauseFor`).
- **Le déclencheur est générique** : il recopie la ligne entière (`new`/`old`)
  sans rien décider. La logique métier reste dans Indicateurs.
- **Avant toute génération**, table et colonne sont vérifiées
  (`assertValidTableColumn`), car leurs noms sont insérés dans du SQL.
- **Installer un déclencheur demande des droits** de propriétaire sur la table
  PLaTon. Si `PLATON_DB_ADMIN_USERNAME`/`PASSWORD` sont renseignés, `execDdl`
  (l.214) ouvre une connexion à part avec ce compte, le temps d'une commande.
  Sinon, il passe par le compte habituel ; si celui-ci n'a pas les droits,
  l'écran affiche le SQL à faire exécuter par un administrateur de la base.

**Pourquoi un déclencheur et pas une modification du code PLaTon** : on ne
modifie pas le code de PLaTon, et on capte les changements quelle que soit la
partie de PLaTon qui écrit dans la table.

#### 13.6.2 La table outbox et le relais (côté PLaTon)

Le déclencheur écrit dans `platon_outbox_events`, sur la base de PLaTon, dans
la même transaction que la modification d'origine. C'est le motif
**outbox** : l'événement est enregistré si et seulement si la modification l'est.

Un **relais**, qui tourne côté PLaTon, lit cette table toutes les 2 secondes et
publie chaque ligne vers RabbitMQ, telle quelle
(`docs/platon-integration/outbox-relay.service.ts`) :

```ts
@Cron('*/2 * * * * *')
async relay(): Promise<void> {
  if (this.isRunning) return;   // pas de chevauchement
  // SELECT ... FROM platon_outbox_events WHERE id > $lastId ORDER BY id LIMIT 200
  // publish(PLATON_EXCHANGE, row.event_type, { ...row.payload, type: row.event_type })
  // puis avance le curseur indicateurs_outbox_cursor
}
```

- Un **curseur** (`indicateurs_outbox_cursor`) mémorise la dernière ligne
  publiée. En cas d'échec de publication, le curseur n'avance pas : les lignes
  seront republiées au tour suivant.
- **Pourquoi le relais est côté PLaTon** : il ne fait que transporter, il n'a
  besoin de rien savoir des indicateurs. N'importe quel autre LMS pourrait
  fournir son propre relais de la même façon.
- **Purge** : Indicateurs supprime chaque nuit les lignes de plus de 7 jours
  (`OutboxMaintenanceService`).

#### 13.6.3 RabbitMQ : deux files

Indicateurs consomme l'exchange `platon.events` avec deux files distinctes
(`api/src/modules/features/ingestion/ingestion-consumer.service.ts`) :

```ts
export const QUEUE_LEARNER    = 'indicators.learner';    // onLearnerEvent (l.43)
export const QUEUE_AGGREGATE  = 'indicators.aggregate';  // onAggregateEvent (l.68)
```

Chaque événement arrive dans les deux files. La première ne traite que les
indicateurs `learner` (score individuel), la seconde tous les autres (cours,
groupe, enseignant…).

**Pourquoi deux files** : un calcul lourd sur un cours entier ne doit pas
retarder la mise à jour du score d'un étudiant.

**Pourquoi RabbitMQ plutôt qu'un appel direct** : PLaTon n'attend jamais
Indicateurs. Si Indicateurs est arrêté ou lent, les messages s'accumulent dans
les files (`durable: true`) et sont traités au redémarrage.

#### 13.6.4 La classification

Le message reçu est brut (`type: 'raw:SessionData'`, ligne complète). Avant
tout calcul, `resolveEvents` (l.20 du consumer) le transforme en 0, 1 ou
plusieurs **événements métier** via `EventClassifierService.classify`
(`api/src/modules/features/event-rules/event-classifier.service.ts`, l.34) :

```ts
for (const rule of this.ruleCache) {
  if (rule.sourceTable !== table) continue;
  if (rule.operation === 'INSERT' && op !== 'INSERT') continue;
  if (rule.operation === 'UPDATE' && op !== 'UPDATE') continue;
  if (!this.evaluateCondition(rule.condition, rule.watchedColumn, newRow, oldRow)) continue;
  const userId = rule.contextMapping.userId ? newRow[rule.contextMapping.userId] : undefined;
  if (!userId) continue;
  matches.push({ type: rule.eventType.name, userId: String(userId), /* courseId, activityId, sessionId */ });
}
```

Conditions possibles (`evaluateCondition`, l.64) : `always`, `changed`,
`equals`, `not_equals`, `threshold_crossed` (la valeur franchit un seuil entre
`old` et `new`, et pas seulement « est au-dessus »).

Les règles actives sont gardées en mémoire 30 secondes (`RULE_CACHE_TTL_MS`) :
une règle modifiée dans l'admin prend effet au plus 30 s plus tard. Le cache
contient toutes les règles actives, que leur déclencheur soit installé ou non.
De même, la liste des indicateurs actifs est gardée 60 secondes par
`IngestionService` : un indicateur activé reçoit ses premiers événements au
plus une minute plus tard.

**Pourquoi classer côté Indicateurs et pas dans le déclencheur** : les règles
vivent dans la base `indicators`. Les changer ne demande pas de réinstaller un
déclencheur côté PLaTon.

#### 13.6.5 Garde-fou : pas d'indicateur actif sans déclencheur réel

On ne peut pas activer un indicateur dont un événement requis n'a aucun
déclencheur installé (`assertRequiredEventsHaveInstalledTriggers`,
`indicators.service.ts` l.129). Sinon l'indicateur paraîtrait fonctionnel mais
ne se mettrait jamais à jour.

#### 13.6.6 Les indicateurs sans événement

Un indicateur sans `requiredEvents` est recalculé périodiquement
(`AggregationService.recalculateTriggerlessIndicators`), toutes les minutes par
défaut (`TRIGGERLESS_RECALC_CRON`, expression cron à 5 ou 6 champs). Ce
recalcul passe par `recalculate`, qui ne traite que les utilisateurs ayant une
préférence pour l'indicateur ; il ne convient qu'aux indicateurs personnels
(voir section 6 et 13.10).

#### 13.6.7 Vers le navigateur : WebSocket

Après chaque recalcul, un événement interne `indicator.updated` est émis, puis
diffusé aux navigateurs connectés par socket.io
(`api/src/modules/features/ingestion/indicators.gateway.ts`, l.52) :

```ts
@OnEvent('indicator.updated')
handleIndicatorUpdated(payload: IndicatorUpdatePayload) {
  if (this.connectedClients === 0) return;
  this.server.emit('indicator.updated', payload);
}
```

La carte se met à jour sans recharger la page. Voir les limites au §13.10.

### 13.7 Authentification et droits

#### 13.7.1 Indicateurs ne gère pas de comptes

L'utilisateur se connecte sur PLaTon. PLaTon lui donne un jeton JWT. Indicateurs
reçoit ce jeton dans l'en-tête `Authorization: Bearer …` et le contrôle
(`api/src/modules/core/auth/auth.guard.ts`, l.27) :

```ts
const isProd = this.configService.get('NODE_ENV') === 'production';
const payload = isProd ? this.verifyStrict(token) : this.verifyExpirationOnly(token);
```

- **En production** : vérification complète de la signature avec `JWT_SECRET`,
  qui doit être identique au `SECRET_KEY` du PLaTon déployé à côté.
- **En développement** : on se connecte sur le vrai PLaTon universitaire, dont
  on ne connaît pas le secret. On décode le jeton et on vérifie seulement son
  expiration. D'où l'obligation de régler `NODE_ENV=development` en local.

#### 13.7.2 Les droits viennent de PLaTon

Le rôle (`student`, `teacher`, `admin`…) n'est jamais pris dans le jeton : il
est relu dans la table `Users` de PLaTon à chaque requête protégée
(`api/src/modules/core/guards/indicator-visibility.guard.ts`, l.32) :

```ts
const rows = await this.platonDataSource.query(`SELECT role FROM "Users" WHERE id = $1`, [userId]);
if (!canRoleSeeIndicator(rows[0]?.role, indicator.contextType, indicator.visibilityRoles)) {
  throw new ForbiddenException("Vous n'avez pas accès à cet indicateur");
}
```

La règle par défaut est une table simple
(`api/src/modules/features/indicators/indicator-visibility.util.ts`) :

```ts
export const INDICATOR_VISIBILITY: Record<ContextType, string[]> = {
  learner:  ['student'],
  teacher:  ['teacher'],
  admin:    ['admin'],
  course:   ['student', 'teacher', 'admin', 'demo'],
  activity: ['student', 'teacher', 'admin', 'demo'],
  group:    ['teacher', 'admin'],
};
```

`visibilityRoles`, s'il est renseigné sur l'indicateur, remplace cette règle.

Les permissions sur un cours suivent les règles de PLaTon, et jamais le seul
rôle global d'enseignant : modifier le cours est permis au propriétaire, à un
admin ou à un membre `teacher` du cours dans `CourseMembers` ; gérer ses
membres ou y figer un indicateur est permis à un admin ou à un membre
`teacher` du cours (`courses.service.ts`, `indicator-pins.service.ts`).

### 13.8 L'intégration dans l'interface de PLaTon : un Web Component

#### 13.8.1 Le principe

Le même projet Angular produit deux applications :

- l'**application autonome** (administration des indicateurs) ;
- un **élément HTML personnalisé**, `<indicateurs-app>`, que PLaTon insère dans
  ses propres pages.

L'élément est enregistré dans `frontend/src/main-embed.ts` (l.10) :

```ts
createApplication(embedConfig).then((appRef) => {
  const element = createCustomElement(EmbedRootComponent, { injector: appRef.injector });
  customElements.define('indicateurs-app', element);
});
```

**Pourquoi un Web Component** : PLaTon charge un script, pose une balise, et
c'est tout. Il n'a pas besoin de connaître Angular côté Indicateurs, ni de
partager la même version d'Angular. Les deux applications coexistent sur la
même page.

#### 13.8.2 Ce que PLaTon fournit à la balise

Tout passe par des attributs (`frontend/src/embed/embed-root.component.ts`, l.27) :

```ts
@Input('access-token') accessToken?: string;          // obligatoire : le JWT PLaTon
@Input() user?: string;                               // JSON de l'utilisateur (rôle notamment)
@Input('initial-view') initialView?: 'overview' | 'indicators';
@Input('context-type') contextType?: 'activity' | 'course';
@Input('context-activity-id') contextActivityId?: string;
@Input('context-course-id') contextCourseId?: string;
@Input('context-activity-name') contextActivityName?: string;
@Input('context-course-name') contextCourseName?: string;
```

Sans `user`, le rôle démarre sur `student` par défaut et les indicateurs
enseignant restent invisibles, sans erreur : c'est l'attribut le plus facile à
oublier.

#### 13.8.3 Ne jamais toucher à l'URL de PLaTon

Le routeur Angular écrit normalement dans l'URL du navigateur. Dans une page
PLaTon, il écraserait l'URL de PLaTon. Le widget utilise donc un routeur qui
garde son historique en mémoire (`frontend/src/embed/memory-location.strategy.ts`) :

```ts
pushState(state: unknown, _title: string, url: string, queryParams: string): void {
  this.stack.push(url + (queryParams ? '?' + queryParams : ''));   // pile en mémoire,
  this.index++;                                                   // jamais window.history
}
```

Contrepartie : pas de lien direct vers une vue précise du widget, pas de
bouton « précédent » du navigateur à l'intérieur du widget.

#### 13.8.4 Jeton expiré

Le widget n'a pas d'écran de connexion. Sur une réponse 401, il prévient la
page hôte par un événement DOM et la laisse décider
(`frontend/src/app/core/interceptors/auth.interceptor.ts`, l.29) :

```ts
if (embedded) {
  document.querySelector('indicateurs-app')
    ?.dispatchEvent(new CustomEvent('indicateurs-token-expired', { bubbles: true }));
} else {
  router?.navigateByUrl('/authentification');
}
```

#### 13.8.5 Où est servi le script

Le script et le CSS du widget sont servis par le serveur d'Indicateurs, sous
`/embed/` (`.docker/frontend/Dockerfile` et `nginx.conf`), pas copiés dans
PLaTon. Indicateurs n'est pas lié à un seul LMS : un hébergement unique évite
de reconfigurer chaque LMS hôte.

Le code à ajouter côté PLaTon (lien de menu, route, page hôte) est décrit dans
`docs/platon-integration/integration-platon.md`.

### 13.9 Déploiement et reproductibilité

- **Réseau Docker partagé** : Indicateurs rejoint le réseau `platon-network`
  créé par PLaTon, pour joindre `platon_postgres` par son nom. (Le fichier
  compose de production transmet aussi `REDIS_HOST`, mais l'API n'utilise pas
  Redis.)
- **Services d'initialisation** lancés avant l'API, en développement (où l'API
  est ensuite lancée à la main) comme en production :
  `init-db` (crée la base `indicators` si absente), `migrate` (applique les
  migrations), `rabbitmq-init` (crée ou corrige le compte RabbitMQ, même sur un
  volume déjà initialisé).
- **Un seul point d'entrée** sur une nouvelle machine : `./bin/setup.sh`.
- Procédure complète : `docs/deploiement/platon-local-setup.md`.

### 13.10 Limites connues et points à trancher

Ce qui suit est vrai dans le code actuel et mérite d'être dit en réunion.

| Sujet | État actuel | Conséquence |
|---|---|---|
| **WebSocket** | `this.server.emit(...)` envoie chaque mise à jour à **tous** les navigateurs connectés, sans salle par contexte ni contrôle du jeton à la connexion, avec `cors: { origin: '*' }`. | Un client peut recevoir des valeurs (identifiant de contexte + valeur) qui ne le concernent pas. À corriger avant une vraie mise en production : authentifier la connexion socket et diffuser par salle (`userId`, `courseId`…). |
| **Messages en échec** | Pas de file d'erreurs (DLX) ni de nombre de tentatives borné sur les files RabbitMQ. | Un message qui échoue toujours n'est ni mis de côté ni signalé proprement. |
| **Délai du relais** | Le relais lit l'outbox toutes les 2 s, par lots de 200. | Mise à jour quasi temps réel, pas instantanée. Suffisant pour des indicateurs pédagogiques. |
| **Règles de visibilité en double** | `INDICATOR_VISIBILITY` existe côté API et côté frontend (`RoleService`), à synchroniser à la main ; elles diffèrent déjà (rôle `demo` côté API seulement). | Risque de divergence à chaque modification. L'API reste l'autorité (le guard refuse), le frontend ne fait que masquer. |
| **Indicateurs figés et visibilité** | La page cours ou activité affiche un indicateur figé sans vérifier `visibilityRoles`. | Un étudiant peut voir la carte d'un indicateur qui lui est interdit ; l'API refuse ensuite sa valeur (403), donc la carte reste en erreur. |
| **Routes ouvertes** | Sans token : `GET /api/users` et `/api/users/:id` (avec e-mails), `GET /api/indicators/course/:courseId/students` (avec e-mails), `GET /api/indicators/all`, le renommage et la suppression de snapshots, l'envoi d'un retour (avec un `userId` libre). Avec un simple token : les résultats et le CSV de n'importe quelle activité. | À protéger avant une mise en production (`AuthGuard`, `AdminGuard`, ou contrôle d'appartenance au cours). |
| **Recalcul périodique des indicateurs non personnels** | `recalculate` passe l'identifiant d'un utilisateur comme contexte, même pour un indicateur `course`, `activity` ou `group` sans événement. | Ces indicateurs reçoivent des valeurs sans objet, rangées sous des clés d'utilisateurs, et leurs vraies valeurs ne sont jamais rafraîchies par le minuteur. Leur donner un événement déclencheur évite le problème. |
| **Sessions supprimées** | Les déclencheurs ne surveillent pas `DELETE`. | Une session supprimée reste dans le cache du calcul différentiel jusqu'au prochain calcul complet. |
| **Historique des valeurs** | `metadata.history` reçoit une entrée à chaque calcul, sans limite. | La ligne grossit sans fin pour un indicateur souvent recalculé. |
| **Lignes copiées par le déclencheur** | Le déclencheur générique copie la ligne entière (`to_jsonb(NEW)`), sans le filtre des colonnes sensibles. | Une règle posée sur une table comme `Users` ferait passer ses colonnes sensibles dans l'outbox et dans RabbitMQ. Il n'y a pas de liste blanche de tables pour les règles. |
| **CORS du script embarqué** | Le bloc `location /embed/` de `nginx.conf` n'envoie pas d'en-tête `Access-Control-Allow-Origin`. Les scripts `type="module"` y sont soumis dès qu'ils viennent d'un autre domaine. | À ajouter avant de servir le widget à un PLaTon sur un autre domaine. Non visible en test local (même origine). |
| **Domaine de production** | `frontend/src/environments/environment.embed.prod.ts` contient encore `<domaine-indicateurs-a-remplacer>`. | À remplacer avant tout déploiement réel du widget. |
| **Versionnage du widget** | Le script est servi sans numéro de version (`outputHashing: "none"`). | Qui prévient PLaTon d'une nouvelle version, et comment éviter le cache navigateur : à décider avec l'équipe PLaTon. |
| **Collision de styles** | `styles.css` est une feuille globale (remise à zéro, thèmes ng-zorro et Material), chargée dans la page de PLaTon. | Peut modifier l'apparence du reste de PLaTon. À valider par l'équipe PLaTon dans une vraie page. |
| **Pas de lien direct vers une vue du widget** | Le routeur interne garde son historique en mémoire (`MemoryLocationStrategy`). | Pas d'adresse partageable vers une page du widget, pas de bouton « précédent » du navigateur à l'intérieur. Si le besoin apparaît : un préfixe d'URL à négocier avec PLaTon. |
| **Retour vers les pages PLaTon** | « Retour au cours » et « Retour à l'activité » naviguent en interne (`/context`), faute de contrat pour pointer vers les vraies pages PLaTon. | À trancher avec l'équipe PLaTon si ce lien est nécessaire (voir `ROUTE_BASE_PATH` dans `docs/platon-integration/integration-indicateurs.md`). |
| **Accès réseau à RabbitMQ en prod** | En local, réseau Docker partagé. En prod, PLaTon et Indicateurs peuvent être sur des serveurs différents. | Réseau privé commun ou RabbitMQ exposé avec un compte dédié au relais : à décider. |
| **Droits pour installer les déclencheurs** | Nécessite un compte Postgres propriétaire des tables PLaTon. | Sur le vrai PLaTon universitaire, il faudra obtenir ce compte, ou faire exécuter le SQL généré par un administrateur de la base. |
