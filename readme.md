# Indicateurs — Documentation complète du projet

Ce document décrit l'état réel du dépôt `indicateurs/` : architecture, modèle de
données, moteur de calcul DSL, routes API, frontend, sécurité et limites connues.
L'objectif est qu'une lecture complète de ce fichier suffise à comprendre le
fonctionnement global du projet sans avoir à parcourir tout le code source.

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Démarrage](#2-démarrage)
3. [Architecture des dossiers](#3-architecture-des-dossiers)
4. [Bases de données](#4-bases-de-données)
5. [Modèle de données — entités `indicators`](#5-modèle-de-données--entités-indicators)
6. [Moteur DSL — calcul des indicateurs](#6-moteur-dsl--calcul-des-indicateurs)
7. [Modèle "Option B+" — contextType + visualizations](#7-modèle-option-b--contexttype--visualizations)
8. [Familles d'indicateurs et visibilité par rôle](#8-familles-dindicateurs-et-visibilité-par-rôle)
9. [Routes API](#9-routes-api)
10. [Frontend](#10-frontend)
11. [Flux métier de bout en bout](#11-flux-métier-de-bout-en-bout)
12. [Sécurité — état actuel](#12-sécurité--état-actuel)
13. [Limites connues / reste à faire](#13-limites-connues--reste-à-faire)

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
un **moteur DSL "pipeline"** (voir section 6) — aucune modification de code ni
redéploiement n'est nécessaire pour ajouter un nouvel indicateur.

---

## 2. Démarrage

### Prérequis

- Node.js + npm
- Deux bases PostgreSQL accessibles :
  - **PLaTon** (lecture seule — données pédagogiques existantes)
  - **indicators** (lecture/écriture — créée/synchronisée automatiquement par
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

# Activité utilisée par défaut pour calculer la valeur "learner" d'un indicateur
# quand aucune activité n'est précisée par l'appelant
TARGET_ACTIVITY_ID=

NODE_ENV=development
PORT=3001
JWT_SECRET=
```

Redis est configuré (`redis: { host, port, password }`, valeurs par défaut
`localhost:6379`) mais **n'est utilisé nulle part actuellement**.

### Lancer le backend

```bash
cd api
npm install
nest start --watch     # mode développement, recommandé (recompile auto)
# ou
npm run build && npm run start   # mode prod — lit dist/, recompiler après chaque changement
```

Le serveur écoute sur `http://localhost:3001`, préfixe global `/api`, CORS ouvert
pour `http://localhost:4200` / `http://localhost:3000` / `http://127.0.0.1:4200`.

### Lancer le frontend

```bash
cd frontend
npm install
ng serve
```

Application disponible sur `http://localhost:4200`.

---

## 3. Architecture des dossiers

### 3.1 Backend (`api/src/`)

```
main.ts                — bootstrap NestJS, prefix /api, CORS, ValidationPipe global
app.module.ts          — module racine, importe tous les modules ci-dessous
modules/
  core/
    config/configuration.ts     — lecture des variables d'env (ports, BDD, Redis, cron)
    database/                   — connexions TypeORM (PLATON_DATA_SOURCE + connexion 'indicators')
    guards/admin.guard.ts       — STUB : retourne toujours true, non branché sur les routes
    platon/platon.service.ts    — toutes les requêtes SQL brutes vers la BDD PLaTon
  features/
    indicators/                 — cœur du projet : entités, moteur DSL, CRUD, snapshots
      entities/                 — 5 entités TypeORM (voir section 5)
      calculators/              — legacy hardcodé, ne plus utiliser
      interpreter/formula-interpreter.service.ts — moteur DSL (voir section 6)
      indicators.controller.ts  — toutes les routes /api/indicators*
      indicators.service.ts     — logique métier (computeView, recalculate, snapshots…)
    user-preferences/           — préférences d'affichage par utilisateur
    ingestion/                  — réception d'événements PLaTon en temps réel
    aggregation/                — cron quotidien/hebdo (agrégations)
    activity-indicator/         — endpoint legacy spécifique à un indicateur d'activité
    courses/                    — proxy lecture PLaTon : cours, sections, activités, groupes, résultats
    resources/                  — proxy lecture PLaTon : ressources, arbre de cercles
    groups/                     — groupes de TP d'un enseignant
    users/                      — accès utilisateurs PLaTon (lecture)
```

### 3.2 Frontend (`frontend/src/app/`)

```
app.routes.ts           — route racine → redirige vers /dashboard
core/
  guards/indicator.guard.ts        — vérifie l'existence d'un indicateur :id
  interceptors/auth.interceptor.ts — VIDE (stub, aucun token injecté)
  models/indicator.model.ts        — types partagés (IndicatorDefinition, IndicatorVisualization…)
  services/
    indicator.service.ts           — client HTTP + caches (préférences viz, visibilité)
    dashboard-settings.service.ts  — préférences/contexte de l'utilisateur courant
    role.service.ts                — rôle courant + règles de visibilité (section 8)
    user.service.ts / group.service.ts...
features/
  dashboard/
    dashboard.page.ts/html         — shell (sidebar + toolbar + router-outlet)
    pages/
      overview/                    — grille des indicateurs actifs (+ sélecteur de contexte enseignant)
      indicators/                  — onglet "Indicateurs" : préférences + (admin) gestion
      widgets/sidebar/ + toolbar/ + teacher-context-selector/
  admin/
    admin-indicator-manager.component.ts  — table CRUD admin
    indicator-builder.component.ts        — wizard de création/édition (3 étapes, voir section 6/7)
    indicator-config.component.ts         — config rapide d'affichage
  indicator-selector/    — l'utilisateur active/désactive ses indicateurs
  indicator-detail/      — page détail d'un indicateur (tabs par visualisation)
  activity-indicator/    — ancien composant legacy
  courses/                — pages "Cours" copiées/adaptées depuis PLaTon (voir 3.3)
  resources/              — pages "Ressources" copiées/adaptées depuis PLaTon (voir 3.3)
shared/
  ui/indicator-card/ + statistic-card/ + layout-block/
  pipes/duration.pipe.ts
  utils/indicator-family-grouping.ts  — regroupement par famille (section 8)
  styles/                 — SCSS, thèmes Material clair/sombre, ng-zorro
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
| `course-common.ts` / `course-browser.ts` | `@platon/feature/course/{common,browser}` |
| `resource-common.ts` / `resource-browser.ts` | `@platon/feature/resource/{common,browser}` |
| `feature-result-common.ts` / `feature-result-browser.ts` | `@platon/feature/result/{common,browser}` |
| `feature-tuto-browser.ts`, `feature-peer-browser.ts`, `feature-compiler.ts`, `shared-ui.ts` | divers `@platon/feature/*`, `@platon/shared/ui` |
| `nge-directives.ts`, `nge-pipes.ts`, `nge-ui-icon.ts` | `@cisstech/nge/{directives,pipes,ui/icon}` |

Points clés de ces stubs :
- `AuthService.ready()` retourne un utilisateur basé sur `environment.defaultUserId`
  (pas de vraie authentification).
- `CourseService` / `ResourceService` font de **vrais appels HTTP** vers
  `/api/v1/courses*` et `/api/v1/resources*` (modules `courses`/`resources` du
  backend) — ce ne sont pas des stubs vides pour la lecture, seules les
  **opérations d'écriture** (créer/déplacer/etc.) sont des no-ops car la BDD
  PLaTon est en lecture seule.
- Les composants UI (`UiLayoutTabsComponent`, `UiStatisticCardComponent`,
  `UiSearchBarComponent`, etc.) sont réimplémentés en Angular 21.

---

## 4. Bases de données

### 4.1 Base PLaTon (lecture seule)

Toutes les tables du schéma `public` sont accessibles dynamiquement dans le
builder DSL (plus de whitelist statique) — validées via `information_schema` et
une regex anti-injection dans `PlatonService.queryTable()`.

Tables principales :

| Table | Rôle |
|---|---|
| `SessionData` | Vue dénormalisée (~35 colonnes) : une ligne = une session user × exercice (`user_id`, `activity_id`, `resource_id`, `grade`, `attempts`, `created_at`, …). Table principale pour les formules. |
| `Sessions` / `Activities` / `Resources` / `Users` / `Courses` | Tables sources |
| `CourseGroups` (`id` UUID, `group_id` varchar, `course_id`, `name`) | Groupes de TP |
| `CourseGroupsMember` (`group_id` varchar, `user_id`) | Appartenance aux groupes |

**Particularités du schéma PLaTon (à connaître pour écrire des requêtes/formules)** :
- `Courses` n'a **pas** de colonne `isActive` — filtrer uniquement par `owner_id`.
- `Activities` n'a **pas** de colonne `name` : le titre est dans
  `source->'variables'->>'title'`, avec fallback sur `Resources.name` via
  `LEFT JOIN "Resources" r ON r.id = (a.source->>'resource')::uuid`.
- Aucune contrainte de clé étrangère n'est déclarée dans `information_schema` —
  les relations entre tables (ex. `SessionData.resource_id` → `Resources.id`) ne
  sont **pas** dérivables automatiquement du schéma.

### 4.2 Base `indicators` (lecture/écriture)

Gérée par TypeORM, `synchronize: true` en développement (les tables/colonnes sont
créées/migrées automatiquement au démarrage). 6 entités, détaillées section 5.

---

## 5. Modèle de données — entités `indicators`

### `IndicatorDefinition` (table `indicator_definitions`)

La définition d'un indicateur.

| Champ | Type | Rôle |
|---|---|---|
| `id` | uuid | identifiant |
| `name` | string (unique) | nom affiché |
| `description` | text | description |
| `contextType` | `'learner'\|'teacher'\|'admin'\|'course'\|'activity'\|'group'` | contexte unique de cet indicateur (voir section 7) |
| `familyName` | string \| null | regroupement nominal de plusieurs indicateurs créés ensemble (section 8) |
| `requiredEvents` | jsonb (string[]) | événements PLaTon qui déclenchent un recalcul |
| `visualizations` | jsonb (`IndicatorVisualization[]`) | une ou plusieurs visualisations, chacune avec sa propre formule (section 7) |
| `formula` | jsonb \| null | formule "fallback" utilisée par les visualisations sans formule propre |
| `isActive` | boolean | actif / désactivé |
| `usageCount` | number | compteur d'utilisation |

### `IndicatorValue` (table `indicator_values`)

La valeur calculée pour un contexte donné.

- Contrainte unique `(indicatorId, contextType, contextId)`.
- Pour `course`/`group`/`activity` : `contextId` peut être une **clé composite**
  `courseId:activityId:vizId` (voir `computeView`, section 6).
- Pour `learner` : `contextId = userId`.
- `value: float` — toujours présent (0 si le résultat n'est pas un scalaire).
- `metadata: jsonb` — `{ count?, lastUpdate?, history?, structuredValue?, users?, ... }`
  pour les résultats non scalaires (bar-chart, histogram).

### `IndicatorFormulaVersion` (table `indicator_formula_versions`)

Snapshot versionné (`versionNum`, `formula` jsonb, `createdBy`, `createdAt`) à
chaque modification d'un indicateur. Permet le `rollback`.

### `IndicatorExecutionLog` (table `indicator_execution_logs`)

Un log par exécution de pipeline : `indicatorId`, `userId` (ou `groupId`),
`value`, `durationMs`, `error`, `executedAt`.

### `IndicatorSnapshot` (table `indicator_snapshots`)

"Carte épinglée" d'un indicateur `group` pour une activité donnée (panneau
"Par groupe" de la page activité). Contrainte unique
`(indicatorId, contextType, contextId, activityId)` — anti-doublon. Champs :
`contextId` (= `groupId`), `activityId`, `title`.

### `UserIndicatorPreference` (table `user_indicator_preferences`)

Préférences par utilisateur, contrainte unique `(userId, indicatorId)` :

| Champ | Rôle |
|---|---|
| `isVisible` | l'indicateur est-il activé dans le tableau de bord de cet utilisateur |
| `displayPreferences` | `{ icon?, color? }` |
| `activeVizId` | quelle visualisation est affichée par défaut |
| `enabledVizIds` | sous-ensemble des visualisations que l'utilisateur veut voir (`null` = toutes) |

---

## 6. Moteur DSL — calcul des indicateurs

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
| `fetch` | Charge des lignes depuis une table PLaTon, filtrées selon le contexte. | `table`, `contextFields: string[]` (`user_id`, `activity_id`, `course_id`, `group_id` → mappés depuis `FormulaContext`). Si `group_id` est demandé et que `context.groupId` est défini, déclenche une jointure `CourseGroupsMember`/`CourseGroups` via `queryTableForGroup` (nécessite `activityId` dans le contexte, sinon retourne `[]`). |
| `join` | LEFT/INNER/RIGHT/FULL JOIN entre la sortie courante (table gauche) et une seconde table PLaTon (table droite), indexée en `Map` (O(n)). | `table`, `leftKey`, `rightKey`, `contextFields?` (mêmes filtres que `fetch`), `joinType?: 'left'\|'inner'\|'right'\|'full'` (défaut `'left'`). En cas de fusion, les champs de gauche écrasent ceux de droite en cas de conflit de nom. `right`/`full` ajoutent les lignes droites jamais matchées. CROSS JOIN volontairement non supporté. |
| `filter` | Filtre les lignes selon `field operator value`. | `field`, `operator: '=='\|'!='\|'>'\|'<'\|'>='\|'<='`, `value`. Un opérateur inconnu **lève une erreur** (le pipeline s'arrête, résultat 0). |
| `groupBy` | Regroupe des lignes plates en `any[][]`. | `groupField` |
| `findFirst` | Pour chaque groupe (ou tableau plat), retourne une ligne (triée par `sortField` puis filtrée par `whereField == whereValue`, ou la première sinon). | `whereField?`, `whereValue?`, `sortField?` |
| `extract` | Extrait un champ numérique de chaque ligne (groupes ou plat) → `number[]`. | `extractField` |
| `aggregate` | Agrège un `number[]`. | `aggregateFn: 'avg'\|'sum'\|'count'\|'min'\|'max'` |
| `round` | Arrondit un nombre. | `decimals` (défaut 2) |
| `divide` | Divise par une constante (0 si `divideBy === 0`). | `divideBy` |
| `js` | Exécute du JS arbitraire ; `input` = sortie de l'étape précédente, doit définir/`return` dans `result`. | `code` — exécuté via `vm.runInContext` avec un timeout de 2s. **Voir section 12 : ce n'est pas un sandbox sécurisé.** |

Rétro-compatibilité : les anciens noms de table `sessions`/`activities` sont
mappés vers `SessionData`/`Activities` (`LEGACY_TABLE_MAP`).

### Exemple — "Tentatives moyennes avant première réussite"

```yaml
pipeline:
  - type: fetch
    label: Charger sessions
    params: { table: SessionData, contextFields: [user_id, activity_id] }
  - type: groupBy
    label: Grouper par exercice
    params: { groupField: resource_id }
  - type: findFirst
    label: Première réussite
    params: { whereField: grade, whereValue: 100, sortField: created_at }
  - type: extract
    label: Tentatives
    params: { extractField: attempts }
  - type: aggregate
    label: Moyenne
    params: { aggregateFn: avg }
  - type: round
    label: Arrondir
    params: { decimals: 2 }
```

### `computeView` (`indicators.service.ts`) — calcul + cache

`POST /indicators/:id/compute-view` appelle `computeView(indicatorId, contextType,
contextId, activityId?, vizId?, forceRefresh?)` :

- **Résolution de la formule** : `viz.formula` si elle a un pipeline non vide,
  sinon `indicator.formula` (fallback).
- **Résolution `activityId`** :
  - `learner` → `activityId ?? process.env.TARGET_ACTIVITY_ID`
  - `course`/`group`/`activity` → fourni par l'appelant, pas de fallback
- **Clé de cache** :
  - `learner` → `contextId = userId`
  - `course`/`group`/`activity` → `contextId = ${contextId}:${activityId}:${viz.id}`
  - Si une `IndicatorValue` existe déjà pour cette clé et que `forceRefresh` est
    faux → retournée directement (pas de recalcul).
- **Résolution des noms d'utilisateurs** : si le résultat est un tableau avec un
  champ `userIds[]`, ces ids sont résolus en `"Prénom Nom"` via
  `PlatonService.getUserNameMap()` avant stockage/retour — jamais d'UUID exposé
  côté frontend.

### Snapshots "vivants" — refresh automatique

`IngestionService` appelle, en fire-and-forget après chaque événement PLaTon
ingéré pour une activité, `IndicatorsService.refreshSnapshots(indicatorId,
activityId)` : recalcule (`forceRefresh = true`) **toutes** les
`IndicatorSnapshot` de cette activité, pour chaque visualisation. Les erreurs par
snapshot sont loggées sans bloquer les autres.

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

## 7. Modèle "Option B+" — `contextType` + `visualizations[]`

**1 indicateur = 1 `contextType` unique**, mais peut avoir **N visualisations**
(`visualizations: IndicatorVisualization[]`), chacune avec :

```typescript
interface IndicatorVisualization {
  id: string;          // uuid stable, généré côté builder
  label: string;
  type: 'card' | 'gauge' | 'line-chart' | 'bar-chart' | 'histogram';
  icon?: string;
  color?: string;
  unit?: string;
  thresholds?: { good: number; warning: number; danger: number };
  formula?: { version: '1.0'; pipeline: FormulaStep[] } | null;  // sinon → indicator.formula
}
```

`contextType ∈ { learner, teacher, admin, course, activity, group }`.

### Sélection de la visualisation par l'utilisateur — persistée en BDD

Si un indicateur a plusieurs visualisations, l'utilisateur choisit laquelle
afficher (chips sur la carte, onglets sur la page détail). Le choix est persisté
dans `user_indicator_preferences.active_viz_id` (pas `localStorage`), via
`IndicatorService.setVizPreference()` (cache in-memory + `PATCH
/preferences/:indicatorId`). Cohérence carte ↔ détail garantie par ce cache
partagé.

### Masquage sélectif de visualisations — `enabledVizIds`

L'utilisateur peut aussi masquer certaines visualisations d'un indicateur
(`user_indicator_preferences.enabled_viz_ids`, `null` = toutes visibles). Les
composants utilisent un getter `visibleVisualizations` (filtre
`isVizEnabled`, fallback = toutes si le filtre viderait la liste) au lieu
d'accéder directement à `indicator.visualizations`.

### Wizard admin (`indicator-builder.component.ts`) — flux en 3 étapes

| Étape | Contenu |
|---|---|
| 1. Définition | Nom, description, événements déclencheurs (`requiredEvents`) — pas de contexte ici |
| 2. Vues | Liste plate de "vues" (`FlatView`), chacune avec ses `contextTypes[]`, sa visualisation (type/icône/couleur/unité/seuils) |
| 3. Formule | Pipeline DSL par vue — sélecteur en boutons-onglets, mode Visuel/Import, "Tester" et "Déboguer pas à pas" |

À la soumission, les `FlatView[]` sont reconverties en `visualizations[]` /
`contextType` pour le format backend (`submit()`), et inversement à l'édition
(`hydrate()`, avec fusion par `view.id` si une même vue apparaît dans plusieurs
`contextTypes`).

`FORMULA_RECIPES` fournit des recettes prêtes à l'emploi (Tentatives avant
réussite, Note moyenne, Taux de réussite, Notes moyennes par ressource — avec
`join Resources`, Tentatives par étudiant d'un groupe — avec `join Users`).

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

`frontend/src/app/core/services/role.service.ts` — table
`INDICATOR_VISIBILITY: Record<IndicatorScope, UserRole[]>` :

| `contextType` | Rôles qui voient cet indicateur |
|---|---|
| `learner` | `student` |
| `teacher` | `teacher` |
| `admin` | `admin` |
| `course` | tous (`student`, `teacher`, `admin`, `demo`) |
| `activity` | tous |
| `group` | `teacher`, `admin` |

`demo` suit la règle de `student` (la plus restrictive) faute de spécification
dédiée. `canSeeIndicatorContext()` est appliqué dans `overview.page.ts`,
`indicator-selector.component.ts` et `activity.page.ts` (filtre les indicateurs
`activity` ET `group`). **L'admin (`admin-indicator-manager.component.ts`)
n'applique pas ce filtre** — c'est l'outil de gestion, il doit tout montrer.

### Comment changer de rôle pour tester

⚠️ `localStorage.setItem('userRole', ...)` **ne fonctionne pas** :
`SidebarComponent.loadUser()` appelle `userService.getUserById(environment.defaultUserId)`
puis `roleService.setRole(user.role)` à **chaque chargement de page**, écrasant
toute valeur manuelle.

**Mécanisme réel** : changer `environment.defaultUserId` dans
`frontend/src/environments/environment.ts` vers l'un des UUID de test documentés
en commentaire sur cette ligne (student / admin / teacher).

### Contextes orphelins `teacher`/`admin`

Un indicateur `contextType: 'teacher'` ou `'admin'` est affiché dans le tableau
de bord du teacher/admin lui-même (`contextId = son userId`), exactement comme le
flux `learner`.

---

## 9. Routes API

Toutes les routes sont préfixées `/api`. **Aucune authentification** n'est
appliquée (voir section 12).

### Indicateurs (`/api/indicators`, `indicators.controller.ts`)

```
GET  /indicators                       — indicateurs actifs
GET  /indicators/all                   — tous (admin)
GET  /indicators/schema                — tables/colonnes PLaTon disponibles (filtrées, voir 12)
GET  /indicators/teacher/:teacherId/context  — cours + groupes d'un enseignant
GET  /indicators/course/:courseId/activities — activités d'un cours
GET  /indicators/course/:courseId/students   — étudiants d'un cours
GET  /indicators/:id
GET  /indicators/:id/context-configs   — alias de compat : { contextType, visualizations, formula }
GET  /indicators/:id/values?contextType=&contextId=&period=&limit=
GET  /indicators/:id/usage
GET  /indicators/:id/formula-history
GET  /indicators/:id/logs?limit=

POST /indicators                       — créer
POST /indicators/dashboard             — valeurs batch pour le tableau de bord
POST /indicators/preview               — { formula, context } → { result } (exécute le DSL — voir 12)
POST /indicators/preview-steps         — idem mais pas-à-pas (debug)
POST /indicators/precompute-context    — { contextType, contextId, activityId } → précalcule tous les indicateurs actifs pour ce contexte
POST /indicators/:id/compute-view      — { contextType, contextId, viewId/vizId?, activityId?, forceRefresh? }
POST /indicators/:id/recalculate
POST /indicators/:id/rollback/:versionId

PATCH  /indicators/:id
PATCH  /indicators/:id/status
DELETE /indicators/:id

GET    /indicators/:id/snapshots?activityId=
POST   /indicators/:id/snapshots       — { contextType, contextId, activityId, title } → 409 si doublon
PATCH  /indicators/:id/snapshots/:snapshotId
DELETE /indicators/:id/snapshots/:snapshotId
```

> Important : dans le contrôleur, les routes littérales (`schema`, `all`,
> `teacher/:id/context`, `course/:id/activities`, `course/:id/students`,
> `precompute-context`, `preview`, `preview-steps`, `dashboard`) sont déclarées
> **avant** `:id` pour éviter les conflits de routing Express.

### Préférences utilisateur (`/api/preferences`, `user-preferences.controller.ts`)

```
GET    /preferences?userId=
GET    /preferences/:indicatorId?userId=
POST   /preferences/:indicatorId?userId=     — body accepte userRole?
PATCH  /preferences/:indicatorId?userId=     — body accepte userRole?, activeVizId?, enabledVizIds?
DELETE /preferences/:indicatorId?userId=
```

Si `userRole === 'teacher' | 'admin'`, `calculateAndStoreValue` (calcul learner)
est skippé — pas de ligne `indicator_value` learner créée pour un enseignant.

### Cours (`/api/v1/courses`, `courses.controller.ts`)

```
GET /v1/courses                              — recherche (filtres: search, members, period, offset, limit, order, direction)
GET /v1/courses/:id                          — détail (+ statistic: studentCount, teacherCount, activityCount)
GET /v1/courses/:id/sections
GET /v1/courses/:id/activities               — filtres sectionId, challenge ; titre + état + progression + exerciseCount calculés
GET /v1/courses/:id/groups                   — groupes de TP du cours
GET /v1/courses/:id/groups/:groupId/members
GET /v1/courses/:id/members
GET /v1/courses/:courseId/activities/:activityId
GET /v1/courses/:courseId/activities/:activityId/results
GET /v1/courses/:courseId/activities/:activityId/results/date?start=&end=
GET /v1/courses/:courseId/activities/:activityId/csv   — téléchargement CSV
```

> `:courseId` est ignoré pour les routes `activities/:activityId*` (le frontend
> envoie `_` comme courseId) — seul `:activityId` compte côté NestJS.

### Ressources (`/api/v1/resources`, `resources.controller.ts`)

```
GET /v1/resources                — recherche (filtres multiples)
GET /v1/resources/tree           — arbre de cercles (type=CIRCLE, personal=false)
GET /v1/resources/completion     — autocomplete
GET /v1/resources/owners         — propriétaires distincts
GET /v1/resources/user-circle?userId=  — cercle personnel d'un user
GET /v1/resources/:id
```

### Autres modules

```
GET /api/groups?teacherId=        — groupes de TP d'un enseignant
GET /api/groups/members?groupId=  — membres d'un groupe
GET /api/users/:id

POST /api/ingest        — un événement PLaTon
POST /api/ingest/batch  — plusieurs événements

GET  /api/indicators/activity-attempts/value
GET  /api/indicators/activity-attempts/raw
GET  /api/indicators/activity-attempts/history
GET  /api/indicators/activity-attempts/activities
GET  /api/indicators/activity-attempts/ranking/:activityId
POST /api/indicators/activity-attempts/recalc/:activityId
```
(`activity-indicator` — module legacy, à corriger pour utiliser le DSL, voir
section 13.)

---

## 10. Frontend

### Routing

```
/                       → redirect /dashboard
/dashboard
  /overview             — grille des indicateurs actifs (+ sélecteur de contexte enseignant)
  /indicators           — onglet "Indicateurs" (préférences + admin)
  /indicator/:id        — détail d'un indicateur
  /courses/...          — pages Cours (copiées/adaptées de PLaTon, voir 3.3)
  /resources/...        — pages Ressources (idem)
```

### Sidebar

Liens : Tableau de bord, Indicateurs, Cours, Espace de travail (Ressources). Pas
d'onglet "Admin" dédié dans la navigation principale — les composants admin
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
(`TeacherSelectionState`, avec noms lisibles pour affichage). À chaque
sélection cours+activité, `precomputeContext()` est appelé en fire-and-forget
(crée les `IndicatorValue` avant que l'utilisateur clique sur une carte).
`IndicatorDetailComponent` lit ce contexte sauvegardé pour afficher une bannière
lecture seule "Cours > Activité > Scope" avec lien "Modifier le filtre".

### `IndicatorCardComponent`

- `learner` → `getIndicatorValue()` (valeur pré-calculée)
- `course`/`group`/`activity` (+ `activityId`) → `computeView()` (cache backend)
- Multi-vues : chips si `visibleVisualizations.length > 1`, `selectViz()` change
  la vue active + persiste + recharge.
- `activity` : navigue avec `queryParams = { from: 'activity', activityId,
  courseId, ... }` ; un clic sur un snapshot "groupe" navigue avec `from:
  'group-snapshot'`.

### Page activité (`/dashboard/courses/:id/activities/:activityId`)

Deux sections d'indicateurs :
1. **"Indicateurs"** — `contextType: 'activity'`, cards statiques
2. **"Par groupe"** — `GroupSnapshotsPanelComponent` (`contextType: 'group'`),
   un bloc par indicateur avec une carte par `IndicatorSnapshot` ; ajout via
   dropdown filtré (groupes déjà ajoutés masqués) → `POST .../snapshots` (409 si
   doublon, géré côté UI) ; édition de titre inline, suppression avec
   popconfirm.

### Graphiques (`buildChartOptions`)

- **bar-chart** : labels = `resource_name`/noms lisibles (jamais d'UUID),
  tronqués à 25 caractères avec tooltip complet, valeur affichée sur la barre.
- **histogram** : `structuredValue: [{ bucket, count, users?: string[] }]`,
  tooltip enrichi listant les noms.

---

## 11. Flux métier de bout en bout

1. Le frontend charge les indicateurs actifs et les préférences de l'utilisateur
   (`GET /indicators`, `GET /preferences?userId=`).
2. Pour un contexte `learner`, la valeur est pré-calculée (lors de l'activation
   de l'indicateur ou via `recalculate`) et simplement lue.
3. Pour `course`/`group`/`activity`, le frontend appelle `compute-view` ; le
   backend vérifie le cache (`indicator_values`), sinon exécute le pipeline DSL
   sur la base PLaTon via `FormulaInterpreterService` + `PlatonService`, stocke
   le résultat et le retourne.
4. Un événement PLaTon ingéré (`POST /ingest`) met à jour la valeur `learner`
   correspondante puis déclenche en fire-and-forget `refreshSnapshots()` pour les
   `IndicatorSnapshot` de groupe liées à cette activité.
5. Le frontend affiche la visualisation choisie (carte/jauge/courbe/barres/
   histogramme) selon les préférences (`activeVizId`/`enabledVizIds`) et les
   règles de visibilité par rôle (`RoleService`).

---

## 12. Sécurité — état actuel

⚠️ Ce projet est en développement actif et **n'est pas prêt pour un déploiement
exposé** sans corriger les points suivants.

### Failles critiques non corrigées

- **Aucune authentification** sur `/api/indicators*` (et le reste de l'API).
  `AdminGuard` (`api/src/modules/core/guards/admin.guard.ts`) est un stub qui
  retourne toujours `true` et **n'est branché sur aucune route**.
- **`executeJs` utilise le module Node `vm`**, qui n'est **pas un sandbox de
  sécurité** (échappement connu via `this.constructor.constructor('return
  process')()`). Combiné à l'absence d'auth, `POST /indicators/preview` /
  `/preview-steps` permettent une **exécution de code arbitraire (RCE) non
  authentifiée** en envoyant `{ formula: { pipeline: [{ type: 'js', params: {
  code: '<payload>' } }] }, context: {} }`.
- `create`/`update` (`indicators.service.ts`) ne valident pas le contenu de
  `formula`/`visualizations[].formula` : un pipeline `js` malveillant
  **persisté** est ré-exécuté automatiquement par `refreshSnapshots()` à chaque
  événement PLaTon ingéré (déclenchable par n'importe quel étudiant qui répond à
  un exercice).

→ Priorité : brancher un guard/rôle réel sur les routes d'écriture + preview, et
remplacer `vm` par `isolated-vm`.

### Corrections déjà appliquées

1. **Fuite de colonnes sensibles via `fetch`/`join`** (`platon.service.ts`) —
   `queryTable`/`queryTableForGroup` faisaient `SELECT *` sur n'importe quelle
   table (`Users.password`, `email`, `discord_id`, ...). Fix : constante
   `SENSITIVE_COLUMN_PATTERN` (regex sur le nom de colonne :
   `password|passwd|secret|token|api[_-]?key|hash|salt|credential|email|phone|discord|ip_address`),
   méthode `getSafeColumns(table)` (via `information_schema.columns`, mise en
   cache) + `buildSafeSelect(table)`. Appliqué aussi à `getAvailableTables()`
   (schéma exposé au builder) — les colonnes sensibles ne sont même plus
   sélectionnables dans l'UI.
2. **`executeFilter` — opérateur inconnu** : avant, un opérateur invalide
   laissait passer **toutes** les lignes (`default: return true`). Maintenant
   lève une erreur explicite (pipeline → 0, erreur visible dans les logs/le
   débogueur).
3. **`executeJs` — fuite d'erreurs internes** : la stack complète n'est loggée
   que côté serveur ; le message renvoyé au client masque les chemins
   (`/...` → `[chemin masqué]`) et les références `evalmachine.<anonymous>:N:M`
   (→ `le code`).

### Autres points

- `authInterceptor` (frontend) est vide — aucun token envoyé.
- `DashboardSettingsService` / `TeacherContextSelectorComponent` utilisent
  `environment.defaultUserId` en dur (pas de session réelle).

---

## 13. Limites connues / reste à faire

- **Authentification + guard** sur `/api/indicators*` (priorité haute, lié au
  point RCE ci-dessus).
- Remplacer `vm` par `isolated-vm` pour l'étape `js`.
- **Détection dynamique de compatibilité de jointure** dans l'étape `join` du
  builder — pas encore implémentée. La BDD PLaTon n'a aucune contrainte FK
  déclarée (`information_schema.table_constraints` ne contient aucune
  `FOREIGN KEY`), donc pas de carte de relations dérivable du schéma. Pistes
  envisagées : (1) comparaison des `data_type` des deux colonnes (gratuit, déjà
  disponible côté front via `getAvailableTables()`) ; (2) nouvelle route
  backend exécutant un `COUNT(DISTINCT ...)` croisant un échantillon des deux
  colonnes pour estimer le nombre de correspondances.
- `TeacherContextSelectorComponent` utilise `environment.defaultUserId` comme
  `teacherId` — à remplacer par l'utilisateur connecté une fois l'auth en place.
- `ActivityIndicatorService` (module legacy `activity-attempts`) doit être migré
  pour utiliser le moteur DSL au lieu de sa logique hardcodée.
- Filtres de date sur la page des logs d'exécution.
- Diff visuel entre deux versions de formule (`indicator_formula_versions`).
- Redis configuré (`configuration.ts`) mais inutilisé.
- Aucun test unitaire sur `FormulaInterpreterService`.
- Page `/dashboard/resources/move` référencée dans l'UI mais route non créée.
