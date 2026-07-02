# Parcours de données - du composant frontend à la base de données

Ce document complète `readme.md` (qui liste les routes API par contrôleur, §9)
en traçant, **fichier par fichier**, le chemin complet de
chaque cercle de requêtes : composant Angular → service frontend → appel HTTP
→ contrôleur NestJS → service backend (avec ses cascades) → accès aux données
(PLaTon en lecture seule, ou `indicators` en lecture/écriture) → effets de
bord éventuels.

L'objectif : pouvoir partir d'un écran de l'application et remonter/descendre
toute la chaîne de fichiers sans avoir à grep le projet.

## Sommaire

0. [Conventions](#0-conventions)
1. [Fichier pivot frontend - `indicator.service.ts`](#1-fichier-pivot-frontend--indicatorservicets)
2. [A - Tableau de bord (Overview)](#a--tableau-de-bord-overview)
3. [B - Carte indicateur (`IndicatorCardComponent`)](#b--carte-indicateur-indicatorcardcomponent)
4. [C - Détail d'un indicateur](#c--détail-dun-indicateur)
5. [D - Préférences utilisateur](#d--préférences-utilisateur)
6. [E - Administration des indicateurs](#e--administration-des-indicateurs)
7. [F - Page activité & snapshots de groupe](#f--page-activité--snapshots-de-groupe)
8. [G - Cours](#g--cours)
9. [H - Ressources](#h--ressources)
10. [I - Ingestion d'événements PLaTon](#i--ingestion-dévénements-platon)
11. [J - Modules legacy / orphelins](#j--modules-legacy--orphelins)
12. [Annexe - Tables et entités référencées](#annexe--tables-et-entités-référencées)

---

## 0. Conventions

- Chemins **frontend** relatifs à `indicateurs/frontend/src/app/` (sauf
  mention contraire, ex. `platon-stubs/`).
- Chemins **backend** relatifs à `indicateurs/api/src/`.
- Préfixe global de l'API : `/api` (`main.ts`, `setGlobalPrefix('api')`).
- `environment.apiUrl` et `environment.indicatorsApiUrl` valent tous deux
  `http://localhost:3001/api` (`environments/environment.ts`) - ce sont
  deux alias de la même base.
- Deux connexions TypeORM : `'platon'` (lecture seule, tables PLaTon en
  `PascalCase` type `"Users"`, `"Courses"`...) et `'indicators'`
  (lecture/écriture, tables `snake_case` type `indicator_values`).

---

## 1. Fichier pivot frontend - `indicator.service.ts`

`core/services/indicator.service.ts` est injecté par presque toutes les
pages. `apiUrl = ${environment.apiUrl}/indicators`,
`preferencesUrl = ${environment.apiUrl}/preferences`.

| Méthode | Verbe + URL | Utilisée dans |
|---|---|---|
| `loadIndicators()` | `GET {apiUrl}` | A.1, C, E.1 |
| `loadAllForAdmin()` | `GET {apiUrl}/all` | E.1 |
| `getIndicatorValue(id, contextType, contextId)` | `GET {apiUrl}/:id/values?contextType=&contextId=` | B.1 |
| `getIndicatorHistory(id, contextId, limit)` | `GET {apiUrl}/:id/values?contextType=learner&contextId=&limit=` | non câblée dans un composant identifié |
| `getUserPreferences(userId)` | `GET {preferencesUrl}?userId=` | A.1 (via `dashboard-settings.service.ts`) |
| `createIndicator(data)` | `POST {apiUrl}` | E.1 |
| `updateIndicator(id, data)` | `PATCH {apiUrl}/:id` | E.1 |
| `updateIndicatorStatus(id, isActive)` | `PATCH {apiUrl}/:id/status` | E.1 |
| `deleteIndicator(id)` | `DELETE {apiUrl}/:id` | E.1 |
| `setUserIndicatorVisibility(userId, id, isVisible, userRole?)` | `PATCH {preferencesUrl}/:id?userId=` body `{isVisible, userRole?}` | D |
| `getIndicatorUsageCount(id)` | `GET {apiUrl}/:id/usage` | E.1 |
| `recalculateIndicator(id)` | `POST {apiUrl}/:id/recalculate` | E.3 |
| `previewFormulaRaw(formula, context)` | `POST {apiUrl}/preview` | E.2 |
| `previewFormulaSteps(formula, context)` | `POST {apiUrl}/preview-steps` | E.2 |
| `getExecutionLogs(id, limit=50)` | `GET {apiUrl}/:id/logs?limit=` | E.5 |
| `getPlatonSchema()` | `GET {apiUrl}/schema` | E.2, E.6 |
| `computeView(id, contextType, contextId, activityId?, vizId?)` | `POST {apiUrl}/:id/compute-view` | B.2, C, F |
| `getTeacherContext(teacherId)` | `GET {apiUrl}/teacher/:teacherId/context` | A.2, E.2 |
| `getCourseActivities(courseId)` | `GET {apiUrl}/course/:courseId/activities` | A.2, E.2 |
| `getCourseStudents(courseId)` | `GET {apiUrl}/course/:courseId/students` | E.2 |
| `getSnapshots(id, activityId)` | `GET {apiUrl}/:id/snapshots?activityId=` | F |
| `createSnapshot(id, body)` | `POST {apiUrl}/:id/snapshots` | F |
| `updateSnapshotTitle(id, snapshotId, title)` | `PATCH {apiUrl}/:id/snapshots/:snapshotId` | F |
| `deleteSnapshot(id, snapshotId)` | `DELETE {apiUrl}/:id/snapshots/:snapshotId` | F |
| `getVizPreference(id)` | cache local, pas de HTTP | B, C |
| `setVizPreference(userId, id, vizId)` | `PATCH {preferencesUrl}/:id?userId=` body `{activeVizId}` (fire-and-forget) | B.3, C |
| `getEnabledVizIds`/`isVizEnabled` | cache local, pas de HTTP | D |
| `setEnabledVizIds(userId, id, vizIds)` | `PATCH {preferencesUrl}/:id?userId=` body `{enabledVizIds}` (fire-and-forget) | D |

---

## A - Tableau de bord (Overview)

### A.1 Chargement initial - `/dashboard/overview`

1. `features/dashboard/pages/overview/overview.page.ts` `ngOnInit()` :
   restaure le contexte enseignant sauvegardé
   (`dashboard-settings.service.ts` → `getTeacherState()`), puis appelle
   `loadActiveIndicators()` et `loadIndicators()`.
2. `loadIndicators()` → `indicatorService.loadIndicators()`
   (`indicator.service.ts`) → **`GET /api/indicators`**
   → `indicators.controller.ts` `getAllIndicators` →
   `indicators.service.ts` `findAllActive` → repo `indicatorModel`
   (connexion `'indicators'`, table `indicator_definitions`,
   `where: { isActive: true }`).
3. `loadActiveIndicators()` → `dashboard-settings.service.ts`
   `getSettings()` (observable local). Ce cache est alimenté au démarrage du
   service par `loadSettings()` (`dashboard-settings.service.ts`) →
   `indicatorService.getUserPreferences(currentUserId)`
   (`indicator.service.ts`) → **`GET /api/preferences?userId=`**
   → `user-preferences.controller.ts` `getUserPreferences` →
   `user-preferences.service.ts` → repo `preferenceRepository`
   (table `user_indicator_preferences`, relation jointe → `indicator_definitions`).

### A.2 Sélecteur de contexte enseignant - `TeacherContextSelectorComponent`

`features/dashboard/pages/widgets/teacher-context-selector/teacher-context-selector.component.ts`

1. `ngOnInit()` :
   - `indicatorService.getTeacherContext(environment.defaultUserId)` →
     **`GET /api/indicators/teacher/:teacherId/context`** →
     `indicators.controller.ts` `getTeacherContext` →
     `indicators.service.ts` → `PlatonService.getCoursesWithGroupsForTeacher`
     (`api/src/modules/core/platon/platon.service.ts`) :
     - `SELECT id, name FROM "Courses" WHERE owner_id = $1`
     - puis pour chaque cours, `SELECT id, name FROM "CourseGroups" WHERE course_id = $1`
   - si une sélection précédente existe (`saved.courseId`),
     `indicatorService.getCourseActivities(saved.courseId)` →
     **`GET /api/indicators/course/:courseId/activities`** →
     `indicators.controller.ts` → `indicators.service.ts` →
     `PlatonService.getActivitiesByCourse` (`platon.service.ts`) :
     `FROM "Activities" a LEFT JOIN "Resources" r ON r.id = (a.source->>'resource')::uuid WHERE a.course_id = $1`.
2. `onCourseChange(courseId)` (changement de sélection cours,
   template `nz-select`) → même appel `getCourseActivities(courseId)`.
3. `onScopeTypeChange` / `onActivityChange` → `emitContext()` :
   - construit un `DashboardContext` et l'émet via `@Output() contextChange`
     → `overview.page.ts` `onTeacherContextChange()`.
   - la sélection met à jour le contexte global du dashboard : il n'existe pas
     de route `/api/indicators/precompute-context` dans le backend actuel.
     Les cartes et la page détail calculent les valeurs `course`/`group`/
     `activity` à la demande via `computeView()` lorsque l'utilisateur les affiche.

---

## B - Carte indicateur (`IndicatorCardComponent`)

`shared/ui/indicator-card/indicator-card.component.ts`

### B.1 Contexte `learner` / `teacher` / `admin` - valeur déjà pré-calculée

1. `ngOnInit()`/`ngOnChanges()` → `loadValue()`.
2. Branche valeur directe : `indicatorService.getIndicatorValue(indicator.id, scope, context.scopeId)`
   (`indicator.service.ts`) → **`GET /api/indicators/:id/values?contextType=&contextId=`**
   → `indicators.controller.ts` `getIndicatorValues` →
   `indicators.service.ts` `getValues` :
   - appelle `findById(id)` (table `indicator_definitions`)
   - lit `indicatorValueModel` (table `indicator_values`,
     `where: { indicatorId, contextType, contextId }`, dernière(s) valeur(s))
   - calcule la tendance via `calculateTrend` (comparaison avec la
     valeur précédente)
   - **Aucun calcul DSL ici** : si `indicator_values` ne contient rien pour
     ce contexte (ex. l'utilisateur n'a jamais activé l'indicateur), la
     valeur retournée est vide/0 - la ligne est créée par
     `calculateAndStoreValue` (voir D.1) ou `recalculate` (E.3).

### B.2 Contexte `course` / `group` / `activity` - `compute-view` (cascade complète)

1. Branche compute-view de `loadValue()` : `activityId = scope === 'activity' ? undefined : context.activityId`,
   puis `indicatorService.computeView(indicator.id, scope, context.scopeId, activityId, vizId)`
   (`indicator.service.ts`) → **`POST /api/indicators/:id/compute-view`**
   body `{contextType, contextId, activityId?, vizId?}`.
2. `indicators.controller.ts` `computeView` → `indicators.service.ts`
   `computeView` :
   1. `findById(indicatorId)` → `IndicatorDefinition`
      (table `indicator_definitions`).
   2. Résout la visualisation ciblée (`vizId` ou
      `visualizations[0]`) et la formule effective (formule de la viz, sinon
      `indicator.formula` legacy). Pas de pipeline → `BadRequestException`.
   3. Calcule `resolvedActivityId` et la clé de cache
      `cacheContextId` (inclut `:activityId` et `:vizId` si présents).
   4. **Cache** : si `!forceRefresh`, lecture
      `indicatorValueModel` (table `indicator_values`,
      `where: { indicatorId, contextType, contextId: cacheContextId }`).
      Si trouvé → retour immédiat, **pas d'exécution DSL**.
   5. Construit le `formulaContext` selon `contextType`
      (`{ userId|courseId|groupId, activityId, indicatorId }`).
   6. **Exécution DSL** :
      `formulaInterpreter.interpret(formula, formulaContext)` → point
      d'entrée `interpreter/formula-interpreter.service.ts`
      `interpret()` (moteur DSL, voir `readme.md` §6 pour le détail des
      10 types d'étapes).
   7. **Post-traitement noms** : si le résultat est un tableau de
      buckets avec `userIds`, appel
      `PlatonService.getUserNameMap(allIds)`
      (`platon.service.ts`) → `SELECT id, first_name, last_name
      FROM "Users" WHERE id = ANY($1)` (table PLaTon `Users`) - remplace les
      UUID par des noms lisibles dans `structuredValue`.
   8. **Écriture cache** : `indicatorValueModel.upsert(...)` sur
      `indicator_values` (clé de conflit `indicatorId, contextType, contextId`).
   9. **Log d'exécution** : écrit *à l'intérieur* de `interpret()`
      (`formula-interpreter.service.ts`) dans `indicator_execution_logs`
      (entité `IndicatorExecutionLog`), car `formulaContext.indicatorId` est
      toujours défini ici (étape 5).
   10. Retourne `{ value, structuredValue, metadata }`.

### B.3 Sélection de visualisation - `selectViz`

1. Clic sur un `.viz-chip` (template `indicator-card.component.html`,
   visible si `visibleVisualizations.length > 1`) → `selectViz(viz, event)`
   `indicator-card.component.ts`.
2. `indicatorService.setVizPreference(environment.defaultUserId, indicator.id, viz.id)`
   (`indicator.service.ts`) → **`PATCH /api/preferences/:indicatorId?userId=`**
   body `{activeVizId: viz.id}` (fire-and-forget) → `user-preferences.controller.ts`
   `updatePreference` → `user-preferences.service.ts` (voir D.2 pour
   la cascade complète de `updatePreference`).
3. Re-`loadValue()` → relance B.1 ou B.2 selon le `scope`, avec le
   nouveau `vizId`.

### Navigation vers le détail

`indicator-card.component.html` :
`[routerLink]="['/dashboard/indicator', indicator.id]"` avec
`[queryParams]="queryParams"` - `queryParams` est passé en `@Input` par le
parent (voir F pour `from: 'activity'` / `from: 'group-snapshot'`).

---

## C - Détail d'un indicateur

`features/indicator-detail/indicator-detail.component.ts`

1. `ngOnInit()` : lit `route.snapshot.paramMap.get('id')` et
   `route.snapshot.queryParams`.
   - Si `q['from'] === 'group-snapshot'` : initialise un contexte
     `group` depuis les queryParams (`groupId`, `activityId`, ... transmis
     par `GroupSnapshotsPanelComponent`, voir F).
   - Si `q['from'] === 'activity'` : initialise un contexte
     `activity` (transmis par `activity.page.ts`, voir F).
   - Sinon, si l'utilisateur est enseignant : restaure
     `dashboard-settings.service.ts` → `getTeacherState()` - affiche la
     bannière lecture seule "Cours > Activité > Scope" décrite dans
     `readme.md` §10.
   - Appelle `loadIndicator(id)`.
2. `loadIndicator(id)` :
   - `indicatorService.loadIndicators()` → **`GET /api/indicators`**
     (cache, voir A.1).
   - Restaure la préférence de viz active via `getVizPreference(id)`
     (cache local).
   - Si `canCompute && activeViz` → `computeViz(activeViz)`.
3. `onVizTabChange(index)` (changement d'onglet `NzTabs`,
   `indicator-detail.component.html`) :
   - `indicatorService.setVizPreference(environment.defaultUserId, indicator.id, viz.id)`
     → **`PATCH /api/preferences/:indicatorId?userId=`** body
     `{activeVizId}` - même endpoint que B.3 → D.2.
   - Si pas encore calculé pour cette viz → `computeViz(viz)`.
4. `computeViz(viz)` :
   `indicatorService.computeView(indicator.id, activeContextType, activeContextId, activityIdParam, viz.id)`
   → **`POST /api/indicators/:id/compute-view`** - **cascade
   identique à B.2**. Le résultat est stocké dans `results[viz.id]`, puis
   `buildChartOptions(viz, result)` (purement local) construit les
   options ECharts (bar/gauge/line/histogram, voir `readme.md` §10
   "Graphiques").

---

## D - Préférences utilisateur

`api/src/modules/features/user-preferences/` - préfixe `@Controller('preferences')`
→ `/api/preferences` (PAS de sous-préfixe `/indicators`).

### D.1 Activer / désactiver un indicateur - `IndicatorSelectorComponent`

`features/indicator-selector/indicator-selector.component.ts`

1. `toggleIndicator(indicatorId, active)` (déclenché par le
   `nz-switch` "actif" du tableau, `indicator-selector.component.html`) :
   - si `active` → `dashboard-settings.service.ts`
     `addActiveIndicator(indicatorId)` →
     `indicatorService.setUserIndicatorVisibility(currentUserId, indicatorId, true, role)`
     (`indicator.service.ts`) → **`PATCH /api/preferences/:indicatorId?userId=`**
     body `{isVisible: true, userRole}`.
   - sinon → `dashboard-settings.service.ts`
     `removeActiveIndicator(indicatorId)` → même PATCH avec
     `{isVisible: false, userRole}`.
2. Backend : `user-preferences.controller.ts` `updatePreference` →
   `user-preferences.service.ts` `updatePreference` :
   1. `preferenceRepository.findOne({ where: { userId, indicatorId }, relations: ['indicator'] })`
      (table `user_indicator_preferences`).
   2. Calcule `wasVisible`/`willBeVisible`. Si pas de préférence
      existante, en crée une nouvelle en mémoire avec `isVisible: true`.
   3. Applique les champs fournis (`isVisible`,
      `displayPreferences`, `activeVizId`, `enabledVizIds`).
   4. `preferenceRepository.save(preference)` → upsert dans
      `user_indicator_preferences`.
   5. **Effets de bord conditionnels** :
      - transition `false → true` (devient visible) :
        `incrementUsageCount(indicatorId)` (méthode privée →
        `indicatorRepository.increment({ id }, 'usageCount', 1)` sur
        `indicator_definitions`), puis re-fetch
        `indicatorRepository.findOne({ where: { id, isActive: true } })` et
        si trouvé, `calculateAndStoreValue(userId, indicator)`
        (voir ci-dessous).
      - transition `true → false` : `decrementUsageCount(indicatorId)`
        (`usageCount` -1).

>  **Précision** : le body accepte un champ `userRole`, mais il n'est
> **jamais lu** côté service - la condition de skip de
> `calculateAndStoreValue` (ci-dessous) se base uniquement sur
> `indicator.contextType` (champ de `IndicatorDefinition`), pas sur
> `userRole`.

### `calculateAndStoreValue` (`user-preferences.service.ts`)

Méthode privée appelée par `createPreference` (POST) et
`updatePreference` (PATCH si transition vers visible) :

- **Skip** : `if (!['learner', 'teacher', 'admin'].includes(indicator.contextType)) return;`
  → pour les indicateurs `course`/`group`/`activity`, **aucun pré-calcul**
  ici (le calcul se fait à la demande via `compute-view`, voir B.2).
- si `formula?.pipeline?.length` vide → `return` sans calcul.
- sinon,
  `formulaInterpreter.interpret(formulaToUse, { userId, activityId: process.env.TARGET_ACTIVITY_ID, indicatorId: indicator.id })`
  (point d'entrée `formula-interpreter.service.ts`). En cas d'erreur,
  warning loggé, `value` reste `0`.
- `indicatorValueRepository.upsert({ indicatorId, contextType: indicator.contextType, contextId: userId, value, metadata: {...} }, { conflictPaths: ['indicatorId','contextType','contextId'] })`
  → upsert dans `indicator_values`.

### D.2 Choix de visualisation active / masquage de visualisations

- `setVizPreference` (B.3, C.3) → **`PATCH /api/preferences/:indicatorId?userId=`**
  body `{activeVizId}` → cascade `updatePreference` ci-dessus (sans
  transition de visibilité, donc sans effet sur `usageCount` ni
  `calculateAndStoreValue`).
- **Masquage sélectif** (`enabledVizIds`) : `indicator-selector.component.ts`
  `toggleViz(indicator, viz, event)` (clic sur les chips de visualisation du
  tableau) → `indicatorService.setEnabledVizIds(environment.defaultUserId, indicator.id, persisted)`
  (`indicator.service.ts`) → **`PATCH /api/preferences/:indicatorId?userId=`**
  body `{enabledVizIds}` (fire-and-forget) → même cascade `updatePreference`.

### D.3 Suppression de préférence

`DELETE /api/preferences/:indicatorId?userId=` →
`user-preferences.controller.ts` `deletePreference` →
`user-preferences.service.ts` :
1. `findOne({ where: { userId, indicatorId } })` - 404 si absent.
2. `delete({ userId, indicatorId })` → suppression dans
   `user_indicator_preferences`.
3. Si `wasVisible` était `true` : `decrementUsageCount(indicatorId)`.

*(Aucun composant identifié n'appelle ce DELETE - endpoint exposé mais non
câblé côté UI à ce jour.)*

---

## E - Administration des indicateurs

Onglet "Indicateurs" → `features/dashboard/pages/indicators/indicators.page.ts`,
visible pour `canManageIndicators`/`canCreateIndicators` (`RoleService`).

### E.1 Liste admin + CRUD - `AdminIndicatorManagerComponent`

`features/admin/admin-indicator-manager.component.ts`

1. `ngOnInit()` → `load()` →
   `indicatorSvc.loadAllForAdmin()` (`indicator.service.ts`) →
   **`GET /api/indicators/all`** → `indicators.controller.ts`
   `getAllForAdmin` → `indicators.service.ts` `findAllForAdmin` (sans
   filtre `isActive`, table `indicator_definitions`).
2. `toggleActive(indicator)` (`nz-switch` "Statut") →
   `indicatorSvc.updateIndicatorStatus(indicator.id, indicator.isActive)`
   → **`PATCH /api/indicators/:id/status`** →
   `indicators.controller.ts` `toggleStatus` →
   `indicators.service.ts` `toggleStatus` (met à jour
   `isActive` dans `indicator_definitions`).
3. `deleteIndicator(indicator)` (`nz-popconfirm`) →
   `indicatorSvc.deleteIndicator(indicator.id)` →
   **`DELETE /api/indicators/:id`** → `indicators.controller.ts`
   `deleteIndicator` → `indicators.service.ts` `delete` (suppression
   dans `indicator_definitions`, cascade ORM sur `indicator_values`,
   `indicator_execution_logs`,
   `indicator_snapshots`, `user_indicator_preferences` selon les relations
   de l'entité).
4. `openBuilder(indicator?)` → ouvre `IndicatorBuilderComponent`
   (modale CRUD complète, voir tableau ci-dessous) ; recharge `load()` si la
   modale retourne "saved".
5. `openFamilyWizard()` / `openFamilyMember()` : enchaîne plusieurs
   `IndicatorBuilderComponent` (un par contexte de le cercle) - voir
   `project_indicateur_famille_feature` pour le détail fonctionnel.

### `IndicatorBuilderComponent` - `features/admin/indicator-builder.component.ts`

| Action UI | Appel → URL |
|---|---|
| Ouverture du builder (chargement du catalogue DSL) | `getPlatonSchema()` → **`GET /api/indicators/schema`** |
| Sélection cours/activité pour "Tester" | `getTeacherContext(environment.defaultUserId)` → **`GET /api/indicators/teacher/:teacherId/context`** |
| Sélection cours pour "Tester" | `getCourseActivities(courseId)` → **`GET /api/indicators/course/:courseId/activities`** |
| Sélection cours pour "Tester" (élèves) | `getCourseStudents(courseId)` → **`GET /api/indicators/course/:courseId/students`** |
| Bouton "Prévisualiser" | `previewFormulaRaw(buildFormulaForViz(v), context)` → **`POST /api/indicators/preview`** |
| Bouton "Étapes de débogage" | `previewFormulaSteps(buildFormulaForViz(v), context)` → **`POST /api/indicators/preview-steps`** |
| Sauvegarde - édition | `updateIndicator(modalData.indicator.id, payload)` → **`PATCH /api/indicators/:id`** |
| Sauvegarde - création | `createIndicator(payload)` → **`POST /api/indicators`** |

#### `POST /indicators` et `PATCH /indicators/:id` - cascade

- `indicators.controller.ts` `createIndicator` →
  `indicators.service.ts` `create` : insère dans
  `indicator_definitions`, puis si `pipeline.length > 0`,
  `saveFormulaVersion(...)` (insert dans
  `indicator_formula_versions`).
- `indicators.controller.ts` `updateIndicator` →
  `indicators.service.ts` `update` : `findById(id)`, met à
  jour `indicator_definitions`, et si la formule a changé, même
  `saveFormulaVersion`.

### `getCourseStudents` (`/course/:courseId/students`)

`indicators.controller.ts` → `indicators.service.ts` →
`PlatonService.getStudentsByCourse` (`platon.service.ts`) :
`SELECT ... FROM "Users" u ...` filtré par cours (table PLaTon `Users`,
jointure sur `CourseMembers`).

### E.2 Preview / preview-steps (debug DSL)

- **`previewFormulaRaw`** → `indicators.controller.ts`
  `previewFormula` → `indicators.service.ts` `preview` →
  `formulaInterpreter.interpret(formula, context)`
  (`interpreter/formula-interpreter.service.ts`). Comme `formulaContext`
  ne contient pas `indicatorId`, **aucun log** n'est écrit dans
  `indicator_execution_logs` et **aucune écriture cache**. Retourne
  `{ result }`.
- **`previewFormulaSteps`** → `indicators.controller.ts`
  `previewFormulaSteps` → `indicators.service.ts` `previewSteps` →
  `formulaInterpreter.interpretWithSteps(formula, context)`
  (`interpreter/formula-interpreter.service.ts`). Capture l'état
  intermédiaire après chaque étape du pipeline, s'arrête à la première étape
  en erreur (avec `error`, sans réduire le résultat à 0), n'écrit jamais de
  log. Retourne `{ steps: [...] }`.

### E.3 Recalcul d'un indicateur - `recalculate`

`AdminIndicatorManagerComponent.recalculate(indicator)`
(`nz-popconfirm`) → `indicatorSvc.recalculateIndicator(indicator.id)`
(`indicator.service.ts`) → **`POST /api/indicators/:id/recalculate`**
→ `indicators.controller.ts` `recalculate` →
`indicators.service.ts` `recalculate` :

1. Résout la formule effective (`visualizations[].formula` ou
   `indicator.formula` legacy).
2. `preferenceModel` → liste des `userId` ayant activé
   l'indicateur (table `user_indicator_preferences`).
3. Boucle par lots de 10 (`BATCH`), pour chaque `userId` :
   - `PlatonService.getUserSessionData(userId)`
     (`platon.service.ts`) → `SELECT ... FROM "SessionData" WHERE user_id = $1`
     (table PLaTon `SessionData`).
   - Détermine `latestActivityId` (session la plus récente).
   - `formulaInterpreter.interpret(formula, { userId, activityId, indicatorId })`
     (`formula-interpreter.service.ts`) - écrit aussi un log dans
     `indicator_execution_logs` (car `indicatorId` fourni).
   - `indicatorValueModel.upsert(...)` sur `indicator_values`,
     `contextType: 'learner'`, `contextId: userId`.
4. Retourne `{ processed, updated, failed }`.

### E.4 Logs d'exécution

`admin-indicator-manager.component.ts` `openLogs(indicator)` →
`indicatorSvc.getExecutionLogs(indicator.id, 100)`
(`indicator.service.ts`) → **`GET /api/indicators/:id/logs?limit=100`**
→ `indicators.controller.ts` `getExecutionLogs` →
`indicators.service.ts` `getExecutionLogs` → repo `logModel`
(table `indicator_execution_logs`, `where: { indicatorId }`, `take: limit`,
triées par date décroissante). Ces lignes sont écrites par `interpret()`
(B.2 étape 9, E.2, E.3, F).

### E.6 Schema PLaTon (catalogue tables/colonnes pour le builder)

`indicatorService.getPlatonSchema()` (`indicator.service.ts`) →
**`GET /api/indicators/schema`** → `indicators.controller.ts`
`getPlatonSchema` → `indicators.service.ts` →
`PlatonService.getAvailableTables` (`platon.service.ts`) :

1. `SELECT ... FROM information_schema.columns WHERE table_schema = 'public'`,
   triée par `table_name, ordinal_position`.
2. **Filtrage de sécurité** :
   `if (PlatonService.SENSITIVE_COLUMN_PATTERN.test(row.column_name)) continue;`
   - pattern défini dans `platon.service.ts` :
   `/password|passwd|secret|token|api[_-]?key|hash|salt|credential|email|phone|discord|ip_address/i`.
3. Regroupe par table dans une `Map`, retourne
   `[{ name, columns: [{name, type}] }]`.

> Le même pattern est réutilisé par `getSafeColumns` et
> `buildSafeSelect`, utilisés par les étapes `fetch`/`join` du
> moteur DSL et par `queryTableForGroup` - la sécurité est donc
> cohérente entre le schéma exposé au builder et les requêtes réellement
> exécutées par `interpret()` (B.2).

---

## F - Page activité & snapshots de groupe

`/dashboard/courses/:id/activities/:activityId` →
`features/courses/course/activity/activity.page.ts`

### F.1 Chargement des indicateurs de la page

1. `ngOnInit()` → `loadActivityIndicators()` :
   `combineLatest([indicatorService.loadIndicators(), settingsService.getSettings()])`
   → **`GET /api/indicators`** (A.1) + cache des préférences.
   Filtre `activityIndicators` (`contextType === 'activity'`) et
   `groupIndicators` (`contextType === 'group'`).
2. `presenter.contextChange.subscribe(...)` (déclenché par
   `ActivityPresenter`, qui charge l'activité - voir G.4) construit :
   - `activityContext: DashboardContext` (`scope: 'activity'`) -
     consommé par `<ui-indicator-card>` pour `activityIndicators` →
     **cascade B.2** avec `contextType: 'activity'`.
   - `indicatorQueryParams` (`from: 'activity', activityId, courseId,
     activityName, courseName`) - passé en `[queryParams]` aux
     `<ui-indicator-card>` pour la navigation vers `indicator-detail` (C,
     branche `q['from'] === 'activity'`).

### F.2 Section "Par groupe" - `GroupSnapshotsPanelComponent`

`features/courses/course/activity/group-snapshots-panel.component.ts`

1. `ngOnInit()` → `loadGroups().then(() => loadAllSnapshots())`.
2. `loadGroups()` : appel **HTTP direct via `HttpClient`** (pas via
   `indicator.service.ts`) → **`GET {environment.apiUrl}/v1/courses/:courseId/groups`**
   (`apiBase = ${environment.apiUrl}/v1`) → voir G.3 pour la cascade
   backend (`courses.controller.ts` → `courses.service.ts` →
   table PLaTon `CourseGroups`).
3. `loadAllSnapshots()` : pour chaque indicateur de
   `groupIndicators`, `indicatorService.getSnapshots(ind.id, activityId)`
   (`indicator.service.ts`) → **`GET /api/indicators/:id/snapshots?activityId=`**
   → `indicators.controller.ts` `getSnapshots` →
   `indicators.service.ts` → repo `snapshotModel`
   (table `indicator_snapshots`, `where: { indicatorId, activityId }`,
   triées par `createdAt`).
4. `toRow(snapshot)` : construit un `DashboardContext`
   (`scope: 'group', scopeId: snapshot.contextId, activityId`) et des
   `queryParams` (`from: 'group-snapshot', groupId, groupName, activityId,
   courseId, activityName, courseName`) → passés à `<ui-indicator-card>`
   (template) → **cascade B.2** avec `contextType: 'group'`, puis
   navigation vers `indicator-detail` (C, branche `group-snapshot`).
5. **Ajout** : `addSnapshot(panel)` (formulaire, dropdown
   filtré sur les groupes déjà ajoutés) →
   `indicatorService.createSnapshot(panel.indicator.id, {contextType:'group', contextId: group.id, activityId, title: group.name})`
   (`indicator.service.ts`) → **`POST /api/indicators/:id/snapshots`**
   → `indicators.controller.ts` `createSnapshot` →
   `indicators.service.ts` :
   - Vérifie l'unicité `(indicatorId, contextType, contextId, activityId)`
     dans `indicator_snapshots` → `ConflictException` (409) si doublon (géré
     côté UI, message d'erreur affiché).
   - sinon `create` + `save` → insert dans `indicator_snapshots`.
6. **Édition du titre** : `saveTitle(panel, row)` (validation par
   Entrée ou bouton "check") →
   `indicatorService.updateSnapshotTitle(panel.indicator.id, row.snapshot.id, newTitle)`
   (`indicator.service.ts`) → **`PATCH /api/indicators/:id/snapshots/:snapshotId`**
   body `{title}` → `indicators.controller.ts` `updateSnapshotTitle`
   → `indicators.service.ts` : `findOne({ id: snapshotId, indicatorId })`,
   modifie `title`, `save` → update `indicator_snapshots`.
7. **Suppression** : `deleteSnapshot(panel, row)` (`nz-popconfirm`) →
   `indicatorService.deleteSnapshot(panel.indicator.id, row.snapshot.id)`
   (`indicator.service.ts`) → **`DELETE /api/indicators/:id/snapshots/:snapshotId`**
   → `indicators.controller.ts` `deleteSnapshot` →
   `indicators.service.ts` : `findOne` puis
   `snapshotModel.remove(snapshot)` → delete dans `indicator_snapshots`.

### F.3 Rafraîchissement automatique des snapshots - `refreshSnapshots`

`indicators.service.ts` `refreshSnapshots(indicatorId, activityId)` -
**non exposée par une route** ; appelée en fire-and-forget depuis
l'ingestion d'événements (voir I.3). Flux :

1. Récupère tous les `indicator_snapshots` de
   `(indicatorId, activityId)`. Si vide → return.
2. Récupère l'`IndicatorDefinition` correspondant (sinon return).
3. Double boucle snapshot × visualisation de l'indicateur →
   `computeView(snapshot.indicatorId, snapshot.contextType, snapshot.contextId, snapshot.activityId, viz.id, true)`
   (`forceRefresh = true`, bypass du cache existant) - **cascade identique à
   B.2**, avec écriture forcée dans `indicator_values` et log dans
   `indicator_execution_logs`.
4. try/catch par snapshot/viz, `logger.warn` en cas d'erreur sans
   interrompre la boucle.

---

## G - Cours

Module `api/src/modules/features/courses/` (`@Controller('v1/courses')` →
`/api/v1/courses`). Le service interroge directement
`@Inject('PLATON_DATA_SOURCE') DataSource` en SQL brut (connexion `'platon'`,
lecture seule), sans passer par `PlatonService`.

Côté frontend, ces pages utilisent `CourseService`
(`platon-stubs/course-browser.ts`, `const API = ${environment.apiUrl}/v1`)
via `CoursePresenter` (`features/courses/course/course.presenter.ts`).
**Important** : la plupart des opérations d'**écriture** (membres, sections,
groupes, démos...) sont des **stubs no-op** côté `course-browser.ts`
(`of({} as Course)` ou `of(undefined)`) - seules les **lectures** listées
ci-dessous déclenchent un vrai appel HTTP.

### G.1 Liste / recherche des cours

`features/courses/courses.page.ts` :

- `ngOnInit()` : à chaque changement de
  `activatedRoute.queryParams` →
  `courseService.search({...filters, members: [user.id], expands: ['permissions','statistic']})`
  → `course-browser.ts` `search()` → **`GET /api/v1/courses?...`**
  (params construits par `buildParams()`, `course-browser.ts`).
- `searchAll()` (bouton "Afficher tout", admin) → même endpoint sans
  filtre `members`.

Backend : `courses.controller.ts` `search` (params `search`, `members`,
`period`, `offset`, `limit`, `order`, `direction`) → `courses.service.ts`
`searchCourses` :

1. Conditions dynamiques (`search` → `LOWER(c.name) LIKE`,
   `members` → `c.owner_id = ANY(...)` ou sous-requête `"CourseMembers"`,
   `period` → filtre `updated_at`).
2. `SELECT COUNT(DISTINCT c.id) FROM "Courses" c ...`.
3. Requête principale `SELECT DISTINCT ON (c.id) ... FROM "Courses" c
   LEFT JOIN "Users" u ...` avec sous-requêtes :
   - `COUNT(*) FROM "CourseMembers" cm WHERE role='student'` /
     `role='teacher'`
   - `COUNT(*) FROM "Activities" a WHERE a.course_id = c.id`
   - `AVG(s.grade) FROM "Sessions" s JOIN "Activities" a_s`
   - `AVG(...) timeSpent FROM "Sessions" s JOIN "Activities" a_s`
4. Pagination `LIMIT`/`OFFSET`. Mapping `mapCourse(r)`.

### G.2 Détail cours, sections, activités d'un cours

`CoursePresenter.refresh(id)` (`course.presenter.ts`, déclenché par
`activatedRoute.paramMap`) :

- `courseService.find({id, expands:['permissions','statistic']})`
  → `course-browser.ts` → **`GET /api/v1/courses/:id`** →
  `courses.controller.ts` `findById` → `courses.service.ts`
  `findCourseById` :
  - `SELECT c.*, TRIM(...) AS "ownerName", (sous-requêtes studentCount/
    teacherCount/activityCount/progression/timeSpent) FROM "Courses" c LEFT
    JOIN "Users" u ON u.id = c.owner_id WHERE c.id = $1`
    (sous-requêtes sur `CourseMembers`, `Activities`, `Sessions`+`Activities`).
    404 si vide. Mapping `mapCourse`.
- `courseService.getDemo(course.id)` → stub, retourne `null`
  (`course-browser.ts`, pas de HTTP réel).

`CoursePresenter.listSections()` →
`courseService.listSections(course)` → `course-browser.ts` →
**`GET /api/v1/courses/:id/sections`** → `courses.controller.ts`
`listSections` → `courses.service.ts` :
`SELECT ... FROM "CourseSections" s WHERE s.course_id = $1 ORDER BY s.order ASC, s.created_at ASC`.

`CoursePresenter.listActivities(filters?)` →
`courseService.listActivities(course, filters)` →
`course-browser.ts` → **`GET /api/v1/courses/:id/activities?sectionId=&challenge=`**
→ `courses.controller.ts` `listActivities` → `courses.service.ts`
`listActivities` :

1. `SELECT ... FROM "Activities" a LEFT JOIN "Resources" r ON r.id
   = (a.source->>'resource')::uuid WHERE a.course_id = $1 [AND
   a.section_id = $n] [AND a.is_challenge = true] ORDER BY a.order ASC,
   a.created_at ASC`. Si vide → retour anticipé `{ resources: [], total: 0 }`.
2. 3 requêtes en parallèle (`Promise.all`) sur `activityIds` :
   - `progressionRows` : `AVG(s.grade) FROM "Sessions" s WHERE
     s.parent_id IS NOT NULL AND s.activity_id = ANY($1) AND s.grade >= 0
     GROUP BY s.activity_id`.
   - `timeSpentRows` : `AVG(LEAST(EXTRACT(EPOCH FROM (s.last_graded_at -
     s.started_at)), 28800)) FROM "Sessions" s WHERE s.parent_id IS NULL ...
     GROUP BY s.activity_id`.
   - `exerciseCountRows` : `COUNT(DISTINCT resource_id) FROM "SessionData"
     WHERE activity_id = ANY($1) GROUP BY activity_id`.
3. Mapping `mapActivity(r, progressionMap, timeSpentMap,
   exerciseCountMap)`.

> **Note routage NestJS** : `:id/sections`, `:id/activities`, `:id/groups`,
> `:id/groups/:groupId/members`, `:id/members` sont déclarées **avant**
> `GET /:id` (`courses.controller.ts`), donc prioritaires.

### G.3 Membres et groupes de TP d'un cours

- `features/courses/course/members/members.page.ts` `ngOnInit()` :
  pas d'appel direct - `CourseMemberSearchBarComponent`/
  `CourseMemberTableComponent` (stubs `@platon/feature/course/browser`)
  appellent en interne `courseService.searchMembers` (`course-browser.ts`) →
  **`GET /api/v1/courses/:id/members?roles=&role=&search=`** →
  `courses.controller.ts` `listMembers` → `courses.service.ts`
  `listMembers` :
  - Conditions dynamiques (`roles` séparés par virgule →
    `cm.role = ANY(...)`, sinon `role` exact ; `search` → filtre
    `LOWER(first_name/last_name/username) LIKE`).
  - `SELECT cm.id, cm.course_id, cm.user_id, cm.role,
    cm.created_at, u.username, u.first_name, u.last_name FROM
    "CourseMembers" cm LEFT JOIN "Users" u ON u.id = cm.user_id WHERE ...
    ORDER BY cm.role, u.last_name ASC` (tables `CourseMembers`, `Users`).
  - `addMembers`/`remove`/`updateRole` (`members.page.ts`) →
    `presenter.addMember`/`deleteMember`/`updateMemberRole` → **stubs no-op**
    (`course-browser.ts`).
  - `features/courses/course/students/students.page.ts` est un simple
    wrapper qui réutilise `CourseMembersPage`.

- `features/courses/course/groups/groups.page.ts` `ngOnInit()` :
  - `presenter.listCourseGroups()` → `courseService.listGroups(course.id)`
    (`course.presenter.ts`) → `course-browser.ts` →
    **`GET /api/v1/courses/:id/groups`** → `courses.controller.ts`
    `listGroups` → `courses.service.ts` `listGroups` :
    `SELECT cg.id, cg.group_id AS "groupId", cg.course_id, cg.name,
    cg.created_at FROM "CourseGroups" cg WHERE cg.course_id = $1 ORDER BY
    cg.created_at ASC`.
  - pour chaque groupe, `presenter.listCourseGroupMembers(courseGroup.groupId)`
    → `courseService.listGroupMembers(course.id, groupId)`
    (`course.presenter.ts`) → `course-browser.ts` →
    **`GET /api/v1/courses/:id/groups/:groupId/members`** →
    `courses.controller.ts` `listGroupMembers` →
    `courses.service.ts` `listGroupMembers` :
    `SELECT cgm.user_id, cgm.group_id, cm.id, cm.course_id, cm.role,
    cgm.created_at, u.username, u.first_name, u.last_name FROM
    "CourseGroupsMember" cgm LEFT JOIN "Users" u ON u.id = cgm.user_id LEFT
    JOIN "CourseMembers" cm ON cm.user_id = cgm.user_id AND cm.course_id =
    $1 WHERE cgm.group_id = $2 ORDER BY u.last_name ASC, u.first_name ASC`
    (mapping en mémoire).
  - `updateGroupName`/`removeGroupMember`/`addGroupMember`/`addGroup`/
    `deleteGroup` (`groups.page.ts`) → tous **stubs no-op** côté
    `course-browser.ts`.

### G.4 Page activité - résultats, détail, CSV

`ActivityPresenter` (consommé par `activity.page.ts`, voir F.1) :

- **Détail activité** : `findActivity(courseId, activityId)` →
  **`GET /api/v1/courses/:courseId/activities/:activityId`** →
  `courses.controller.ts` `findActivity` (ici `courseId` **est**
  utilisé) → `courses.service.ts` `findActivity` :
  `SELECT a.*, COALESCE(...) AS title, (a.source->>'resource')::text AS
  "resourceId", ... FROM "Activities" a LEFT JOIN "Resources" r ON r.id =
  (a.source->>'resource')::uuid WHERE a.course_id = $1 AND a.id = $2`. Si
  vide → `throw new Error(...)` (**pas de** `NotFoundException`).
  Mapping `mapActivity(rows[0])`.

- **Résultats** : `getActivityResults(activityId)` →
  **`GET /api/v1/courses/:courseId/activities/:activityId/results`**
  (`:courseId` déclaré mais **non lu** par le contrôleur - ignoré) →
  `courses.controller.ts` `getActivityResults` →
  `courses.service.ts` `getActivityResults` (3 requêtes) :
  1. `exerciseRows` : `SELECT sd.resource_id, ..., AVG(sd.grade),
     AVG(sd.attempts), ... FROM "SessionData" sd LEFT JOIN "Resources" r ON
     r.id = sd.resource_id WHERE sd.activity_id = $1 GROUP BY sd.resource_id,
     r.name`.
  2. `userRows` : `SELECT u.*, AVG(sd.grade), SUM(sd.attempts), json_agg(...)
     FROM "SessionData" sd JOIN "Users" u ON u.id = sd.user_id LEFT JOIN
     "Resources" r ON r.id = sd.resource_id WHERE sd.activity_id = $1 GROUP
     BY u.id, ...`.
  3. `statsRows` : `SELECT AVG(sub.avg_grade), ... FROM (SELECT user_id,
     AVG(grade), SUM(attempts) FROM "SessionData" WHERE activity_id = $1
     GROUP BY user_id) sub`.
  Construction de la réponse (`exercises`, `users`, stats globales) en
  mémoire.

- **Résultats par date** : `getActivityResultsForDate(activityId, start, end)`
  → **`GET /api/v1/courses/:courseId/activities/:activityId/results/date?start=&end=`**
  (`:courseId` ignoré ; `start`/`end` défaut = 365 derniers jours) →
  `courses.controller.ts` `getActivityResultsForDate` →
  `courses.service.ts` :
  `SELECT u.id, u.username, ..., DATE(sd.created_at), COUNT(CASE WHEN
  sd.grade >= 100 ...) FROM "SessionData" sd JOIN "Users" u ON u.id =
  sd.user_id WHERE sd.activity_id = $1 AND sd.created_at BETWEEN $2 AND $3
  GROUP BY ... ORDER BY u.id, DATE(sd.created_at)` (tables `SessionData`,
  `Users`). Regroupement en mémoire par utilisateur.

- **Export CSV** : `getActivityCsv(activityId)` →
  **`GET /api/v1/courses/:courseId/activities/:activityId/csv`**
  (`:courseId` ignoré) → `courses.controller.ts` `getActivityCsv`
  (réponse Express manuelle via `@Res()`) → `courses.service.ts`
  `getActivityCsv` :
  `SELECT u.username, u.first_name, u.last_name, r.name AS "exerciseName",
  sd.grade, sd.attempts, TO_CHAR(sd.created_at, 'YYYY-MM-DD HH24:MI') FROM
  "SessionData" sd JOIN "Users" u ON u.id = sd.user_id LEFT JOIN "Resources"
  r ON r.id = sd.resource_id WHERE sd.activity_id = $1 ORDER BY u.last_name,
  u.first_name, r.name` (tables `SessionData`, `Users`, `Resources`).
  Génération CSV en mémoire. Le contrôleur fixe
  `Content-Type: text/csv; charset=utf-8` et
  `Content-Disposition: attachment; filename="activity-<id>.csv"`, écrit un
  BOM UTF-8 (`courses.controller.ts`).

---

## H - Ressources

Module `api/src/modules/features/resources/` (`@Controller('v1/resources')`
→ `/api/v1/resources`), même pattern SQL brut sur `'platon'`. Frontend :
`ResourceService` (`platon-stubs/resource-browser.ts`,
`const API = ${environment.apiUrl}/v1`) via
`features/resources/resource/resource.presenter.ts` (`ResourcePresenter`).
Là aussi, la plupart des opérations d'écriture (`update`, `delete`, `join`,
`duplicate`, `watch`...) sont des **stubs no-op** `of(undefined)`.

### H.1 Page de recherche - `features/resources/resources.page.ts`

`ngOnInit()` :

- `Promise.all([...])` :
  - `resourceService.tree()` → `resource-browser.ts` →
    **`GET /api/v1/resources/tree`** → `resources.controller.ts`
    `getTree` → `resources.service.ts` `getCircleTree` :
    `SELECT id, name, parent_id AS "parentId" FROM "Resources" WHERE type =
    'CIRCLE' AND personal = false ORDER BY name ASC`, arbre
    construit en mémoire par `buildTree`. Retourne soit la racine
    unique, soit `{ id: 'root', name: 'Cercles', children: tree }`.
  - `resourceService.circle(user.username)` →
    `resource-browser.ts` → **`GET /api/v1/resources/user-circle?userId=`**
    (utilise `environment.defaultUserId`, pas le username réel) →
    `resources.controller.ts` `getUserCircle` →
    `resources.service.ts` `getUserCircle` :
    `SELECT r.* FROM "Resources" r WHERE r.personal = true AND r.owner_id =
    $1 LIMIT 1`. Si aucune ligne, retourne un objet `CIRCLE`
    minimal construit en mémoire (`id: userId, name: 'Mon espace',
    permissions: {read:true, write:true}`, pas d'écriture DB).
    Sinon `mapResource(rows[0])`.
  - `resourceService.search({views: true, expands: EXPANDS})` → voir
    ci-dessous.
  - `resourceService.listOwners()` → `resource-browser.ts` →
    **`GET /api/v1/resources/owners`** → `resources.controller.ts`
    `getOwners` → `resources.service.ts` `getOwners` :
    `SELECT DISTINCT u.id, u.username, u.first_name, u.last_name, u.email
    FROM "Users" u INNER JOIN "Resources" r ON r.owner_id = u.id WHERE
    r.type != 'CIRCLE' ORDER BY u.username ASC LIMIT 100`.
- `completion = resourceService.completion().pipe(shareReplay(1))` →
  `resource-browser.ts` → **`GET /api/v1/resources/completion`** →
  `resources.controller.ts` `getCompletion` →
  `resources.service.ts` `getCompletion` :
  `SELECT DISTINCT name FROM "Resources" WHERE type != 'CIRCLE' ORDER BY
  name LIMIT 200`, retourne `{ resource: { names, topics: [], levels: [] } }`
  (`topics`/`levels` toujours vides). Utilisé pour les suggestions de la
  barre de recherche.
- À chaque changement de `activatedRoute.queryParams` →
  `resourceService.search({...filters, expands: EXPANDS, limit:
  PAGINATION_LIMIT})` → `resource-browser.ts` `search()` →
  **`GET /api/v1/resources?search=&types=&status=&owners=&parents=&personal=&period=&offset=&limit=&order=&direction=`**
  → `resources.controller.ts` `search` → `resources.service.ts`
  `searchResources` :
  - Conditions dynamiques (`search` → `LOWER(name) LIKE` ou
    `LOWER(desc) LIKE` ; `types`/`status`/`owners`/`parents` → `ANY($n)` ;
    `personal` → `=true/false` ; `period` → `updated_at >= NOW() - INTERVAL`).
  - `SELECT COUNT(*) FROM "Resources" r ${where}`.
  - `SELECT r.id, r.name, ... FROM "Resources" r ${where} ORDER BY
    ${orderField} ${orderDir} LIMIT $n OFFSET $n`. Mapping `mapResource(r)`.
  - Le paramètre `views=true` ("récemment consultées")
    **n'est pas implémenté** - aucune condition basée sur `filters.views`.
- `loadMore()` (scroll infini, `ViewportIntersectionDirective`) →
  même `search()` avec `offset: items.length`.

### H.2 Détail ressource - `ResourcePresenter.refresh(id)`

`resource.presenter.ts` (déclenché par `activatedRoute.paramMap`) :

- `resourceService.find({id, markAsViewed: isInitialLoading,
  expands:['parent','statistic','metadata']})` →
  `resource-browser.ts` → **`GET /api/v1/resources/:id`** →
  `resources.controller.ts` `findById` → `resources.service.ts`
  `findResourceById` : `SELECT r.* FROM "Resources" r WHERE r.id::text = $1
  OR r.code = $1`. 404 si vide. Mapping `mapResource`.
- `resourceService.tree()` → **`GET /api/v1/resources/tree`** (H.1).

Sous-pages `features/resources/resource/{overview,browse,settings,events}` :
consomment `ResourcePresenter.contextChange` déjà chargé, pas de nouveaux
appels indicateurs identifiés. `settings/members/members.page.ts` utilise
`presenter.searchMembers()` → stub `of({resources:[], total:0})`
(`resource-browser.ts`) - aucune donnée réelle.

---

## I - Ingestion d'événements PLaTon

Module `api/src/modules/features/ingestion/` (`@Controller('ingest')` →
`/api/ingest`).

### I.1 `POST /api/ingest`

`ingestion.controller.ts` `ingestEvent(event: IngestionEventDto)` :
normalise `event.timestamp`, puis **fire-and-forget**
`ingestionService.ingestEvent(event)` (sans `await`, `.catch()` log
uniquement), répond immédiatement
`{ status: 'accepted', message: 'Event received for processing' }` (HTTP 202,
`@HttpCode(HttpStatus.ACCEPTED)`).

### I.2 `POST /api/ingest/batch`

`ingestion.controller.ts` `ingestBatch(events: IngestionEventDto[])` :
même normalisation par event, **fire-and-forget**
`ingestionService.ingestBatch(processedEvents)`, répond
`{ status: 'accepted', message: '<n> events received' }` (HTTP 202).

### I.3 Cascade - `IngestionService.ingestEvent` (`ingestion.service.ts`)

1. `isValidEvent(event)` - vérifie `type`, `userId`, force
   `timestamp` si absent. Invalide → warning + `return`.
2. `findAffectedIndicators(event)` :
   - `refreshIndicatorCache()` - recharge
     `indicatorDefinitionModel.find({ where: { isActive: true } })`
     (table `indicator_definitions`) si le cache (TTL 60000 ms) est expiré ou vide.
   - filtre les indicateurs dont `requiredEvents` (champ JSON de
     `IndicatorDefinition`) inclut `event.type`.
3. Si aucun indicateur affecté → `return`.
4. Pour chaque indicateur affecté :
   a. `processIndicatorUpdate(indicator, event)` :
      - Ne traite que `contextType === 'learner'` ; sinon
        log debug et retourne sans rien faire.
      - Si `formula?.pipeline?.length > 0` : calcule `newValue` via
        `formulaInterpreter.interpret(indicator.formula, { userId:
        event.userId, activityId: event.activityId, courseId:
        event.courseId, indicatorId: indicator.id })`.
      - `indicatorValueModel.findOne({ where: { indicatorId:
        indicator.id, contextType: 'learner', contextId: event.userId } })`
        (table `indicator_values`).
      - Si trouvé et `hasDslFormula` : update `value`/`metadata.lastUpdate`,
        `save`. Sinon : `create` + `save` (`value: 0`
        si pas de formule DSL).
      - **Effet de bord** : `eventEmitter.emit('indicator.<name>.updated',
        {...})` (`EventEmitter2` interne).
   b. **Fire-and-forget** : si `event.activityId` présent,
      `this.indicatorsService.refreshSnapshots(indicator.id, event.activityId)`
      (sans `await`, `.catch()` warning) - **cascade décrite en F.3**.
5. `eventEmitter.emit('ingestion.event.processed', { eventType,
   indicatorsCount, processingTime })`.
6. Erreur globale → `eventEmitter.emit('ingestion.event.error', {...})`
   puis re-throw - capturée par le `.catch()` du contrôleur.

`ingestBatch(events)` : boucle séquentielle, appelle `ingestEvent`
pour chaque event, comptabilise `{ total, processed, failed }` -
valeur jamais consultée par le contrôleur (appel fire-and-forget).

### I.4 Méthodes annexes (non routées)

- `getIngestionStats()` : taille/âge du cache d'indicateurs, pas
  d'accès DB.
- `resetIndicator(indicatorId, contextId?)` :
  `indicatorValueModel.delete({ indicatorId, [contextId] })` → DELETE sur
  `indicator_values`.

> **Côté frontend**, aucun composant n'appelle directement `/ingest` ou
> `/ingest/batch`. `core/services/indicator-event.service.ts` (`ingestUrl =
> environment.indicatorsApiUrl + '/ingest'`) expose `flush()` →
> `POST {ingestUrl}/batch`, toutes les 5s ou si la file dépasse 50 événements,
> et des méthodes `sendExerciseAnswered`/
> `sendSessionCompleted`/`sendSessionStarted`/`sendActivityViewed`/
> `sendCourseEnrolled`. Ce service est consommé par
> `core/interceptors/indicator.interceptor.ts` (enregistré globalement dans
> `app.config.ts` via `withInterceptors([indicatorInterceptor])`) : il
> intercepte les requêtes `POST/PUT/PATCH/DELETE` et, si l'URL contient
> `/exercises/.../answers` ou `/sessions`, traduit la réponse en
> `IndicatorEvent` (`indicator.interceptor.ts`). **Ces URLs
> (`/exercises`, `/sessions`) ne sont pas exposées par ce microservice** -
> l'interceptor est prévu pour s'activer une fois le frontend intégré dans
> l'application PLaTon principale (où ces routes existent réellement).

---

## J - Modules legacy / orphelins

### J.1 `activity-attempts` (legacy)

`api/src/modules/features/activity-indicator/` (`@Controller('indicators/activity-attempts')`
→ `/api/indicators/activity-attempts`) :

| Route | Contrôleur | Service | Données |
|---|---|---|---|
| `GET /value?userId=&activityId=&indicatorId=` | `activity-indicator.controller.ts` `getIndicatorValue` | `getIndicatorWithDetails` (`activity-indicator.service.ts`) | `attemptsCalculator.calculateForActivity` + `platonService.getActivityDetails(activityId)` + `indicatorDefinitionModel.findOne` |
| `GET /raw?userId=&activityId=` | `activity-indicator.controller.ts` `getRawValue` | `getIndicatorValue` (`activity-indicator.service.ts`) | idem, sans détails |
| `GET /history?userId=&activityId=&limit=` | `activity-indicator.controller.ts` `getHistory` | `indicatorsService.getValues(...)` puis filtre en mémoire sur `metadata.activityId` | table `indicator_values` |
| `POST /recalc/:activityId` | `activity-indicator.controller.ts` `recalcForActivity` | `recalculateForActivity` (`activity-indicator.service.ts`, fire-and-forget) | boucle `platonService.getUsersByActivity` + `attemptsCalculator.calculateForActivity` + upsert `indicator_values` (`saveIndicatorValue`) |
| `GET /activities` | `activity-indicator.controller.ts` `getActivities` | `getAllActivities` → `platonService.getAllActivities()` | table PLaTon activités |
| `GET /ranking/:activityId` | `activity-indicator.controller.ts` `getRanking` | `getRankingForActivity` (`activity-indicator.service.ts`) | boucle `platonService.getUsersByActivity` + `getIndicatorValue` par user, tri croissant |

`AttemptsCalculatorService.calculateForActivity` (`indicators/calculators/attempts-calculator.service.ts`) :
récupère `platonService.getUserSessionDataByActivity(userId, activityId)`,
groupe par exercice (`resource_id`), pour chaque exercice cherche le premier
enregistrement `grade === 100` et prend sa colonne `attempts` comme "tentatives
avant réussite", puis fait la moyenne sur les exercices réussis.

**Côté frontend** : `features/activity-indicator/activity-indicator.component.ts`
appelle `core/services/activity-indicator.service.ts`
`getValue(userId, activityId, indicatorId)` → **`GET /indicators/activity-attempts/value?userId=&activityId=&indicatorId=`**.
Ce composant est exporté par `shared/ui/index.ts` mais **n'est monté dans
aucune route** (`app.routes.ts`/`dashboard.routes.ts`) - orphelin, non
accessible depuis l'UI. `readme.md` §13 note que ce module devrait être migré
vers le moteur DSL.

### J.2 Services frontend orphelins ou peu utilisés

- **`core/services/group.service.ts`** : service inutilisé et supprimé.
  Le backend correspondant `/api/groups?teacherId=` et
  `/api/groups/members?groupId=` a également été retiré.

  "Courses" c ON c.id = cg.course_id WHERE c.owner_id = $1`) et
  `PlatonService.getUserIdsByGroup` (`platon.service.ts`,
  `SELECT cgm.user_id FROM "CourseGroupsMember" cgm JOIN "CourseGroups" cg ON
  cg.group_id = cgm.group_id WHERE cg.id = $1`).
- **`core/services/user.service.ts`** : `getUserById(id)` →
  `GET /api/users/:id`. **Utilisé** par `sidebar.component.ts` et
  `toolbar.component.ts` (`await this.userService.getUserById(this.USER_ID).toPromise()`)
  → `users.controller.ts` `getUserById` →
  `PlatonService.getUserById` (`platon.service.ts`,
  `SELECT id, username, first_name, last_name, active, role, email,
  last_login, first_login, created_at, updated_at, discord_id, last_activity
  FROM "Users" WHERE id = $1`). Si absent → `{ success: false, message:
  'Utilisateur non trouvé' }` (HTTP 200, pas de 404). Sinon projection
  camelCase sans exposer les champs sensibles (`active`, `*_login`,
  `*_at`, `discord_id`, `last_activity`).
- **`core/services/indicator-event.service.ts`** : voir I.4 - utilisé par
  l'intercepteur global mais ses cibles (`/exercises`, `/sessions`) ne sont
  pas exposées par ce microservice.

---

## Annexe - Tables et entités référencées

### Tables PLaTon (connexion `'platon'`, lecture seule)

`Courses`, `CourseMembers`, `CourseGroups`, `CourseGroupsMember`,
`CourseSections`, `Activities`, `Resources`, `Sessions`, `SessionData`,
`Users`.

### Entités/tables `indicators` (connexion `'indicators'`, lecture/écriture)

| Entité | Table | Écrite par |
|---|---|---|
| `IndicatorDefinition` | `indicator_definitions` | `create`/`update`/`toggleStatus`/`delete` (E.1), `incrementUsageCount`/`decrementUsageCount` (D) |
| `IndicatorValue` | `indicator_values` | `computeView` (B.2), `calculateAndStoreValue` (D.1), `recalculate` (E.3), `processIndicatorUpdate` (I.3), `saveIndicatorValue` legacy (J.1) |
| `IndicatorExecutionLog` | `indicator_execution_logs` | écrite à l'intérieur de `interpret()` (B.2 étape 9, E.3, F.3) si `context.indicatorId` fourni ; lue par `getExecutionLogs` (E.4) |
| `IndicatorSnapshot` | `indicator_snapshots` | CRUD F.2, lue/rafraîchie par `refreshSnapshots` (F.3) |
| `UserIndicatorPreference` | `user_indicator_preferences` | CRUD D |

---

Voir aussi `readme.md` (architecture, modèle de données, moteur DSL, sécurité)
et `guide.md` (parcours pas-à-pas pour créer/tester chaque type
d'indicateur).
