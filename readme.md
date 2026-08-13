# Indicateurs - Documentation complète du projet

Ce document décrit l'état réel du dépôt `indicateurs/` : architecture, modèle de
données, moteur de calcul DSL, routes API, frontend, sécurité et limites connues.
L'objectif est qu'une lecture complète de ce fichier suffise à comprendre le
fonctionnement global du projet sans avoir à parcourir tout le code source.

> Documents complémentaires :
> - [`docs/guide.md`](docs/guide.md) - guide pas-à-pas pour créer et tester chaque type
>   d'indicateur (les 6 `contextType`, toutes les fonctionnalités du DSL).
> - [`docs/parcours-donnees.md`](docs/parcours-donnees.md) - pour chaque route listée en
>   §9, trace fichier par fichier et ligne par ligne le chemin complet
>   composant frontend → service → contrôleur → service backend → accès BDD.

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Démarrage](#2-démarrage)
3. [Architecture des dossiers](#3-architecture-des-dossiers)
4. [Bases de données](#4-bases-de-données)
5. [Modèle de données - entités `indicators`](#5-modèle-de-données--entités-indicators)
6. [Moteur DSL - calcul des indicateurs](#6-moteur-dsl--calcul-des-indicateurs)
6bis. [Déclencheurs dynamiques (event-rules)](#6bis-déclencheurs-dynamiques-event-rules)
7. [Modèle - contextType + visualizations](#7-modèle-option-b--contexttype--visualizations)
8. [Familles d'indicateurs et visibilité par rôle](#8-familles-dindicateurs-et-visibilité-par-rôle)
9. [Routes API](#9-routes-api)
10. [Frontend](#10-frontend)
11. [Flux métier de bout en bout](#11-flux-métier-de-bout-en-bout)
12. [Sécurité et authentification](#12-sécurité-et-authentification)

---

## 1. Vue d'ensemble

Le projet est un microservice de **suivi de performance e-learning** pour la
plateforme PLaTon. Il combine :

- un **frontend Angular 21** (`frontend/`)
- un **backend NestJS** (`api/`, port 3001)
- une lecture de la **base PLaTon** (données pédagogiques, lecture seule)
- un stockage des définitions et valeurs d'indicateurs dans une **base
  `indicators` distincte** (lecture/écriture)

**Philosophie centrale : zéro redéploiement.** Un administrateur crée et configure
des indicateurs (formule de calcul, visualisations, seuils, contextes) entièrement
depuis l'interface. La formule est stockée en JSONB et interprétée à la volée par
un **moteur DSL "pipeline"** (voir section 6) - aucune modification de code ni
redéploiement n'est nécessaire pour ajouter un nouvel indicateur.

---

## 2. Démarrage

### Prérequis

- Node.js + yarn
- Deux bases PostgreSQL accessibles :
  - **PLaTon** (lecture seule - données pédagogiques existantes)
  - **indicators** (lecture/écriture - créée/synchronisée automatiquement par
    TypeORM en développement, `synchronize: true`)

### Variables d'environnement (`api/.env`)

```env
# Connexion BDD PLaTon (lecture seule)
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

# Optionnel - identifiant Postgres à privilèges élevés (superuser, ou propriétaire
# des tables PLaTon concernées), utilisé uniquement pour exécuter le DDL d'installation
# des déclencheurs dynamiques (section 6bis / event-rules). Sans ça, l'installation
# tente la connexion applicative habituelle.
PLATON_DB_ADMIN_USERNAME=
PLATON_DB_ADMIN_PASSWORD=

NODE_ENV=development
PORT=3001
JWT_SECRET=
```

Redis est configuré (`redis: { host, port, password }`, valeurs par défaut
`localhost:6379`) mais **n'est utilisé nulle part actuellement**.

### Lancer le projet

```bash
yarn start
```

Le backend écoute sur `http://localhost:3001`, préfixe global `/api`.
Le frontend est disponible sur `http://localhost:4200`.

---

## 3. Architecture des dossiers

### 3.1 Backend (`api/src/`)

```
main.ts                - bootstrap NestJS, prefix /api, CORS, ValidationPipe global
app.module.ts          - module racine, importe tous les modules ci-dessous
modules/
  core/
    config/configuration.ts     - lecture des variables d'env (ports, BDD, Redis, cron)
    database/                   - connexions TypeORM (PLATON_DATA_SOURCE + connexion 'indicators')
    auth/auth.guard.ts          - vérifie le token Authorization: Bearer (voir section 12)
    guards/admin.guard.ts       - restreint une route au rôle 'admin' (lit request.user.id posé par AuthGuard)
    platon/platon.service.ts    - toutes les requêtes SQL brutes vers la BDD PLaTon
  features/
    indicators/                 - cœur du projet : entités, moteur DSL, CRUD, snapshots
      entities/                 - 7 entités TypeORM (voir section 5)
      calculators/              - legacy hardcodé, ne plus utiliser
      interpreter/formula-interpreter.service.ts - moteur DSL (voir section 6)
      indicators.controller.ts  - toutes les routes /api/indicators*
      indicators.service.ts     - logique métier (computeView, recalculate, snapshots…)
    event-types/                - types d'événements PLaTon gérés en BDD (CRUD, seed au démarrage)
    event-rules/                 - déclencheurs dynamiques : règle → trigger PostgreSQL généré (section 6bis)
    user-preferences/           - préférences d'affichage par utilisateur
    ingestion/                  - consumers RabbitMQ, WebSocket gateway, service d'ingestion
      ingestion-consumer.service.ts - 2 consumers routing key '#' (learner + aggregate)
      indicators.gateway.ts     - WebSocket /indicators, émet indicator.updated
      ingestion.service.ts      - logique de calcul incrémental / recalcul total
    ingestion-relay/            - cron */2 * * * * * : lit platon_outbox_events → publie RabbitMQ
    aggregation/                - cron quotidien/hebdo (agrégations)
    courses/                    - proxy lecture PLaTon : cours, sections, activités, groupes, résultats
    resources/                  - proxy lecture PLaTon : ressources, arbre de cercles
    groups/                     - groupes de TP d'un enseignant
    users/                      - accès utilisateurs PLaTon (lecture)
```

### 3.2 Frontend (`frontend/src/app/`)

```
app.routes.ts           - route racine → redirige vers /dashboard
core/
  guards/indicator.guard.ts        - vérifie l'existence d'un indicateur :id
  interceptors/auth.interceptor.ts - VIDE (stub, aucun token injecté)
  models/indicator.model.ts        - types partagés (IndicatorDefinition, IndicatorVisualization…)
  services/
    indicator.service.ts           - client HTTP + caches (préférences viz, visibilité)
    dashboard-settings.service.ts  - préférences/contexte de l'utilisateur courant
    role.service.ts                - rôle courant + règles de visibilité (section 8)
    user.service.ts / group.service.ts...
features/
  dashboard/
    dashboard.page.ts/html         - shell (sidebar + toolbar + router-outlet)
    pages/
      overview/                    - grille des indicateurs actifs (+ sélecteur de contexte enseignant)
      indicators/                  - onglet "Indicateurs" : préférences + (admin) gestion
      widgets/sidebar/ + toolbar/ + teacher-context-selector/
  admin/
    admin-indicator-manager.component.ts  - table CRUD admin
    indicator-builder.component.ts        - wizard de création/édition (3 étapes, voir section 6/7)
    indicator-config.component.ts         - config rapide d'affichage
    event-rule-manager.component.ts       - écran "Événements & déclencheurs" (section 6bis)
    event-rule-builder.component.ts       - wizard guidé de création d'une règle
    event-rule-install-modal.component.ts - aperçu SQL + confirmation d'install/retrait
  indicator-selector/    - l'utilisateur active/désactive ses indicateurs
  indicator-detail/      - page détail d'un indicateur (tabs par visualisation)
  courses/                - pages "Cours" copiées/adaptées depuis PLaTon (voir 3.3)
  resources/              - pages "Ressources" copiées/adaptées depuis PLaTon (voir 3.3)
shared/
  ui/indicator-card/ + statistic-card/ + layout-block/
  pipes/duration.pipe.ts
  utils/indicator-family-grouping.ts  - regroupement par famille (section 8)
  styles/                 - SCSS, thèmes Material clair/sombre, ng-zorro
```

### 3.3 Stubs PLaTon (`frontend/src/platon-stubs/`)

PLaTon utilise Angular 18, ce projet Angular 21 → **impossible d'importer
directement les libs PLaTon** (deux instances Angular en conflit). Les pages
"Cours" et "Ressources" ont donc été **copiées depuis PLaTon puis adaptées**, et
toutes les dépendances `@platon/*` / `@cisstech/nge/*` sont remplacées par des
**stubs locaux** via des alias `tsconfig.json` :

| Stub (`src/platon-stubs/`) | Alias tsconfig |
|---|---|
| `core-common.ts` / `core-browser.ts` | `@platon/core/common` / `@platon/core/browser` |
| `core-browser/user-search-bar/` | composant `UserSearchBarComponent` (ControlValueAccessor) |
| `course-common.ts` / `course-browser.ts` | `@platon/feature/course/{common,browser}` |
| `resource-common.ts` / `resource-browser.ts` | `@platon/feature/resource/{common,browser}` |
| `resource-browser/resource-version/` | `ResourceVersionComponent` / `ResourceVersioningComponent` |
| `resource-browser/resource-files/` | `ResourceFilesComponent` |
| `resource-browser/event-list/`, `event-item/` | `ResourceEventListComponent` / `ResourceEventItemComponent` |
| `resource-browser/member-table/` | `ResourceMemberTableComponent` |
| `resource-browser/invitation-form/`, `invitation-table/` | `ResourceInvitationFormComponent` / `ResourceInvitationTableComponent` |
| `resource-browser/resource-sharing/` | `ResourceSharingComponent` |
| `resource-browser/template-card/`, `template-selection/` | `TemplateCardComponent` / `TemplateSelectionComponent` |
| `resource-browser/circle-tree/`, `resource-filters/` | `CircleTreeComponent` / `ResourceFiltersComponent` |
| `resource-browser/resource-item/`, `resource-list/` | `ResourceItemComponent` / `ResourceListComponent` |
| `resource-browser/nge-ui-list/` | `NgeUiListModule`, `ListComponent`, `ListTemplateComponent` |
| `feature-result-common.ts` / `feature-result-browser.ts` | `@platon/feature/result/{common,browser}` |
| `feature-tuto-browser.ts`, `feature-peer-browser.ts`, `feature-compiler.ts`, `shared-ui.ts` | divers `@platon/feature/*`, `@platon/shared/ui` |
| `nge-directives.ts`, `nge-pipes.ts`, `nge-ui-icon.ts` | `@cisstech/nge/{directives,pipes,ui/icon}` |
| `nge-services.ts` | `@cisstech/nge/services` → `ClipboardService`, `PickerBrowserService` |
| `nge-markdown.ts` | `@cisstech/nge/markdown` → `NgeMarkdownComponent` (rendu minimal) |

Points clés de ces stubs :
- `AuthService.ready()` lit l'utilisateur connecté depuis `localStorage.currentUser`
  (peuplé par le flux SSO réel, section 12) - repli sur un utilisateur anonyme
  (`role: student`) si absent.
- `CourseService` / `ResourceService` font de **vrais appels HTTP** vers
  `/api/v1/courses*` et `/api/v1/resources*` (modules `courses`/`resources` du
  backend) - ce ne sont pas des stubs vides pour la lecture, seules les
  **opérations d'écriture** (créer/déplacer/etc.) sont des no-ops car la BDD
  PLaTon est en lecture seule.
- Les composants UI (`UiLayoutTabsComponent`, `UiStatisticCardComponent`,
  `UiSearchBarComponent`, etc.) sont réimplémentés en Angular 21.
- `@angular/cdk/portal` n'est pas installé : `ComponentType<T>` est défini
  localement dans les stubs qui en ont besoin (ex. `event-item`).
- Les icônes assets nge (`assets/vendors/nge/icons/`) sont absentes :
  `NgeUiIconModule` utilise les glyphes AntD (folder/file) en remplacement.

---

## 4. Bases de données

### 4.1 Base PLaTon (lecture seule)

Toutes les tables du schéma `public` sont accessibles dynamiquement dans le
builder DSL (plus de whitelist statique) - validées via `information_schema` et
une regex anti-injection dans `PlatonService.queryTable()`.

Tables principales :

| Table | Rôle |
|---|---|
| `SessionData` | Vue dénormalisée (~35 colonnes) : une ligne = une session user × exercice (`user_id`, `activity_id`, `resource_id`, `grade`, `attempts`, `created_at`, …). Table principale pour les formules. |
| `Sessions` / `Activities` / `Resources` / `Users` / `Courses` | Tables sources |
| `CourseGroups` (`id` UUID, `group_id` varchar, `course_id`, `name`) | Groupes de TP |
| `CourseGroupsMember` (`group_id` varchar, `user_id`) | Appartenance aux groupes |

**Colonnes ajoutées sur `SessionData` par ce projet** (pas nativement présentes
dans PLaTon - migrations dans `api/src/scripts/migrations/`, à exécuter avec le
rôle Postgres élevé, voir `PLATON_DB_ADMIN_*` dans `api/.env`, jamais avec le
rôle applicatif `platon` qui n'est pas propriétaire de ces tables) :
- **`status`** (`add-platon-status-column.sql`) - anticipation d'un futur
  changement de schéma PLaTon, déduite de `grade`/`attempts`/`started_at`.
  Valeurs : `non commencé | commencé | réussi | échoué | erreur`.
- **`attempts_at_success`** (`add-platon-attempts-at-success-column.sql`) -
  rang de la première réponse notée 100 parmi les réponses de la session
  (calculé depuis `Answers`), `NULL` si jamais réussie. À utiliser à la place
  de `attempts` pour tout calcul de type "tentatives avant réussite" :
  `attempts` seul continue d'augmenter après une réussite et donne un
  résultat faux si l'étudiant retente ensuite.

**Particularités du schéma PLaTon (à connaître pour écrire des requêtes/formules)** :
- `Activities` n'a **pas** de colonne `name` : le titre est dans
  `source->'variables'->>'title'`, avec fallback sur `Resources.name` via
  `LEFT JOIN "Resources" r ON r.id = (a.source->>'resource')::uuid`.
- 99 FK sont déclarées dans PLaTon (visibles via `pg_constraint`) mais masquées
  dans `information_schema` car les tables appartiennent à un user PostgreSQL
  différent de celui utilisé par ce microservice. DBeaver les voit car il requête
  `pg_constraint` directement. Le builder n'en tire pas parti automatiquement.

### 4.2 Base `indicators` (lecture/écriture)

Gérée par TypeORM, `synchronize: true` en développement (les tables/colonnes sont
créées/migrées automatiquement au démarrage). 5 entités, détaillées section 5.

---

## 5. Modèle de données - entités `indicators`

### `IndicatorDefinition` (table `indicator_definitions`)

La définition d'un indicateur.

| Champ | Type | Rôle |
|---|---|---|
| `id` | uuid | identifiant |
| `name` | string (unique) | nom affiché |
| `description` | text \| null | description |
| `contextType` | `'learner'\|'teacher'\|'admin'\|'course'\|'activity'\|'group'` | contexte unique de cet indicateur (voir section 7) |
| `familyName` | string \| null | regroupement nominal de plusieurs indicateurs créés ensemble sous une même famille (section 8) |
| `baseIndicatorId` | string \| null | indicateur à partir duquel celui-ci a été créé (capitalisation) - traçabilité uniquement, aucun lien vivant : modifier l'indicateur de base n'a plus aucun effet après la création |
| `requiredEvents` | jsonb (string[]) | événements PLaTon qui déclenchent un recalcul |
| `visualizations` | jsonb (`IndicatorVisualization[]`) | une ou plusieurs visualisations - représentations visuelles différentes d'une même formule (section 7) |
| `isActive` | boolean | actif / désactivé |
| `isFamilyPlaceholder` | boolean | ligne technique qui ne représente aucun indicateur réel - sert uniquement à faire exister une famille vide (pas de table dédiée, `familyName` est un simple champ partagé). Toujours `isActive=false`, jamais affichée aux utilisateurs finaux, supprimée automatiquement dès qu'un premier vrai indicateur rejoint la famille |
| `usageCount` | number | compteur d'utilisation |
| `formula` | jsonb \| null | **formule unique partagée par toutes les visualisations** (1 indicateur = 1 formule) |
| `thresholds` | jsonb \| null | seuils de performance partagés `{ good?: number; warning?: number; critical?: number }` - colore la valeur (vert/orange/rouge) et affiche la légende dans le détail. `critical` est une borne purement documentaire (légende) : au-delà de `warning`, la carte est de toute façon rouge, avec ou sans `critical` ; optionnel |
| `interpretationHint` | text \| null | aide à l'analyse : texte libre expliquant comment interpréter les résultats, affiché dans le panneau latéral du détail ; optionnel |
| `visibilityRoles` | jsonb (string[]) \| null | restreint la visibilité de cet indicateur à des rôles précis, en override de la règle par défaut du `contextType` - utile pour un indicateur course/activity dont le résultat est nominatif et ne doit donc pas être proposé aux étudiants malgré la visibilité "tous" par défaut de ces contextes ; optionnel |

### `IndicatorValue` (table `indicator_values`)

La valeur calculée pour un contexte donné.

- Contrainte unique `(indicatorId, contextType, contextId)`.
- Pour `course`/`group`/`activity` : `contextId` peut être une **clé composite**
  `courseId:activityId` (voir `computeView`, section 6).
- Pour `learner` : `contextId = userId`.
- `value: float` - toujours présent (0 si le résultat n'est pas un scalaire).
- `metadata: jsonb` - `{ count?, lastUpdate?, history?, structuredValue?, users?, ... }`
  pour les résultats non scalaires (bar-chart, histogram).

### `IndicatorExecutionLog` (table `indicator_execution_logs`)

Un log par exécution de pipeline : `indicatorId`, `userId` (ou `groupId`),
`value`, `durationMs`, `error`, `executedAt`.

### `IndicatorFeedback` (table `indicator_feedback`)

Feedback utilisateur sur un indicateur : `indicatorId`, `userId`, `rating`, `comment`, `createdAt`.

### `IndicatorNotification` (table `indicator_notifications`)

Notification destinée à un utilisateur : `indicatorId`, `userId`, `message`, `read`, `createdAt`.

### `IndicatorEventType` (table `indicator_event_types`)

Types d'événements PLaTon déclarés en BDD : `id`, `name`, `label`, `description`, `isActive`.
Géré via `GET/POST/PATCH/DELETE /api/event-types`. Seed automatique de `exercise.answered` au démarrage si la table est vide. `GET /api/event-types?configured=true` ne renvoie que les types associés à une `IndicatorEventRule` active **et** installée (voir section 6bis) - c'est ce filtre qui alimente le sélecteur du wizard d'indicateur.

### `IndicatorEventRule` (table `indicator_event_rules`)

Une règle de classification : transforme un changement brut sur une table PLaTon en un `IndicatorEventType`. Voir section 6bis pour le détail complet.

| Champ | Rôle |
|---|---|
| `eventTypeId` | type d'événement produit si la règle matche |
| `sourceTable` / `watchedColumn` | table et colonne PLaTon surveillées (`watchedColumn` peut être `null` = INSERT uniquement) |
| `operation` | `INSERT` \| `UPDATE` \| `INSERT_OR_UPDATE` |
| `condition` | `{ kind: 'always'\|'changed'\|'equals'\|'not_equals'\|'threshold_crossed', value?, operator?, threshold? }` |
| `contextMapping` | colonnes source → `userId` (obligatoire) / `courseId` / `activityId` / `sessionId` |
| `triggerInstalled` / `installedAt` / `lastAppliedSql` / `lastInstallError` | suivi de l'installation réelle du trigger PostgreSQL |

### `IndicatorSnapshot` (table `indicator_snapshots`)

"Carte épinglée" d'un indicateur `group` pour une activité donnée (panneau
"Par groupe" de la page activité). Contrainte unique
`(indicatorId, contextType, contextId, activityId)` - anti-doublon. Champs :
`contextId` (= `groupId`), `activityId`, `title`.

### `IndicatorPin` (table `indicator_pins`)

Permet à un enseignant de figer un indicateur existant sur un cours ou une
activité précis : tous les membres l'ont alors actif et non désactivable,
avec des seuils propres à ce contexte. Contrainte unique
`(indicatorId, contextType, contextId)`.

| Champ | Rôle |
|---|---|
| `indicatorId` | indicateur figé |
| `contextType` | `'course'` \| `'activity'` |
| `contextId` | identifiant du cours ou de l'activité |
| `thresholdsOverride` | seuils propres à ce contexte `{ good?, warning?, critical? }`, remplacent ceux de l'indicateur ; optionnel |
| `pinnedByUserId` | enseignant à l'origine de l'épinglage |

Totalement indépendant de `UserIndicatorPreference` - aucune écriture croisée
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

## 6. Moteur DSL - calcul des indicateurs

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
- `0` si le pipeline est vide ou si une étape échoue (l'erreur est loggée dans
  `indicator_execution_logs` mais **ne fait pas planter l'appelant**)

`interpretWithSteps(formula, context)` exécute le même pipeline mais retourne le
**snapshot de chaque étape** (`{ index, type, durationMs, output, error? }`),
utilisé par le débogueur pas-à-pas du builder (`POST /preview-steps`).

### Catalogue des étapes

| Type | Rôle | Paramètres principaux |
|---|---|---|
| `fetch` | Charge des lignes depuis une table PLaTon, filtrées selon le contexte. | `table`, `contextFields: string[]` (`user_id`, `activity_id`, `course_id`, `group_id` → mappés depuis `FormulaContext`). Si `group_id` est demandé et que `context.groupId` est défini, déclenche une jointure `CourseGroupsMember`/`CourseGroups` via `queryTableForGroup` (nécessite `activityId` **ou** `courseId` dans le contexte - une seule activité, ou tout le cours agrégé si `isCourseAware`, sinon retourne `[]`). |
| `join` | LEFT/INNER/RIGHT/FULL JOIN entre la sortie courante (table gauche) et une seconde table PLaTon (table droite), indexée en `Map` (O(n)). | `table`, `leftKey`, `rightKey`, `contextFields?` (mêmes filtres que `fetch`), `joinType?: 'left'\|'inner'\|'right'\|'full'` (défaut `'left'`). En cas de fusion, les champs de gauche écrasent ceux de droite en cas de conflit de nom. `right`/`full` ajoutent les lignes droites jamais matchées. CROSS JOIN volontairement non supporté. |
| `filter` | Filtre les lignes selon `field operator value`. | `field`, `operator: '=='\|'!='\|'>'\|'<'\|'>='\|'<='`, `value`. Un opérateur inconnu **lève une erreur** (le pipeline s'arrête, résultat 0). |
| `groupBy` | Regroupe des lignes plates en `any[][]`. | `groupField` |
| `findFirst` | Pour chaque groupe (ou tableau plat), retourne une ligne (triée par `sortField` puis filtrée par `whereField == whereValue`, ou la première sinon). | `whereField?`, `whereValue?`, `sortField?` |
| `extract` | Extrait un champ numérique de chaque ligne (groupes ou plat) → `number[]`. | `extractField` |
| `aggregate` | Agrège un `number[]`. | `aggregateFn: 'avg'\|'sum'\|'count'\|'min'\|'max'` |
| `round` | Arrondit un nombre. | `decimals` (défaut 2) |
| `divide` | Divise par une constante (0 si `divideBy === 0`). | `divideBy` |
| `js` | Exécute du JS arbitraire ; `input` = sortie de l'étape précédente, doit `return` un résultat. | `code` - exécuté dans un **vrai isolate V8** (`isolated-vm`, 32 Mo, timeout 2s). Analyse statique préalable (13 patterns interdits). Voir [`docs/js.md`](docs/js.md) pour le détail des protections. |

Rétro-compatibilité : les anciens noms de table `sessions`/`activities` sont
mappés vers `SessionData`/`Activities` (`LEGACY_TABLE_MAP`).

### Exemple - "Tentatives moyennes avant première réussite"

Attention : `attempts` sur `SessionData` est un compteur cumulatif qui continue
d'augmenter même après une première réussite (si l'étudiant retente encore
après coup) - il ne faut donc jamais l'extraire directement pour mesurer "le
nombre de tentatives qu'il a fallu pour réussir". La colonne
`attempts_at_success` (calculée depuis `Answers`, figée au moment de la
première réponse notée 100) porte la bonne valeur, déjà prête sur chaque
ligne - `groupBy`/`findFirst` ne sont donc plus nécessaires, un simple filtre
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

### `computeView` (`indicators.service.ts`) - calcul + cache

`POST /indicators/:id/compute-view` appelle `computeView(indicatorId, contextType,
contextId, activityId?, vizId?, forceRefresh?)` :

- **Résolution de la formule** : `indicator.formula` - toutes les visualisations partagent la même formule (**1 indicateur = 1 formule**).
- **Résolution `activityId`** : fourni par l'appelant, pas de fallback (aucune valeur par défaut, pour aucun contextType).
- **Clé de cache** :
  - `learner` → `contextId = userId`
  - `course`/`group`/`activity` → `contextId = ${contextId}:${activityId}:${viz.id}`
  - Si une `IndicatorValue` existe déjà pour cette clé et que `forceRefresh` est
    faux → retournée directement (pas de recalcul).
- **Résolution des noms d'utilisateurs** : si le résultat est un tableau avec un
  champ `userIds[]`, ces ids sont résolus en `"Prénom Nom"` via
  `PlatonService.getUserNameMap()` avant stockage/retour - jamais d'UUID exposé
  côté frontend.

### Snapshots "vivants" et cache cours/groupe/activité - refresh automatique

`IngestionService` appelle, en fire-and-forget après chaque événement PLaTon
ingéré pour une activité, deux méthodes complémentaires :

1. `IndicatorsService.refreshSnapshots(indicatorId, scope, deltaEvent?)` : recalcule
   (`forceRefresh = true`) **toutes** les `IndicatorSnapshot` épinglées pour ce
   périmètre, pour chaque visualisation. `scope` est `{ activityId }` (une seule
   activité) ou `{ courseId }` (indicateur `group` course-aware, voir
   `isCourseAware()` - agrège toutes les activités du cours pour ce groupe).
   Les erreurs par snapshot sont loggées sans bloquer les autres.

2. `IndicatorsService.refreshActivityViews(indicatorId, activityId)` : recalcule
   (`forceRefresh = true`) toutes les `indicator_values` de type
   `course`/`group`/`activity` dont le `contextId` composite référence cette
   `activityId` (matching `LIKE` sur les 4 formes possibles :
   `activityId`, `activityId:vizId`, `courseId:activityId`,
   `courseId:activityId:vizId`). Déduit les couples uniques
   `(contextType, contextId d'origine)` et recalcule par visualisation.
   Uniquement pour le périmètre "une activité" - l'équivalent pour un indicateur
   `group` course-aware est `refreshCourseGroupViews(indicatorId, courseId)`,
   plus simple (toujours un recalcul complet, pas de variante incrémentale).

Ces appels sont indépendants : `refreshSnapshots` couvre les groupes
explicitement épinglés, `refreshActivityViews`/`refreshCourseGroupViews` couvrent
toutes les vues cours/groupe/activité simplement consultées (cachées par
`computeView`). Ensemble, ils garantissent que **toutes** les valeurs
course/group/activity en cache sont fraîches après chaque événement d'ingestion.

**Tradeoff** : chaque événement déclenche le recalcul de toutes les vues déjà
consultées pour cette activité. Pour une activité avec beaucoup de groupes/vues,
cela peut représenter de nombreux recalculs DSL en arrière-plan. Aucune limite ni
debounce n'est implémentée pour l'instant.

### Recalcul (`recalculate`)

`POST /indicators/:id/recalculate` ne recalcule **que** les utilisateurs ayant
activé l'indicateur (requête sur `user_indicator_preferences`, pas
`getAllUserIds()`), pour la première vue `learner`. Si le résultat est un objet
structuré, il est stocké dans `metadata.structuredValue` (et `value = 0`), pas
directement dans la colonne `value` (type `float`).

### Import / export YAML / JSON dans le builder

Dans l'étape 3 du wizard, chaque visualisation a deux modes : **Visuel** /
**Import**. Le panneau Import permet de coller/éditer un pipeline en YAML ou JSON
(`{ pipeline: [{ type, label?, params }] }`), avec :
- indentation auto, validation française détaillée, référence inline des 10
  types et de leurs paramètres,
- **escape hatch** : une étape avec un `type` inconnu mais un `params.code` non
  vide est convertie en étape `js` (avertissement listant les étapes converties),
- **round-trip** : ouvrir "Import" pré-remplit avec le pipeline courant
  (sérialisé via `pipelineToText`), permettant éditer → appliquer → ré-ouvrir →
  ré-éditer.

Un **débogueur pas-à-pas** (bouton "Déboguer") appelle `POST /preview-steps` et
affiche le contexte effectif + chaque étape (type, durée, aperçu tabulaire des
résultats, "Afficher tout" si > 5 lignes).

---

## 6bis. Déclencheurs dynamiques (`event-rules`)

Un seul événement est câblé en dur dans le code : `exercise.answered`, produit
par le trigger `trg_platon_outbox_session_data` sur `SessionData.grade`
(installé manuellement, voir [`docs/ingestion.md`](docs/ingestion.md) étape 1). Pour
ajouter un **nouvel** événement (autre table, autre colonne, autre condition)
sans redéploiement, l'écran admin **"Événements & déclencheurs"**
(`event-rule-manager.component.ts`) permet de :

1. **Créer une règle** (`event-rule-builder.component.ts`) : table PLaTon →
   colonne surveillée → opération → condition → mapping contexte (colonnes →
   `userId`/`courseId`/`activityId`/`sessionId`) → type d'événement (existant
   ou nouveau) → `POST /api/event-rules`. Aucun SQL exécuté à cette étape.
2. **Installer le trigger** (`event-rule-install-modal.component.ts`) :
   aperçu du SQL (`GET /api/event-rules/:id/preview-sql`), puis exécution
   réelle sur confirmation (`POST /api/event-rules/:id/install`) - crée/mets
   à jour un trigger générique `trg_platon_outbox_generic_<table>` (fonction
   partagée `fn_platon_outbox_generic()`, réutilisée par toutes les tables).
3. **Supprimer** : retire le trigger (ou le réduit s'il est partagé par
   d'autres règles actives sur la même table) puis désactive la règle.

`IngestionRelayService.classify()` (voir [`docs/ingestion.md`](docs/ingestion.md) étape
1bis) évalue les règles actives contre chaque événement générique brut
(`event_type` préfixé `raw:`) pour déterminer le(s) événement(s) métier réel(s)
à publier. Le chemin historique (`exercise.answered` et tout `event_type` non
préfixé `raw:`) reste totalement inchangé.

`DROP TRIGGER` exigeant en PostgreSQL la propriété de la table (pas juste un
privilège `GRANT`), l'installation peut échouer si le rôle applicatif n'est
pas propriétaire - voir `PLATON_DB_ADMIN_USERNAME`/`PASSWORD` (section 2) pour
un contournement sans jamais modifier l'ownership.

---

## 7. Modèle - `contextType` + `visualizations[]`

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

### Sélection de la visualisation par l'utilisateur - persistée en BDD

Si un indicateur a plusieurs visualisations, l'utilisateur choisit laquelle
afficher. Le choix est persisté dans `user_indicator_preferences.active_viz_id`
(pas `localStorage`), via `IndicatorService.setVizPreference()` (cache in-memory
+ `PATCH /preferences/:indicatorId`). Cohérence carte ↔ détail garantie par ce
cache partagé.

- Sur la **carte** : aucun sélecteur visible - la visualisation active est celle
  sauvegardée (ou la première par défaut). Le changement se fait uniquement via
  le **modal d'édition** (icône crayon, toujours visible).
- Sur la **page détail** : onglets `nz-tabs` par visualisation, calcul lazy à la
  demande (`onVizTabChange`).

### Modal d'édition de la carte (`IndicatorConfigModalComponent`)

Bouton crayon (toujours visible) sur chaque carte → `NzModalService.create()`
charge `IndicatorConfigModalComponent`. Les données sont transmises via
`ModalDataService.setData()` (service singleton), lu dans le `ngOnInit` du modal.

Le modal permet de **cocher/décocher les visualisations visibles** (minimum 1
obligatoire : la dernière cochée est désactivée + tooltip). La sélection est
persistée dans `user_indicator_preferences.enabled_viz_ids` via
`IndicatorService.setEnabledVizIds()`.

### Masquage sélectif de visualisations - `enabledVizIds`

L'utilisateur peut aussi masquer certaines visualisations d'un indicateur
(`user_indicator_preferences.enabled_viz_ids`, `null` = toutes visibles). Les
composants utilisent un getter `visibleVisualizations` (filtre
`isVizEnabled`, fallback = toutes si le filtre viderait la liste) au lieu
d'accéder directement à `indicator.visualizations`.

### Wizard admin (`indicator-builder.component.ts`) - flux en 3 étapes

| Étape | Contenu |
|---|---|
| 1. Définition | Nom, description, aide à l'analyse (`interpretationHint`), événements déclencheurs (`requiredEvents`) |
| 2. Contexte & vues | `contextType` unique, liste de visualisations (type/icône/couleur/unité), **seuil de performance global** (`good`/`warning`, optionnel) |
| 3. Formule | Pipeline DSL **unique partagé par toutes les vues** - mode Visuel/Import, "Tester" et "Déboguer pas à pas" |

**Principe clé** : 1 indicateur = 1 formule. Les visualisations diffèrent uniquement par leur rendu visuel, jamais par les données calculées. À la soumission, `submit()` sauvegarde la formule au niveau de l'indicateur.

`FORMULA_RECIPES` fournit des recettes prêtes à l'emploi (Tentatives avant
réussite, Note moyenne, Taux de réussite, Notes moyennes par ressource - avec
`join Resources`, Tentatives par étudiant d'un groupe - avec `join Users`).

---

## 8. Familles d'indicateurs et visibilité par rôle

### Familles (`familyName`)

Le modèle Option B+ impose 1 indicateur = 1 `contextType`. Pour couvrir un même
"thème" (ex. *Tentatives avant réussite*) sur plusieurs contextes
(`learner`/`course`/`group`/`activity`), on crée **plusieurs indicateurs
partageant le même `familyName`**, créés/édités ensemble depuis le wizard.

`buildIndicatorDisplayRows(indicators, expandedFamilies)`
(`shared/utils/indicator-family-grouping.ts`) regroupe la liste affichée :
les membres d'une famille apparaissent sous une **ligne d'en-tête repliable**
(chevron, badge "N indicateurs"), insérée à la première occurrence du nom de
famille ; les indicateurs sans famille restent à leur place. Réutilisé dans
`IndicatorSelectorComponent` et `AdminIndicatorManagerComponent`, avec un filtre
"Familles / indicateurs uniques / tous".

### Visibilité par rôle (`RoleService.canSeeIndicatorContext`)

`frontend/src/app/core/services/role.service.ts` - table
`INDICATOR_VISIBILITY: Record<IndicatorScope, UserRole[]>` :

| `contextType` | Rôles qui voient cet indicateur |
|---|---|
| `learner` | `student` |
| `teacher` | `teacher` |
| `admin` | `admin` |
| `course` | tous |
| `activity` | tous |
| `group` | `teacher`, `admin` |

### Comment changer de rôle pour tester

L'authentification se fait par SSO réel vers PLaTon (section 12) - il n'existe
aucun mécanisme de simulation de rôle côté frontend. Pour tester sous un rôle
donné, se connecter avec un compte PLaTon réel possédant ce rôle, et se
déconnecter/reconnecter avec un autre compte pour changer de rôle.

### Contextes orphelins `teacher`/`admin`

Un indicateur `contextType: 'teacher'` ou `'admin'` est affiché dans le tableau
de bord du teacher/admin lui-même (`contextId = son userId`), exactement comme le
flux `learner`.

---

## 9. Routes API

Toutes les routes sont préfixées `/api`. Les contrôleurs `courses`,
`resources`, `user-preferences` exigent un token valide (`AuthGuard`, voir
section 12) ; les routes d'écriture d'`indicators` et `event-types` exigent en
plus le rôle `admin` (`AdminGuard`) - `event-rules` exige `AdminGuard` sur
**toutes** ses routes, y compris les `GET`. Le reste (`indicators` en lecture,
`ingest*`, `event-types` en lecture...) reste ouvert.

### Indicateurs (`/api/indicators`, `indicators.controller.ts`)

```
GET  /indicators                       - indicateurs actifs
GET  /indicators/all                   - tous (admin)
GET  /indicators/schema                - tables/colonnes PLaTon disponibles (filtrées, voir 12)
GET  /indicators/teacher/:teacherId/context  - cours + groupes d'un enseignant
GET  /indicators/course/:courseId/activities - activités d'un cours
GET  /indicators/course/:courseId/students   - étudiants d'un cours
GET  /indicators/pins?contextType=&contextId=  - indicateurs figés sur un cours/une activité
GET  /indicators/:id
GET  /indicators/:id/context-configs   - alias de compat : { contextType, visualizations, formula }
GET  /indicators/:id/values?contextType=&contextId=&period=&limit=
GET  /indicators/:id/usage
GET  /indicators/:id/logs?limit=

POST /indicators                       - créer (admin)
POST /indicators/dashboard             - valeurs batch pour le tableau de bord
POST /indicators/preview               - { formula, context } → { result } (exécute le DSL - voir 12)
POST /indicators/preview-steps         - idem mais pas-à-pas (debug)
POST /indicators/:id/compute-view      - { contextType, contextId, vizId?, activityId? }
POST /indicators/:id/recalculate       - (admin)
POST /indicators/:id/pins              - { contextType, contextId, thresholdsOverride? } - figer (admin ou enseignant*)
DELETE /indicators/:id/pins?contextType=&contextId=  - défiger (admin ou enseignant*)

PATCH  /indicators/:id                 - (admin)
PATCH  /indicators/:id/status          - (admin)
DELETE /indicators/:id                 - (admin)

GET    /indicators/:id/snapshots?activityId=
POST   /indicators/:id/snapshots       - { contextType, contextId, activityId, title } → 409 si doublon
PATCH  /indicators/:id/snapshots/:snapshotId
DELETE /indicators/:id/snapshots/:snapshotId

POST   /indicators/:id/notify          - notification liée à l'indicateur (admin)
DELETE /indicators/:id/feedback/:feedbackId - (admin)
```

> (admin) = protégé par `AuthGuard` + `AdminGuard` (rôle `admin` requis, voir
> section 12). Les autres routes d'`indicators` restent ouvertes.
>
> (admin ou enseignant*) : pas d'`AdminGuard` sur ces deux routes - seul
> `AuthGuard` s'applique, le contrôle fin (admin **ou** enseignant avec droit
> d'écriture sur le cours concerné) est fait dans
> `IndicatorPinsService#assertCanManagePins`.

> Important : dans le contrôleur, les routes littérales (`schema`, `all`,
> `teacher/:id/context`, `course/:id/activities`, `course/:id/students`,
> `preview`, `preview-steps`, `dashboard`) sont déclarées **avant** `:id`
> pour éviter les conflits de routing Express.

### Préférences utilisateur (`/api/preferences`, `user-preferences.controller.ts`)

```
GET    /preferences
GET    /preferences/:indicatorId
POST   /preferences/:indicatorId     - body accepte userRole?
PATCH  /preferences/:indicatorId     - body accepte userRole?, activeVizId?, enabledVizIds?
DELETE /preferences/:indicatorId
```

Protégé par `AuthGuard` (voir section 12) : l'utilisateur cible est toujours
`request.user.id` (identité vérifiée/décodée depuis le token), jamais un
`?userId=` fourni par le client - accepter un identifiant client ouvrirait un
IDOR permettant de lire/modifier les préférences de n'importe qui en changeant
cet identifiant dans l'URL.

Si `userRole === 'teacher' | 'admin'`, `calculateAndStoreValue` (calcul learner)
est skippé - pas de ligne `indicator_value` learner créée pour un enseignant.

### Cours (`/api/v1/courses`, `courses.controller.ts`)

```
GET /v1/courses                              - recherche (filtres: search, members, period, offset, limit, order, direction)
GET /v1/courses/:id                          - détail (+ statistic: studentCount, teacherCount, activityCount)
GET /v1/courses/:id/sections
GET /v1/courses/:id/activities               - filtres sectionId, challenge ; titre + état + progression + exerciseCount calculés
GET /v1/courses/:id/groups                   - groupes de TP du cours
GET /v1/courses/:id/groups/:groupId/members
GET /v1/courses/:id/members
GET /v1/courses/:courseId/activities/:activityId
GET /v1/courses/:courseId/activities/:activityId/results
GET /v1/courses/:courseId/activities/:activityId/results/date?start=&end=
GET /v1/courses/:courseId/activities/:activityId/csv   - téléchargement CSV
```

> `:courseId` est ignoré pour les routes `activities/:activityId*` (le frontend
> envoie `_` comme courseId) - seul `:activityId` compte côté NestJS.

Protégé par `AuthGuard`. `GET /:id`, `GET /:id/activities` et
`GET /:courseId/activities/:activityId` utilisent `request.user.id` pour
calculer les vraies permissions (`permissions.update`/`delete` pour un cours,
`permissions.update`/`viewStats`/`viewResource` pour une activité) - owner du
cours, rôle global `admin`, ou membre `teacher` du cours (règle répliquée de
PLaTon, voir `course.expander.ts` et `course-member.service.ts` côté PLaTon).

### Ressources (`/api/v1/resources`, `resources.controller.ts`)

```
GET /v1/resources                - recherche (filtres multiples)
GET /v1/resources/tree           - arbre de cercles (type=CIRCLE, personal=false)
GET /v1/resources/completion     - autocomplete
GET /v1/resources/owners         - propriétaires distincts
GET /v1/resources/user-circle    - cercle personnel de l'utilisateur courant
GET /v1/resources/:id
```

Protégé par `AuthGuard`. `user-circle` et `GET /:id` utilisent
`request.user.id` (plus de `?userId=` client). `GET /:id` calcule les vraies
permissions (`write`/`member`/`watcher`/`waiting`) selon la règle PLaTon
(owner du cercle, admin global sur cercle non-personnel, membre accepté du
cercle ou d'un cercle ancêtre - voir `permissions.service.ts` côté PLaTon) ;
`read` reste toujours `true`. Aucune route de mutation n'existe côté
`resources.controller.ts` - ce module reste lecture seule.

### Types d'événements (`/api/event-types`, `event-types.controller.ts`)

```
GET    /event-types?configured=true   - filtre : uniquement les types avec une règle active + installée
POST   /event-types          - (admin)
PATCH  /event-types/:id      - (admin)
DELETE /event-types/:id      - (admin)
```

### Déclencheurs dynamiques (`/api/event-rules`, `event-rules.controller.ts`, section 6bis)

Toutes les routes sont protégées `AuthGuard` + `AdminGuard` (y compris les `GET`
- ces routes exposent des noms de table/colonne PLaTon et du SQL généré).

```
GET    /event-rules
GET    /event-rules/:id
POST   /event-rules
PATCH  /event-rules/:id
DELETE /event-rules/:id                    - désactivation simple (isActive = false), ne touche pas au trigger

GET    /event-rules/:id/preview-sql        - aperçu du DDL d'installation, sans effet
POST   /event-rules/:id/install            - exécute réellement le DDL

GET    /event-rules/:id/preview-uninstall-sql  - aperçu du DDL de retrait, sans effet
POST   /event-rules/:id/uninstall          - exécute le retrait (ou la réduction) puis désactive la règle
```

### Autres modules

```
GET /api/users/:id

POST /api/ingest        - injection directe d'un événement (HTTP, legacy)
POST /api/ingest/batch  - injection directe batch (HTTP, legacy)
```

---

## 10. Frontend

### Routing

```
/                       → redirect /dashboard
/dashboard
  /overview             - grille des indicateurs actifs (+ sélecteur de contexte enseignant)
  /indicators           - onglet "Indicateurs" (préférences + admin)
  /indicator/:id        - détail d'un indicateur
  /courses/...          - pages Cours (copiées/adaptées de PLaTon, voir 3.3)
  /resources/...        - pages Ressources (idem)
```

### Sidebar

Liens : Tableau de bord, Indicateurs, Cours, Espace de travail (Ressources). Pas
d'onglet "Admin" dédié dans la navigation principale - les composants admin
(`admin-indicator-manager`, `indicator-builder`) sont accessibles via l'onglet
"Indicateurs" pour les rôles habilités (`canManageIndicators` /
`canCreateIndicators`).

### `DashboardContext` et persistance du contexte enseignant

```typescript
interface DashboardContext {
  scope: IndicatorScope;   // 'learner' | 'course' | 'group' | ...
  scopeId: string;         // userId | courseId | groupId
  userId: string;
  activityId?: string;     // pour course/group, choisi par l'enseignant
  groupId?: string;
  academicYear?: string;
  semester?: string;
}
```

`TeacherContextSelectorComponent` (Cours → Activité → "Voir par" : cours entier
ou groupe de TP) sauvegarde l'état dans `DashboardSettingsService`
(`TeacherSelectionState`, avec noms lisibles pour affichage). La sélection
cours+activité met à jour le contexte du tableau de bord ; les cartes et la
page détail calculent les valeurs `course`/`group`/`activity` au moment de
l'affichage via `computeView()`. `IndicatorDetailComponent` lit ce contexte
sauvegardé pour afficher une bannière lecture seule "Cours > Activité > Scope"
avec lien "Modifier le filtre".

### `IndicatorCardComponent`

- `learner` → `getIndicatorValue()` (valeur pré-calculée)
- `course`/`group`/`activity` (+ `activityId`) → `computeView()` (cache backend)
- Visualisation active : fixée par la préférence sauvegardée ou
  `visibleVisualizations[0]`. **Pas de chips de sélection sur la carte** -
  le changement de viz se fait uniquement via le modal d'édition (icône crayon).
- `activity` : navigue avec `queryParams = { from: 'activity', activityId,
  courseId, ... }` ; un clic sur un snapshot "groupe" navigue avec `from:
  'group-snapshot'`.

### Page activité (`/dashboard/courses/:id/activities/:activityId`)

Deux sections d'indicateurs :
1. **"Indicateurs"** - `contextType: 'activity'`, cards statiques
2. **"Par groupe"** - `GroupSnapshotsPanelComponent` (`contextType: 'group'`),
   un bloc par indicateur avec une carte par `IndicatorSnapshot` ; ajout via
   dropdown filtré (groupes déjà ajoutés masqués) → `POST .../snapshots` (409 si
   doublon, géré côté UI) ; édition de titre inline, suppression avec
   popconfirm.

### `IndicatorDetailComponent` - filtres de période

Pour les visualisations `line-chart`, un sélecteur de période est affiché :
`7 jours | 30 jours | 90 jours | Tout | Personnalisé` sous forme de
`nz-radio-group` natif Ant Design (`nzButtonStyle="solid"`). L'option
"Personnalisé" affiche un `nz-range-picker` avec bornes inclusives (00:00–23:59).

### Graphiques (`buildChartOptions`)

- **bar-chart** : labels = `resource_name`/noms lisibles (jamais d'UUID),
  tronqués à 25 caractères avec tooltip complet, valeur affichée sur la barre.
- **histogram** : `structuredValue: [{ bucket, count, users?: string[] }]`,
  tooltip enrichi listant les noms.

---

## 11. Flux métier de bout en bout

1. Le frontend charge les indicateurs actifs et les préférences de l'utilisateur
   (`GET /indicators`, `GET /preferences`).
2. Pour un contexte `learner`, la valeur est pré-calculée (lors de l'activation
   de l'indicateur ou via `recalculate`) et simplement lue.
3. Pour `course`/`group`/`activity`, le frontend appelle `compute-view` ; le
   backend vérifie le cache (`indicator_values`), sinon exécute le pipeline DSL
   sur la base PLaTon via `FormulaInterpreterService` + `PlatonService`, stocke
   le résultat et le retourne.
4. Un événement PLaTon déclenche le trigger PostgreSQL sur `SessionData` →
   écrit dans `platon_outbox_events` → `IngestionRelayService` (cron 2s) publie
   vers RabbitMQ → 2 consumers (`indicators.learner` et `indicators.aggregate`)
   traitent en parallèle. Le consumer `learner` met à jour la valeur incrémentale
   ou recalcule en SQL complet. Le consumer `aggregate` dispatch par `contextType`
   (activity/course/group/teacher/admin). Après chaque traitement, `refreshSnapshots()`
   et `refreshActivityViews()` sont appelés en fire-and-forget. Un événement
   `indicator.updated` est émis via WebSocket (`/indicators`) pour la mise à jour
   temps réel du frontend. Voir [`docs/ingestion.md`](docs/ingestion.md) pour le détail.
5. Le frontend affiche la visualisation choisie (carte/jauge/courbe/barres/
   histogramme) selon les préférences (`activeVizId`/`enabledVizIds`) et les
   règles de visibilité par rôle (`RoleService`).

---

## 12. Sécurité et authentification

### Contexte : pourquoi pas un simple `JwtStrategy` classique

Le frontend attache un `Authorization: Bearer <accessToken>` à chaque requête
(`auth.interceptor.ts`), token obtenu en redirigeant l'utilisateur vers le
**PLaTon de production** (`https://platon.univ-eiffel.fr/login`), pas vers
l'instance locale dont on connaît le `.env`. Le secret de signature réel
(`SECRET_KEY` de production) est donc **inconnu** dans cet environnement de
développement - impossible de vérifier la signature du token comme le ferait
PLaTon lui-même (`platon/libs/core/server/.../jwt.strategy.ts`).

### `AuthGuard` (`api/src/modules/core/auth/auth.guard.ts`)

Comportement commuté par `NODE_ENV` (`api/.env`) :

- **`development`** (défaut) : décode le payload du token (`sub`, `username`,
  `exp`) **sans vérifier la signature**, et rejette (401) uniquement si `exp`
  est dépassé. Suffisant pour éjecter un utilisateur dont la session a expiré,
  insuffisant pour empêcher un client de forger un `sub` arbitraire.
- **`production`** : vérification cryptographique complète
  (`jsonwebtoken.verify` avec `jwtSecret`). À utiliser quand `indicateurs` est
  déployé aux côtés de **son propre** PLaTon, avec un secret réellement
  partagé (contrairement à maintenant, où l'authentification passe par le
  PLaTon universitaire externe).

Dans les deux cas, `request.user = { id, username }` est peuplé pour les
guards/contrôleurs suivants.

### `AdminGuard` (`api/src/modules/core/guards/admin.guard.ts`)

Doit toujours être posé **après** `AuthGuard` (`@UseGuards(AuthGuard, AdminGuard)`) :
lit `request.user.id`, vérifie `Users.role === 'admin'` en base PLaTon locale,
sinon 403.

### Ce que ça protège concrètement

| Zone | Protection actuelle |
|---|---|
| Permissions cours/activités | calculées (owner/admin/teacher membre), voir §9 |
| Permissions ressources | calculées en lecture (owner/admin/membre de cercle), voir §9 |
| Mutations indicateurs/event-types | rôle `admin` réellement vérifié (`AdminGuard`) |
| Préférences utilisateur | `userId` toujours forcé à `request.user.id`, jamais accepté depuis le client |
| Session expirée | 401 → `auth.interceptor.ts` vide le `localStorage` et redirige vers `/authentification` |

### Limite connue

En développement, un appel direct à l'API (hors navigateur) avec un `sub`
inventé et un `exp` dans le futur passe le contrôle - `AuthGuard` en mode
`development` ne garantit pas l'authenticité, seulement la fraîcheur. Fermer
complètement ce trou demanderait soit de connaître le secret de production
(non souhaitable à dupliquer), soit de valider chaque token via un appel réseau
à l'API PLaTon de production (`GET /api/v1/users/:username` avec le même
Bearer, comme le fait déjà `authentification.page.ts` au login) - non
implémenté à ce jour, faute d'un besoin de sécurité renforcée en développement.

