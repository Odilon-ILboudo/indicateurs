# Parcours de données — du composant frontend à la base de données

Ce document complète `readme.md` (qui liste les routes API par contrôleur, §9)
en traçant, **fichier par fichier et ligne par ligne**, le chemin complet de
chaque famille de requêtes : composant Angular → service frontend → appel HTTP
→ contrôleur NestJS → service backend (avec ses cascades) → accès aux données
(PLaTon en lecture seule, ou `indicators` en lecture/écriture) → effets de
bord éventuels.

L'objectif : pouvoir partir d'un écran de l'application et remonter/descendre
toute la chaîne de fichiers sans avoir à grep le projet.

## Sommaire

0. [Conventions](#0-conventions)
1. [Fichier pivot frontend — `indicator.service.ts`](#1-fichier-pivot-frontend--indicatorservicets)
2. [A — Tableau de bord (Overview)](#a--tableau-de-bord-overview)
3. [B — Carte indicateur (`IndicatorCardComponent`)](#b--carte-indicateur-indicatorcardcomponent)
4. [C — Détail d'un indicateur](#c--détail-dun-indicateur)
5. [D — Préférences utilisateur](#d--préférences-utilisateur)
6. [E — Administration des indicateurs](#e--administration-des-indicateurs)
7. [F — Page activité & snapshots de groupe](#f--page-activité--snapshots-de-groupe)
8. [G — Cours](#g--cours)
9. [H — Ressources](#h--ressources)
10. [I — Ingestion d'événements PLaTon](#i--ingestion-dévénements-platon)
11. [J — Modules legacy / orphelins](#j--modules-legacy--orphelins)
12. [Annexe — Tables et entités référencées](#annexe--tables-et-entités-référencées)

---

## 0. Conventions

- Chemins **frontend** relatifs à `indicateurs/frontend/src/app/` (sauf
  mention contraire, ex. `platon-stubs/`).
- Chemins **backend** relatifs à `indicateurs/api/src/`.
- `fichier.ts:42` = ligne 42 ; `fichier.ts:42-50` = plage de lignes.
- Préfixe global de l'API : `/api` (`main.ts:30`, `setGlobalPrefix('api')`).
- `environment.apiUrl` et `environment.indicatorsApiUrl` valent tous deux
  `http://localhost:3001/api` (`environments/environment.ts:4-5`) — ce sont
  deux alias de la même base.
- Deux connexions TypeORM : `'platon'` (lecture seule, tables PLaTon en
  `PascalCase` type `"Users"`, `"Courses"`...) et `'indicators'`
  (lecture/écriture, tables `snake_case` type `indicator_values`).

---

## 1. Fichier pivot frontend — `indicator.service.ts`

`core/services/indicator.service.ts` est injecté par presque toutes les
pages. `apiUrl = ${environment.apiUrl}/indicators` (L11),
`preferencesUrl = ${environment.apiUrl}/preferences` (L12).

| Méthode (L) | Verbe + URL | Utilisée dans |
|---|---|---|
| `loadIndicators()` L25-35 | `GET {apiUrl}` | A.1, C, E.1 |
| `loadAllForAdmin()` L37-39 | `GET {apiUrl}/all` | E.1 |
| `getIndicatorValue(id, contextType, contextId)` L41-46 | `GET {apiUrl}/:id/values?contextType=&contextId=` | B.1 |
| `getIndicatorHistory(id, contextId, limit)` L48-53 | `GET {apiUrl}/:id/values?contextType=learner&contextId=&limit=` | non câblée dans un composant identifié |
| `getUserPreferences(userId)` L55-72 | `GET {preferencesUrl}?userId=` | A.1 (via `dashboard-settings.service.ts`) |
| `createIndicator(data)` L76-79 | `POST {apiUrl}` | E.1 |
| `updateIndicator(id, data)` L81-84 | `PATCH {apiUrl}/:id` | E.1 |
| `updateIndicatorStatus(id, isActive)` L86-89 | `PATCH {apiUrl}/:id/status` | E.1 |
| `deleteIndicator(id)` L91-94 | `DELETE {apiUrl}/:id` | E.1 |
| `setUserIndicatorVisibility(userId, id, isVisible, userRole?)` L96-101 | `PATCH {preferencesUrl}/:id?userId=` body `{isVisible, userRole?}` | D |
| `getIndicatorUsageCount(id)` L103-107 | `GET {apiUrl}/:id/usage` | E.1 |
| `recalculateIndicator(id)` L109-113 | `POST {apiUrl}/:id/recalculate` | E.3 |
| `previewFormulaRaw(formula, context)` L117-122 | `POST {apiUrl}/preview` | E.2 |
| `previewFormulaSteps(formula, context)` L124-129 | `POST {apiUrl}/preview-steps` | E.2 |
| `getFormulaHistory(id)` L133-135 | `GET {apiUrl}/:id/formula-history` | E.4 |
| `rollbackFormula(id, versionId)` L137-141 | `POST {apiUrl}/:id/rollback/:versionId` | E.4 |
| `getExecutionLogs(id, limit=50)` L145-147 | `GET {apiUrl}/:id/logs?limit=` | E.5 |
| `getPlatonSchema()` L149-153 | `GET {apiUrl}/schema` | E.2, E.6 |
| `computeView(id, contextType, contextId, activityId?, vizId?)` L164-177 | `POST {apiUrl}/:id/compute-view` | B.2, C, F |
| `getTeacherContext(teacherId)` L179-181 | `GET {apiUrl}/teacher/:teacherId/context` | A.2, E.2 |
| `getCourseActivities(courseId)` L183-185 | `GET {apiUrl}/course/:courseId/activities` | A.2, E.2 |
| `getCourseStudents(courseId)` L187-193 | `GET {apiUrl}/course/:courseId/students` | E.2 |
| `precomputeContext(contextType, contextId, activityId)` L195-199 | `POST {apiUrl}/precompute-context` | A.2 |
| `getSnapshots(id, activityId)` L203-207 | `GET {apiUrl}/:id/snapshots?activityId=` | F |
| `createSnapshot(id, body)` L209-214 | `POST {apiUrl}/:id/snapshots` | F |
| `updateSnapshotTitle(id, snapshotId, title)` L216-221 | `PATCH {apiUrl}/:id/snapshots/:snapshotId` | F |
| `deleteSnapshot(id, snapshotId)` L223-225 | `DELETE {apiUrl}/:id/snapshots/:snapshotId` | F |
| `getVizPreference(id)` L230-232 | cache local, pas de HTTP | B, C |
| `setVizPreference(userId, id, vizId)` L235-241 | `PATCH {preferencesUrl}/:id?userId=` body `{activeVizId}` (fire-and-forget) | B.3, C |
| `getEnabledVizIds`/`isVizEnabled` L244-252 | cache local, pas de HTTP | D |
| `setEnabledVizIds(userId, id, vizIds)` L255-265 | `PATCH {preferencesUrl}/:id?userId=` body `{enabledVizIds}` (fire-and-forget) | D |

---

## A — Tableau de bord (Overview)

### A.1 Chargement initial — `/dashboard/overview`

1. `features/dashboard/pages/overview/overview.page.ts:58-66` `ngOnInit()` :
   restaure le contexte enseignant sauvegardé
   (`dashboard-settings.service.ts` → `getTeacherState()`), puis appelle
   `loadActiveIndicators()` (L64) et `loadIndicators()` (L65).
2. `loadIndicators()` L88-99 → `indicatorService.loadIndicators()`
   (`indicator.service.ts:25`) → **`GET /api/indicators`**
   → `indicators.controller.ts:18-21` `getAllIndicators` →
   `indicators.service.ts:35-37` `findAllActive` → repo `indicatorModel`
   (connexion `'indicators'`, table `indicator_definitions`,
   `where: { isActive: true }`).
3. `loadActiveIndicators()` L79-86 → `dashboard-settings.service.ts:67-69`
   `getSettings()` (observable local). Ce cache est alimenté au démarrage du
   service par `loadSettings()` (`dashboard-settings.service.ts:44-65`) →
   `indicatorService.getUserPreferences(currentUserId)`
   (`indicator.service.ts:55-72`) → **`GET /api/preferences?userId=`**
   → `user-preferences.controller.ts:9-12` `getUserPreferences` →
   `user-preferences.service.ts:24-51` → repo `preferenceRepository`
   (table `user_indicator_preferences`, relation jointe → `indicator_definitions`).

### A.2 Sélecteur de contexte enseignant — `TeacherContextSelectorComponent`

`features/dashboard/pages/widgets/teacher-context-selector/teacher-context-selector.component.ts`

1. `ngOnInit()` L145-177 :
   - `indicatorService.getTeacherContext(environment.defaultUserId)` (L148) →
     **`GET /api/indicators/teacher/:teacherId/context`** →
     `indicators.controller.ts:36-39` `getTeacherContext` →
     `indicators.service.ts:229-231` → `PlatonService.getCoursesWithGroupsForTeacher`
     (`api/src/modules/core/platon/platon.service.ts:306-322`) :
     - L312 `SELECT id, name FROM "Courses" WHERE owner_id = $1`
     - puis pour chaque cours, L317 `SELECT id, name FROM "CourseGroups" WHERE course_id = $1`
   - si une sélection précédente existe (`saved.courseId`),
     `indicatorService.getCourseActivities(saved.courseId)` (L158) →
     **`GET /api/indicators/course/:courseId/activities`** →
     `indicators.controller.ts:42-45` → `indicators.service.ts:233-235` →
     `PlatonService.getActivitiesByCourse` (`platon.service.ts:329-343`) :
     `FROM "Activities" a LEFT JOIN "Resources" r ON r.id = (a.source->>'resource')::uuid WHERE a.course_id = $1`.
2. `onCourseChange(courseId)` L179-196 (changement de sélection cours,
   template `nz-select` L31) → même appel `getCourseActivities(courseId)`.
3. `onScopeTypeChange` L198-200 / `onActivityChange` L202-204 (templates
   L50, L70) → `emitContext()` L206-233 :
   - construit un `DashboardContext` et l'émet via `@Output() contextChange`
     → `overview.page.ts` `onTeacherContextChange()` L72-77.
   - **Fire-and-forget** L231-232 :
     `indicatorService.precomputeContext(scope, scopeId, selectedActivityId)`
     (`indicator.service.ts:195-199`) → **`POST /api/indicators/precompute-context`**
     → `indicators.controller.ts:172-180` `precomputeContext` →
     `indicators.service.ts:245-264` `precomputeForContext` :
     - L250 `findAllActive()` → tous les indicateurs actifs
     - L253-261 boucle : skip si `indicator.contextType !== contextType`
       (L254), sinon `this.computeView(indicator.id, contextType, contextId, activityId)`
       — **cascade complète décrite en B.2** (sans `vizId`, donc
       `visualizations[0]`)
     - try/catch par indicateur (L258-260), retourne `{ computed: n }`
     - **But** : pré-remplir `indicator_values` avant que l'utilisateur
       n'ouvre une carte ou le détail.

---

## B — Carte indicateur (`IndicatorCardComponent`)

`shared/ui/indicator-card/indicator-card.component.ts`

### B.1 Contexte `learner` / `teacher` / `admin` — valeur déjà pré-calculée

1. `ngOnInit()`/`ngOnChanges()` (L35-45) → `loadValue()` L78-126.
2. Branche L109-126 : `indicatorService.getIndicatorValue(indicator.id, scope, context.scopeId)`
   (L110-114, `indicator.service.ts:41-46`) → **`GET /api/indicators/:id/values?contextType=&contextId=`**
   → `indicators.controller.ts:72-84` `getIndicatorValues` →
   `indicators.service.ts:53-82` `getValues` :
   - appelle `findById(id)` (L43-47, table `indicator_definitions`)
   - lit `indicatorValueModel` (table `indicator_values`,
     `where: { indicatorId, contextType, contextId }`, dernière(s) valeur(s))
   - calcule la tendance via `calculateTrend` (L495-504, comparaison avec la
     valeur précédente)
   - **Aucun calcul DSL ici** : si `indicator_values` ne contient rien pour
     ce contexte (ex. l'utilisateur n'a jamais activé l'indicateur), la
     valeur retournée est vide/0 — la ligne est créée par
     `calculateAndStoreValue` (voir D.1) ou `recalculate` (E.3).

### B.2 Contexte `course` / `group` / `activity` — `compute-view` (cascade complète)

1. Branche L82-107 de `loadValue()` : `activityId = scope === 'activity' ? undefined : context.activityId`
   (L89), puis `indicatorService.computeView(indicator.id, scope, context.scopeId, activityId, vizId)`
   (L92-94, `indicator.service.ts:164-177`) → **`POST /api/indicators/:id/compute-view`**
   body `{contextType, contextId, activityId?, vizId?}`.
2. `indicators.controller.ts:127-138` `computeView` → `indicators.service.ts:273-356`
   `computeView` :
   1. L281 `findById(indicatorId)` (L43-47) → `IndicatorDefinition`
      (table `indicator_definitions`).
   2. L284-296 : résout la visualisation ciblée (`vizId` ou
      `visualizations[0]`) et la formule effective (formule de la viz, sinon
      `indicator.formula` legacy). Pas de pipeline → `BadRequestException`.
   3. L298-306 : calcule `resolvedActivityId` et la clé de cache
      `cacheContextId` (inclut `:activityId` et `:vizId` si présents).
   4. **Cache** L308-319 : si `!forceRefresh`, lecture
      `indicatorValueModel` (table `indicator_values`,
      `where: { indicatorId, contextType, contextId: cacheContextId }`).
      Si trouvé → retour immédiat, **pas d'exécution DSL**.
   5. L321-326 : construit le `formulaContext` selon `contextType`
      (`{ userId|courseId|groupId, activityId, indicatorId }`).
   6. **Exécution DSL** L328 :
      `formulaInterpreter.interpret(formula, formulaContext)` → point
      d'entrée `interpreter/formula-interpreter.service.ts:71`
      `interpret()` (moteur DSL, voir `readme.md` §6 pour le détail des
      10 types d'étapes).
   7. **Post-traitement noms** L330-338 : si le résultat est un tableau de
      buckets avec `userIds`, appel
      `PlatonService.getUserNameMap(allIds)`
      (`platon.service.ts:173-184`) → `SELECT id, first_name, last_name
      FROM "Users" WHERE id = ANY($1)` (table PLaTon `Users`) — remplace les
      UUID par des noms lisibles dans `structuredValue`.
   8. **Écriture cache** L344-353 : `indicatorValueModel.upsert(...)` sur
      `indicator_values` (clé de conflit `indicatorId, contextType, contextId`).
   9. **Log d'exécution** : écrit *à l'intérieur* de `interpret()`
      (`formula-interpreter.service.ts:100-108`) dans `indicator_execution_logs`
      (entité `IndicatorExecutionLog`), car `formulaContext.indicatorId` est
      toujours défini ici (étape 5).
   10. L355 : retourne `{ value, structuredValue, metadata }`.

### B.3 Sélection de visualisation — `selectViz`

1. Clic sur un `.viz-chip` (template `indicator-card.component.html:59`,
   visible si `visibleVisualizations.length > 1`) → `selectViz(viz, event)`
   `indicator-card.component.ts:61-67`.
2. `indicatorService.setVizPreference(environment.defaultUserId, indicator.id, viz.id)`
   (L65, `indicator.service.ts:235-241`) → **`PATCH /api/preferences/:indicatorId?userId=`**
   body `{activeVizId: viz.id}` (fire-and-forget) → `user-preferences.controller.ts:31-38`
   `updatePreference` → `user-preferences.service.ts:88-135` (voir D.2 pour
   la cascade complète de `updatePreference`).
3. Re-`loadValue()` (L66) → relance B.1 ou B.2 selon le `scope`, avec le
   nouveau `vizId`.

### Navigation vers le détail

`indicator-card.component.html:7-8` :
`[routerLink]="['/dashboard/indicator', indicator.id]"` avec
`[queryParams]="queryParams"` — `queryParams` est passé en `@Input` par le
parent (voir F pour `from: 'activity'` / `from: 'group-snapshot'`).

---

## C — Détail d'un indicateur

`features/indicator-detail/indicator-detail.component.ts`

1. `ngOnInit()` L109-151 : lit `route.snapshot.paramMap.get('id')` (L110) et
   `route.snapshot.queryParams` (L117).
   - Si `q['from'] === 'group-snapshot'` (L119-128) : initialise un contexte
     `group` depuis les queryParams (`groupId`, `activityId`, ... transmis
     par `GroupSnapshotsPanelComponent`, voir F).
   - Si `q['from'] === 'activity'` (L129-136) : initialise un contexte
     `activity` (transmis par `activity.page.ts`, voir F).
   - Sinon, si l'utilisateur est enseignant (L137-148) : restaure
     `dashboard-settings.service.ts` → `getTeacherState()` — affiche la
     bannière lecture seule "Cours > Activité > Scope" décrite dans
     `readme.md` §10.
   - Appelle `loadIndicator(id)` L150.
2. `loadIndicator(id)` L153-179 :
   - `indicatorService.loadIndicators()` (L154) → **`GET /api/indicators`**
     (cache, voir A.1).
   - Restaure la préférence de viz active via `getVizPreference(id)`
     (cache local, L165).
   - Si `canCompute && activeViz` (L171) → `computeViz(activeViz)`.
3. `onVizTabChange(index)` L182-192 (changement d'onglet `NzTabs`,
   `indicator-detail.component.html`) :
   - `indicatorService.setVizPreference(environment.defaultUserId, indicator.id, viz.id)`
     (L186) → **`PATCH /api/preferences/:indicatorId?userId=`** body
     `{activeVizId}` — même endpoint que B.3 → D.2.
   - Si pas encore calculé pour cette viz → `computeViz(viz)`.
4. `computeViz(viz)` L194-220 :
   `indicatorService.computeView(indicator.id, activeContextType, activeContextId, activityIdParam, viz.id)`
   (L201-207) → **`POST /api/indicators/:id/compute-view`** — **cascade
   identique à B.2**. Le résultat est stocké dans `results[viz.id]`, puis
   `buildChartOptions(viz, result)` (L222-279, purement local) construit les
   options ECharts (bar/gauge/line/histogram, voir `readme.md` §10
   "Graphiques").

---

## D — Préférences utilisateur

`api/src/modules/features/user-preferences/` — préfixe `@Controller('preferences')`
→ `/api/preferences` (PAS de sous-préfixe `/indicators`).

### D.1 Activer / désactiver un indicateur — `IndicatorSelectorComponent`

`features/indicator-selector/indicator-selector.component.ts`

1. `toggleIndicator(indicatorId, active)` L677-694 (déclenché par le
   `nz-switch` "actif" du tableau, `indicator-selector.component.html`) :
   - si `active` → `dashboard-settings.service.ts:76-90`
     `addActiveIndicator(indicatorId)` →
     `indicatorService.setUserIndicatorVisibility(currentUserId, indicatorId, true, role)`
     (L80, `indicator.service.ts:96-101`) → **`PATCH /api/preferences/:indicatorId?userId=`**
     body `{isVisible: true, userRole}`.
   - sinon → `dashboard-settings.service.ts:92-106`
     `removeActiveIndicator(indicatorId)` → même PATCH avec
     `{isVisible: false, userRole}`.
2. Backend : `user-preferences.controller.ts:31-38` `updatePreference` →
   `user-preferences.service.ts:88-135` `updatePreference` :
   1. L93-96 `preferenceRepository.findOne({ where: { userId, indicatorId }, relations: ['indicator'] })`
      (table `user_indicator_preferences`).
   2. L98-99 calcule `wasVisible`/`willBeVisible`. Si pas de préférence
      existante, en crée une nouvelle en mémoire avec `isVisible: true`
      (L101-107).
   3. L109-121 : applique les champs fournis (`isVisible`,
      `displayPreferences`, `activeVizId`, `enabledVizIds`).
   4. L122 `preferenceRepository.save(preference)` → upsert dans
      `user_indicator_preferences`.
   5. **Effets de bord conditionnels** :
      - transition `false → true` (devient visible) : L125
        `incrementUsageCount(indicatorId)` (méthode privée L186-188 →
        `indicatorRepository.increment({ id }, 'usageCount', 1)` sur
        `indicator_definitions`), puis L126-128 re-fetch
        `indicatorRepository.findOne({ where: { id, isActive: true } })` et
        si trouvé, L129 `calculateAndStoreValue(userId, indicator)`
        (voir ci-dessous).
      - transition `true → false` : L131 `decrementUsageCount(indicatorId)`
        (L190-192 → `usageCount` -1).

> ⚠️ **Précision** : le body accepte un champ `userRole`, mais il n'est
> **jamais lu** côté service — la condition de skip de
> `calculateAndStoreValue` (ci-dessous) se base uniquement sur
> `indicator.contextType` (champ de `IndicatorDefinition`), pas sur
> `userRole`.

### `calculateAndStoreValue` (`user-preferences.service.ts:156-184`)

Méthode privée appelée par `createPreference` (POST, L84) et
`updatePreference` (PATCH, L129 si transition vers visible) :

- **Skip** L157 : `if (!['learner', 'teacher', 'admin'].includes(indicator.contextType)) return;`
  → pour les indicateurs `course`/`group`/`activity`, **aucun pré-calcul**
  ici (le calcul se fait à la demande via `compute-view`, voir B.2).
- L161 : si `formula?.pipeline?.length` vide → `return` sans calcul.
- L165-169 : sinon,
  `formulaInterpreter.interpret(formulaToUse, { userId, activityId: process.env.TARGET_ACTIVITY_ID, indicatorId: indicator.id })`
  (point d'entrée `formula-interpreter.service.ts:71`). En cas d'erreur,
  warning loggé (L171), `value` reste `0`.
- L174-183 : `indicatorValueRepository.upsert({ indicatorId, contextType: indicator.contextType, contextId: userId, value, metadata: {...} }, { conflictPaths: ['indicatorId','contextType','contextId'] })`
  → upsert dans `indicator_values`.

### D.2 Choix de visualisation active / masquage de visualisations

- `setVizPreference` (B.3, C.3) → **`PATCH /api/preferences/:indicatorId?userId=`**
  body `{activeVizId}` → cascade `updatePreference` ci-dessus (sans
  transition de visibilité, donc sans effet sur `usageCount` ni
  `calculateAndStoreValue`).
- **Masquage sélectif** (`enabledVizIds`) : `indicator-selector.component.ts:739-756`
  `toggleViz(indicator, viz, event)` (clic sur les chips de visualisation du
  tableau) → `indicatorService.setEnabledVizIds(environment.defaultUserId, indicator.id, persisted)`
  (L754, `indicator.service.ts:255-265`) → **`PATCH /api/preferences/:indicatorId?userId=`**
  body `{enabledVizIds}` (fire-and-forget) → même cascade `updatePreference`.

### D.3 Suppression de préférence

`DELETE /api/preferences/:indicatorId?userId=` →
`user-preferences.controller.ts:41-47` `deletePreference` →
`user-preferences.service.ts:137-152` :
1. L138-140 `findOne({ where: { userId, indicatorId } })` — 404 si absent
   (L143).
2. L147 `delete({ userId, indicatorId })` → suppression dans
   `user_indicator_preferences`.
3. Si `wasVisible` était `true` : L150-151 `decrementUsageCount(indicatorId)`.

*(Aucun composant identifié n'appelle ce DELETE — endpoint exposé mais non
câblé côté UI à ce jour.)*

---

## E — Administration des indicateurs

Onglet "Indicateurs" → `features/dashboard/pages/indicators/indicators.page.ts`,
visible pour `canManageIndicators`/`canCreateIndicators` (`RoleService`).

### E.1 Liste admin + CRUD — `AdminIndicatorManagerComponent`

`features/admin/admin-indicator-manager.component.ts`

1. `ngOnInit()` L431-433 → `load()` L435-441 →
   `indicatorSvc.loadAllForAdmin()` (L437, `indicator.service.ts:37-39`) →
   **`GET /api/indicators/all`** → `indicators.controller.ts:24-27`
   `getAllForAdmin` → `indicators.service.ts:39-41` `findAllForAdmin` (sans
   filtre `isActive`, table `indicator_definitions`).
2. `toggleActive(indicator)` L587-595 (`nz-switch` "Statut") →
   `indicatorSvc.updateIndicatorStatus(indicator.id, indicator.isActive)`
   (L588) → **`PATCH /api/indicators/:id/status`** →
   `indicators.controller.ts:200-203` `toggleStatus` →
   `indicators.service.ts:152-156` `toggleStatus` (met à jour
   `isActive` dans `indicator_definitions`).
3. `deleteIndicator(indicator)` L597-605 (`nz-popconfirm`) →
   `indicatorSvc.deleteIndicator(indicator.id)` (L598) →
   **`DELETE /api/indicators/:id`** → `indicators.controller.ts:205-209`
   `deleteIndicator` → `indicators.service.ts:158-165` `delete` (suppression
   dans `indicator_definitions`, cascade ORM sur `indicator_values`,
   `indicator_formula_versions`, `indicator_execution_logs`,
   `indicator_snapshots`, `user_indicator_preferences` selon les relations
   de l'entité).
4. `openBuilder(indicator?)` L469-480 → ouvre `IndicatorBuilderComponent`
   (modale CRUD complète, voir tableau ci-dessous) ; recharge `load()` si la
   modale retourne "saved".
5. `openFamilyWizard()` / `openFamilyMember()` L483-522 : enchaîne plusieurs
   `IndicatorBuilderComponent` (un par contexte de la famille) — voir
   `project_indicateur_famille_feature` pour le détail fonctionnel.

### `IndicatorBuilderComponent` — `features/admin/indicator-builder.component.ts`

| Action UI | Méthode (L) | Appel → URL |
|---|---|---|
| Ouverture du builder (chargement du catalogue DSL) | L1228 | `getPlatonSchema()` → **`GET /api/indicators/schema`** |
| Sélection cours/activité pour "Tester" | L1236 | `getTeacherContext(environment.defaultUserId)` → **`GET /api/indicators/teacher/:teacherId/context`** |
| Sélection cours pour "Tester" | L1252 | `getCourseActivities(courseId)` → **`GET /api/indicators/course/:courseId/activities`** |
| Sélection cours pour "Tester" (élèves) | L1258 | `getCourseStudents(courseId)` → **`GET /api/indicators/course/:courseId/students`** |
| Bouton "Prévisualiser" | L1367 | `previewFormulaRaw(buildFormulaForViz(v), context)` → **`POST /api/indicators/preview`** |
| Bouton "Étapes de débogage" | L1390 | `previewFormulaSteps(buildFormulaForViz(v), context)` → **`POST /api/indicators/preview-steps`** |
| Sauvegarde — édition | L1672-1673 | `updateIndicator(modalData.indicator.id, payload)` → **`PATCH /api/indicators/:id`** |
| Sauvegarde — création | L1672-1673 | `createIndicator(payload)` → **`POST /api/indicators`** |

#### `POST /indicators` et `PATCH /indicators/:id` — cascade

- `indicators.controller.ts:108-110` `createIndicator` →
  `indicators.service.ts:117-135` `create` : insère dans
  `indicator_definitions`, puis si `pipeline.length > 0`,
  `saveFormulaVersion(...)` (L486-493 → insert dans
  `indicator_formula_versions`).
- `indicators.controller.ts:196-198` `updateIndicator` →
  `indicators.service.ts:137-150` `update` : `findById(id)` (L43-47), met à
  jour `indicator_definitions`, et si la formule a changé, même
  `saveFormulaVersion` (L486-493).

### `getCourseStudents` (`/course/:courseId/students`)

`indicators.controller.ts:48-51` → `indicators.service.ts:237-239` →
`PlatonService.getStudentsByCourse` (`platon.service.ts:153-165`) :
`SELECT ... FROM "Users" u ...` filtré par cours (table PLaTon `Users`,
jointure sur `CourseMembers`).

### E.2 Preview / preview-steps (debug DSL)

- **`previewFormulaRaw`** → `indicators.controller.ts:147-154`
  `previewFormula` → `indicators.service.ts:358-368` `preview` →
  `formulaInterpreter.interpret(formula, context)`
  (`interpreter/formula-interpreter.service.ts:71`). Comme `formulaContext`
  ne contient pas `indicatorId` (L362-366), **aucun log** n'est écrit dans
  `indicator_execution_logs` et **aucune écriture cache**. Retourne
  `{ result }`.
- **`previewFormulaSteps`** → `indicators.controller.ts:157-164`
  `previewFormulaSteps` → `indicators.service.ts:370-379` `previewSteps` →
  `formulaInterpreter.interpretWithSteps(formula, context)`
  (`interpreter/formula-interpreter.service.ts:41`). Capture l'état
  intermédiaire après chaque étape du pipeline, s'arrête à la première étape
  en erreur (avec `error`, sans réduire le résultat à 0), n'écrit jamais de
  log. Retourne `{ steps: [...] }`.

### E.3 Recalcul d'un indicateur — `recalculate`

`AdminIndicatorManagerComponent.recalculate(indicator)` L607-622
(`nz-popconfirm`) → `indicatorSvc.recalculateIndicator(indicator.id)`
(L609, `indicator.service.ts:109-113`) → **`POST /api/indicators/:id/recalculate`**
→ `indicators.controller.ts:183-185` `recalculate` →
`indicators.service.ts:167-227` `recalculate` :

1. L171-177 : résout la formule effective (`visualizations[].formula` ou
   `indicator.formula` legacy).
2. L179-183 : `preferenceModel` → liste des `userId` ayant activé
   l'indicateur (table `user_indicator_preferences`).
3. L190-223 : boucle par lots de 10 (`BATCH`), pour chaque `userId` :
   - L194 `PlatonService.getUserSessionData(userId)`
     (`platon.service.ts:28-44`) → `SELECT ... FROM "SessionData" WHERE user_id = $1`
     (table PLaTon `SessionData`).
   - L195-199 : détermine `latestActivityId` (session la plus récente).
   - L201-205 : `formulaInterpreter.interpret(formula, { userId, activityId, indicatorId })`
     (`formula-interpreter.service.ts:71`) — écrit aussi un log dans
     `indicator_execution_logs` (car `indicatorId` fourni).
   - L207-216 : `indicatorValueModel.upsert(...)` sur `indicator_values`,
     `contextType: 'learner'`, `contextId: userId`.
4. L226 : retourne `{ processed, updated, failed }`.

### E.4 Historique de formule + rollback

- **Ouvrir l'historique** : `admin-indicator-manager.component.ts:534-563`
  `openHistory(indicator)` → `indicatorSvc.getFormulaHistory(indicator.id)`
  (L536, `indicator.service.ts:133-135`) → **`GET /api/indicators/:id/formula-history`**
  → `indicators.controller.ts:93-95` `getFormulaHistory` →
  `indicators.service.ts:387-393` `getFormulaHistory` → repo
  `formulaVersionModel` (table `indicator_formula_versions`,
  `where: { indicatorId }`, triées par date).
- **Rollback** : la modale `HistoryModalComponent` (`onRollback(versionId)`)
  → `admin-indicator-manager.component.ts:545`
  `indicatorSvc.rollbackFormula(indicator.id, versionId)` →
  **`POST /api/indicators/:id/rollback/:versionId`** →
  `indicators.controller.ts:188-193` `rollbackFormula` →
  `indicators.service.ts:395-402` `rollbackFormula` :
  1. L396 `formulaVersionModel.findOne({ where: { id: versionId, indicatorId: id } })`
     (table `indicator_formula_versions`) — 404 si introuvable.
  2. L399-400 `findById(id)` (L43-47), puis `indicator.formula = version.formula`.
  3. L401 `indicatorModel.save(indicator)` → écrit `indicator_definitions`.
  4. Le rollback **ne crée pas** de nouvelle version (contrairement à
     `update`/`create`).

### E.5 Logs d'exécution

`admin-indicator-manager.component.ts:565-583` `openLogs(indicator)` →
`indicatorSvc.getExecutionLogs(indicator.id, 100)` (L567,
`indicator.service.ts:145-147`) → **`GET /api/indicators/:id/logs?limit=100`**
→ `indicators.controller.ts:98-103` `getExecutionLogs` →
`indicators.service.ts:406-412` `getExecutionLogs` → repo `logModel`
(table `indicator_execution_logs`, `where: { indicatorId }`, `take: limit`,
triées par date décroissante). Ces lignes sont écrites par `interpret()`
(B.2 étape 9, E.2, E.3, F).

### E.6 Schema PLaTon (catalogue tables/colonnes pour le builder)

`indicatorService.getPlatonSchema()` (`indicator.service.ts:149-153`) →
**`GET /api/indicators/schema`** → `indicators.controller.ts:31-33`
`getPlatonSchema` → `indicators.service.ts:381-383` →
`PlatonService.getAvailableTables` (`platon.service.ts:347-364`) :

1. L348-354 : `SELECT ... FROM information_schema.columns WHERE table_schema = 'public'`,
   triée par `table_name, ordinal_position`.
2. **Filtrage de sécurité** L358 :
   `if (PlatonService.SENSITIVE_COLUMN_PATTERN.test(row.column_name)) continue;`
   — pattern défini `platon.service.ts:14-15` :
   `/password|passwd|secret|token|api[_-]?key|hash|salt|credential|email|phone|discord|ip_address/i`.
3. L356-363 : regroupe par table dans une `Map`, retourne
   `[{ name, columns: [{name, type}] }]`.

> Le même pattern est réutilisé par `getSafeColumns` (L372-393) et
> `buildSafeSelect` (L396-399), utilisés par les étapes `fetch`/`join` du
> moteur DSL et par `queryTableForGroup` (L263-299) — la sécurité est donc
> cohérente entre le schéma exposé au builder et les requêtes réellement
> exécutées par `interpret()` (B.2).

---

## F — Page activité & snapshots de groupe

`/dashboard/courses/:id/activities/:activityId` →
`features/courses/course/activity/activity.page.ts`

### F.1 Chargement des indicateurs de la page

1. `ngOnInit()` L120-162 → `loadActivityIndicators()` L168-190 :
   `combineLatest([indicatorService.loadIndicators(), settingsService.getSettings()])`
   (L172-173) → **`GET /api/indicators`** (A.1) + cache des préférences.
   Filtre `activityIndicators` (`contextType === 'activity'`) et
   `groupIndicators` (`contextType === 'group'`).
2. `presenter.contextChange.subscribe(...)` L124-161 (déclenché par
   `ActivityPresenter`, qui charge l'activité — voir G.4) construit :
   - `activityContext: DashboardContext` (`scope: 'activity'`, L136-140) —
     consommé par `<ui-indicator-card>` pour `activityIndicators` →
     **cascade B.2** avec `contextType: 'activity'`.
   - `indicatorQueryParams` (`from: 'activity', activityId, courseId,
     activityName, courseName`, L143-149) — passé en `[queryParams]` aux
     `<ui-indicator-card>` pour la navigation vers `indicator-detail` (C,
     branche `q['from'] === 'activity'`).

### F.2 Section "Par groupe" — `GroupSnapshotsPanelComponent`

`features/courses/course/activity/group-snapshots-panel.component.ts`

1. `ngOnInit()` L356 → `loadGroups().then(() => loadAllSnapshots())`.
2. `loadGroups()` L360-372 : appel **HTTP direct via `HttpClient`** (pas via
   `indicator.service.ts`) → **`GET {environment.apiUrl}/v1/courses/:courseId/groups`**
   (`apiBase = ${environment.apiUrl}/v1`, L354) → voir G.3 pour la cascade
   backend (`courses.controller.ts:79-82` → `courses.service.ts:182-193` →
   table PLaTon `CourseGroups`).
3. `loadAllSnapshots()` L374-395 : pour chaque indicateur de
   `groupIndicators`, `indicatorService.getSnapshots(ind.id, activityId)`
   (L381, `indicator.service.ts:203-207`) → **`GET /api/indicators/:id/snapshots?activityId=`**
   → `indicators.controller.ts:215-221` `getSnapshots` →
   `indicators.service.ts:416-421` → repo `snapshotModel`
   (table `indicator_snapshots`, `where: { indicatorId, activityId }`,
   triées par `createdAt`).
4. `toRow(snapshot)` L397-419 : construit un `DashboardContext`
   (`scope: 'group', scopeId: snapshot.contextId, activityId`) et des
   `queryParams` (`from: 'group-snapshot', groupId, groupName, activityId,
   courseId, activityName, courseName`) → passés à `<ui-indicator-card>`
   (template L99-105) → **cascade B.2** avec `contextType: 'group'`, puis
   navigation vers `indicator-detail` (C, branche `group-snapshot`).
5. **Ajout** : `addSnapshot(panel)` L439-472 (formulaire L175-180, dropdown
   filtré sur les groupes déjà ajoutés) →
   `indicatorService.createSnapshot(panel.indicator.id, {contextType:'group', contextId: group.id, activityId, title: group.name})`
   (L449-455, `indicator.service.ts:209-214`) → **`POST /api/indicators/:id/snapshots`**
   → `indicators.controller.ts:225-233` `createSnapshot` →
   `indicators.service.ts:423-435` :
   - L427-432 : vérifie l'unicité `(indicatorId, contextType, contextId, activityId)`
     dans `indicator_snapshots` → `ConflictException` (409) si doublon (géré
     côté UI, message d'erreur affiché).
   - sinon `create` + `save` → insert dans `indicator_snapshots`.
6. **Édition du titre** : `saveTitle(panel, row)` L485-507 (validation par
   Entrée ou bouton "check", template L128-134) →
   `indicatorService.updateSnapshotTitle(panel.indicator.id, row.snapshot.id, newTitle)`
   (L495, `indicator.service.ts:216-221`) → **`PATCH /api/indicators/:id/snapshots/:snapshotId`**
   body `{title}` → `indicators.controller.ts:237-244` `updateSnapshotTitle`
   → `indicators.service.ts:437-442` : `findOne({ id: snapshotId, indicatorId })`,
   modifie `title`, `save` → update `indicator_snapshots`.
7. **Suppression** : `deleteSnapshot(panel, row)` L509-520 (`nz-popconfirm`,
   template L115-120) →
   `indicatorService.deleteSnapshot(panel.indicator.id, row.snapshot.id)`
   (L512, `indicator.service.ts:223-225`) → **`DELETE /api/indicators/:id/snapshots/:snapshotId`**
   → `indicators.controller.ts:248-254` `deleteSnapshot` →
   `indicators.service.ts:444-448` : `findOne` puis
   `snapshotModel.remove(snapshot)` → delete dans `indicator_snapshots`.

### F.3 Rafraîchissement automatique des snapshots — `refreshSnapshots`

`indicators.service.ts:455-482` `refreshSnapshots(indicatorId, activityId)` —
**non exposée par une route** ; appelée en fire-and-forget depuis
l'ingestion d'événements (voir I.3). Flux :

1. L456 : récupère tous les `indicator_snapshots` de
   `(indicatorId, activityId)`. Si vide → return.
2. L459-460 : récupère l'`IndicatorDefinition` correspondant (sinon return).
3. L462-481 : double boucle snapshot × visualisation de l'indicateur →
   `computeView(snapshot.indicatorId, snapshot.contextType, snapshot.contextId, snapshot.activityId, viz.id, true)`
   (`forceRefresh = true`, bypass du cache existant) — **cascade identique à
   B.2**, avec écriture forcée dans `indicator_values` et log dans
   `indicator_execution_logs`.
4. L475-479 : try/catch par snapshot/viz, `logger.warn` en cas d'erreur sans
   interrompre la boucle.

---

## G — Cours

Module `api/src/modules/features/courses/` (`@Controller('v1/courses')` →
`/api/v1/courses`). Le service interroge directement
`@Inject('PLATON_DATA_SOURCE') DataSource` en SQL brut (connexion `'platon'`,
lecture seule), sans passer par `PlatonService`.

Côté frontend, ces pages utilisent `CourseService`
(`platon-stubs/course-browser.ts`, `const API = ${environment.apiUrl}/v1`,
L57) via `CoursePresenter` (`features/courses/course/course.presenter.ts`).
**Important** : la plupart des opérations d'**écriture** (membres, sections,
groupes, démos...) sont des **stubs no-op** côté `course-browser.ts`
(`of({} as Course)` ou `of(undefined)`) — seules les **lectures** listées
ci-dessous déclenchent un vrai appel HTTP.

### G.1 Liste / recherche des cours

`features/courses/courses.page.ts` :

- `ngOnInit()` L110-161 : à chaque changement de
  `activatedRoute.queryParams` (L127) →
  `courseService.search({...filters, members: [user.id], expands: ['permissions','statistic']})`
  (L145-151) → `course-browser.ts:80-85` `search()` → **`GET /api/v1/courses?...`**
  (params construits par `buildParams()`, `course-browser.ts:59-70`).
- `searchAll()` L163-182 (bouton "Afficher tout", admin) → même endpoint sans
  filtre `members`.

Backend : `courses.controller.ts:9-24` `search` (params `search`, `members`,
`period`, `offset`, `limit`, `order`, `direction`) → `courses.service.ts:11-93`
`searchCourses` :

1. L24-44 : conditions dynamiques (`search` → `LOWER(c.name) LIKE`,
   `members` → `c.owner_id = ANY(...)` ou sous-requête `"CourseMembers"`,
   `period` → filtre `updated_at`).
2. L54-57 : `SELECT COUNT(DISTINCT c.id) FROM "Courses" c ...`.
3. L60-85 : requête principale `SELECT DISTINCT ON (c.id) ... FROM "Courses" c
   LEFT JOIN "Users" u ...` avec sous-requêtes :
   - `COUNT(*) FROM "CourseMembers" cm WHERE role='student'` (L65) /
     `role='teacher'` (L66)
   - `COUNT(*) FROM "Activities" a WHERE a.course_id = c.id` (L67)
   - `AVG(s.grade) FROM "Sessions" s JOIN "Activities" a_s` (L68-73)
   - `AVG(...) timeSpent FROM "Sessions" s JOIN "Activities" a_s` (L74-80)
4. L85 : pagination `LIMIT`/`OFFSET`. L90 : mapping `mapCourse(r)`
   (L336-356).

### G.2 Détail cours, sections, activités d'un cours

`CoursePresenter.refresh(id)` (`course.presenter.ts:371-390`, déclenché par
`activatedRoute.paramMap`, L46-49) :

- `courseService.find({id, expands:['permissions','statistic']})` (L375-379)
  → `course-browser.ts:87-91` → **`GET /api/v1/courses/:id`** →
  `courses.controller.ts:103-108` `findById` → `courses.service.ts:95-125`
  `findCourseById` :
  - `SELECT c.*, TRIM(...) AS "ownerName", (sous-requêtes studentCount/
    teacherCount/activityCount/progression/timeSpent) FROM "Courses" c LEFT
    JOIN "Users" u ON u.id = c.owner_id WHERE c.id = $1` (L96-121,
    sous-requêtes sur `CourseMembers`, `Activities`, `Sessions`+`Activities`).
    404 si vide (L123). Mapping `mapCourse` (L124).
- `courseService.getDemo(course.id)` (L382) → stub, retourne `null`
  (`course-browser.ts` ~L165, pas de HTTP réel).

`CoursePresenter.listSections()` (L116-123) →
`courseService.listSections(course)` (L121) → `course-browser.ts:101-103` →
**`GET /api/v1/courses/:id/sections`** → `courses.controller.ts:27-29`
`listSections` → `courses.service.ts:233-246` :
`SELECT ... FROM "CourseSections" s WHERE s.course_id = $1 ORDER BY s.order ASC, s.created_at ASC`.

`CoursePresenter.listActivities(filters?)` (L152-159) →
`courseService.listActivities(course, filters)` (L157) →
`course-browser.ts:117-122` → **`GET /api/v1/courses/:id/activities?sectionId=&challenge=`**
→ `courses.controller.ts:32-39` `listActivities` → `courses.service.ts:248-334`
`listActivities` :

1. L262-286 : `SELECT ... FROM "Activities" a LEFT JOIN "Resources" r ON r.id
   = (a.source->>'resource')::uuid WHERE a.course_id = $1 [AND
   a.section_id = $n] [AND a.is_challenge = true] ORDER BY a.order ASC,
   a.created_at ASC`. Si vide → retour anticipé `{ resources: [], total: 0 }`
   (L288).
2. L296-324 : 3 requêtes en parallèle (`Promise.all`) sur `activityIds` :
   - `progressionRows` : `AVG(s.grade) FROM "Sessions" s WHERE
     s.parent_id IS NOT NULL AND s.activity_id = ANY($1) AND s.grade >= 0
     GROUP BY s.activity_id` (L297-305).
   - `timeSpentRows` : `AVG(LEAST(EXTRACT(EPOCH FROM (s.last_graded_at -
     s.started_at)), 28800)) FROM "Sessions" s WHERE s.parent_id IS NULL ...
     GROUP BY s.activity_id` (L306-316).
   - `exerciseCountRows` : `COUNT(DISTINCT resource_id) FROM "SessionData"
     WHERE activity_id = ANY($1) GROUP BY activity_id` (L317-323).
3. L331 : mapping `mapActivity(r, progressionMap, timeSpentMap,
   exerciseCountMap)` (L358-392).

> **Note routage NestJS** : `:id/sections`, `:id/activities`, `:id/groups`,
> `:id/groups/:groupId/members`, `:id/members` sont déclarées **avant**
> `GET /:id` (`courses.controller.ts:102`), donc prioritaires.

### G.3 Membres et groupes de TP d'un cours

- `features/courses/course/members/members.page.ts:74-98` `ngOnInit()` :
  pas d'appel direct — `CourseMemberSearchBarComponent`/
  `CourseMemberTableComponent` (stubs `@platon/feature/course/browser`)
  appellent en interne `courseService.searchMembers` (`course-browser.ts`
  ~L154-163) → **`GET /api/v1/courses/:id/members?roles=&role=&search=`** →
  `courses.controller.ts:93-100` `listMembers` → `courses.service.ts:127-180`
  `listMembers` :
  - L128-149 : conditions dynamiques (`roles` séparés par virgule →
    `cm.role = ANY(...)`, sinon `role` exact ; `search` → filtre
    `LOWER(first_name/last_name/username) LIKE`).
  - L151-161 : `SELECT cm.id, cm.course_id, cm.user_id, cm.role,
    cm.created_at, u.username, u.first_name, u.last_name FROM
    "CourseMembers" cm LEFT JOIN "Users" u ON u.id = cm.user_id WHERE ...
    ORDER BY cm.role, u.last_name ASC` (tables `CourseMembers`, `Users`).
  - `addMembers`/`remove`/`updateRole` (`members.page.ts:104-128`) →
    `presenter.addMember`/`deleteMember`/`updateMemberRole` → **stubs no-op**
    (`course-browser.ts:138-152`).
  - `features/courses/course/students/students.page.ts:1-13` est un simple
    wrapper qui réutilise `CourseMembersPage`.

- `features/courses/course/groups/groups.page.ts:46-61` `ngOnInit()` :
  - `presenter.listCourseGroups()` (L53) → `courseService.listGroups(course.id)`
    (`course.presenter.ts:253-260`) → `course-browser.ts:177-179` →
    **`GET /api/v1/courses/:id/groups`** → `courses.controller.ts:80-82`
    `listGroups` → `courses.service.ts:182-193` `listGroups` :
    `SELECT cg.id, cg.group_id AS "groupId", cg.course_id, cg.name,
    cg.created_at FROM "CourseGroups" cg WHERE cg.course_id = $1 ORDER BY
    cg.created_at ASC`.
  - pour chaque groupe, `presenter.listCourseGroupMembers(courseGroup.groupId)`
    (L56) → `courseService.listGroupMembers(course.id, groupId)`
    (`course.presenter.ts:283-297`) → `course-browser.ts:193-195` →
    **`GET /api/v1/courses/:id/groups/:groupId/members`** →
    `courses.controller.ts:85-90` `listGroupMembers` →
    `courses.service.ts:195-231` `listGroupMembers` :
    `SELECT cgm.user_id, cgm.group_id, cm.id, cm.course_id, cm.role,
    cgm.created_at, u.username, u.first_name, u.last_name FROM
    "CourseGroupsMember" cgm LEFT JOIN "Users" u ON u.id = cgm.user_id LEFT
    JOIN "CourseMembers" cm ON cm.user_id = cgm.user_id AND cm.course_id =
    $1 WHERE cgm.group_id = $2 ORDER BY u.last_name ASC, u.first_name ASC`
    (mapping en mémoire L214-230).
  - `updateGroupName`/`removeGroupMember`/`addGroupMember`/`addGroup`/
    `deleteGroup` (`groups.page.ts:63-90`) → tous **stubs no-op** côté
    `course-browser.ts`.

### G.4 Page activité — résultats, détail, CSV

`ActivityPresenter` (consommé par `activity.page.ts`, voir F.1) :

- **Détail activité** : `findActivity(courseId, activityId)` →
  **`GET /api/v1/courses/:courseId/activities/:activityId`** →
  `courses.controller.ts:72-77` `findActivity` (ici `courseId` **est**
  utilisé) → `courses.service.ts:394-417` `findActivity` :
  `SELECT a.*, COALESCE(...) AS title, (a.source->>'resource')::text AS
  "resourceId", ... FROM "Activities" a LEFT JOIN "Resources" r ON r.id =
  (a.source->>'resource')::uuid WHERE a.course_id = $1 AND a.id = $2`. Si
  vide → `throw new Error(...)` (L415, **pas de** `NotFoundException`).
  Mapping `mapActivity(rows[0])` (L416).

- **Résultats** : `getActivityResults(activityId)` →
  **`GET /api/v1/courses/:courseId/activities/:activityId/results`**
  (`:courseId` déclaré mais **non lu** par le contrôleur — ignoré) →
  `courses.controller.ts:56-58` `getActivityResults` →
  `courses.service.ts:419-541` `getActivityResults` (3 requêtes) :
  1. `exerciseRows` : `SELECT sd.resource_id, ..., AVG(sd.grade),
     AVG(sd.attempts), ... FROM "SessionData" sd LEFT JOIN "Resources" r ON
     r.id = sd.resource_id WHERE sd.activity_id = $1 GROUP BY sd.resource_id,
     r.name` (L421-438).
  2. `userRows` : `SELECT u.*, AVG(sd.grade), SUM(sd.attempts), json_agg(...)
     FROM "SessionData" sd JOIN "Users" u ON u.id = sd.user_id LEFT JOIN
     "Resources" r ON r.id = sd.resource_id WHERE sd.activity_id = $1 GROUP
     BY u.id, ...` (L441-465).
  3. `statsRows` : `SELECT AVG(sub.avg_grade), ... FROM (SELECT user_id,
     AVG(grade), SUM(attempts) FROM "SessionData" WHERE activity_id = $1
     GROUP BY user_id) sub` (L468-482).
  Construction de la réponse (`exercises`, `users`, stats globales) en
  mémoire (L484-541).

- **Résultats par date** : `getActivityResultsForDate(activityId, start, end)`
  → **`GET /api/v1/courses/:courseId/activities/:activityId/results/date?start=&end=`**
  (`:courseId` ignoré ; `start`/`end` défaut = 365 derniers jours) →
  `courses.controller.ts:42-53` `getActivityResultsForDate` →
  `courses.service.ts:543-577` :
  `SELECT u.id, u.username, ..., DATE(sd.created_at), COUNT(CASE WHEN
  sd.grade >= 100 ...) FROM "SessionData" sd JOIN "Users" u ON u.id =
  sd.user_id WHERE sd.activity_id = $1 AND sd.created_at BETWEEN $2 AND $3
  GROUP BY ... ORDER BY u.id, DATE(sd.created_at)` (tables `SessionData`,
  `Users`). Regroupement en mémoire par utilisateur (L560-576).

- **Export CSV** : `getActivityCsv(activityId)` →
  **`GET /api/v1/courses/:courseId/activities/:activityId/csv`**
  (`:courseId` ignoré) → `courses.controller.ts:61-69` `getActivityCsv`
  (réponse Express manuelle via `@Res()`) → `courses.service.ts:579-606`
  `getActivityCsv` :
  `SELECT u.username, u.first_name, u.last_name, r.name AS "exerciseName",
  sd.grade, sd.attempts, TO_CHAR(sd.created_at, 'YYYY-MM-DD HH24:MI') FROM
  "SessionData" sd JOIN "Users" u ON u.id = sd.user_id LEFT JOIN "Resources"
  r ON r.id = sd.resource_id WHERE sd.activity_id = $1 ORDER BY u.last_name,
  u.first_name, r.name` (tables `SessionData`, `Users`, `Resources`).
  Génération CSV en mémoire (L594-605). Le contrôleur fixe
  `Content-Type: text/csv; charset=utf-8` et
  `Content-Disposition: attachment; filename="activity-<id>.csv"`, écrit un
  BOM UTF-8 (`courses.controller.ts:66-68`).

---

## H — Ressources

Module `api/src/modules/features/resources/` (`@Controller('v1/resources')`
→ `/api/v1/resources`), même pattern SQL brut sur `'platon'`. Frontend :
`ResourceService` (`platon-stubs/resource-browser.ts`,
`const API = ${environment.apiUrl}/v1`, L39) via
`features/resources/resource/resource.presenter.ts` (`ResourcePresenter`).
Là aussi, la plupart des opérations d'écriture (`update`, `delete`, `join`,
`duplicate`, `watch`...) sont des **stubs no-op** `of(undefined)`.

### H.1 Page de recherche — `features/resources/resources.page.ts`

`ngOnInit()` L188-300 :

- L207-214 `Promise.all([...])` :
  - `resourceService.tree()` (L208) → `resource-browser.ts:73-77` →
    **`GET /api/v1/resources/tree`** → `resources.controller.ts:11-13`
    `getTree` → `resources.service.ts:132-143` `getCircleTree` :
    `SELECT id, name, parent_id AS "parentId" FROM "Resources" WHERE type =
    'CIRCLE' AND personal = false ORDER BY name ASC` (L134-139), arbre
    construit en mémoire par `buildTree` (L207-218). Retourne soit la racine
    unique, soit `{ id: 'root', name: 'Cercles', children: tree }` (L142).
  - `resourceService.circle(user.username)` (L209) →
    `resource-browser.ts:79-86` → **`GET /api/v1/resources/user-circle?userId=`**
    (utilise `environment.defaultUserId`, pas le username réel) →
    `resources.controller.ts:26-28` `getUserCircle` →
    `resources.service.ts:172-205` `getUserCircle` :
    `SELECT r.* FROM "Resources" r WHERE r.personal = true AND r.owner_id =
    $1 LIMIT 1` (L173-185). Si aucune ligne, retourne un objet `CIRCLE`
    minimal construit en mémoire (`id: userId, name: 'Mon espace',
    permissions: {read:true, write:true}`, L187-202, pas d'écriture DB).
    Sinon `mapResource(rows[0])` (L204).
  - `resourceService.search({views: true, expands: EXPANDS})` (L210) → voir
    ci-dessous.
  - `resourceService.listOwners()` (L213) → `resource-browser.ts:94-98` →
    **`GET /api/v1/resources/owners`** → `resources.controller.ts:21-23`
    `getOwners` → `resources.service.ts:159-170` `getOwners` :
    `SELECT DISTINCT u.id, u.username, u.first_name, u.last_name, u.email
    FROM "Users" u INNER JOIN "Resources" r ON r.owner_id = u.id WHERE
    r.type != 'CIRCLE' ORDER BY u.username ASC LIMIT 100`.
- `completion = resourceService.completion().pipe(shareReplay(1))` (L157) →
  `resource-browser.ts:88-92` → **`GET /api/v1/resources/completion`** →
  `resources.controller.ts:16-18` `getCompletion` →
  `resources.service.ts:145-157` `getCompletion` :
  `SELECT DISTINCT name FROM "Resources" WHERE type != 'CIRCLE' ORDER BY
  name LIMIT 200`, retourne `{ resource: { names, topics: [], levels: [] } }`
  (`topics`/`levels` toujours vides). Utilisé pour les suggestions de la
  barre de recherche (L126-145).
- L243-296 : à chaque changement de `activatedRoute.queryParams` →
  `resourceService.search({...filters, expands: EXPANDS, limit:
  PAGINATION_LIMIT})` (L276-282) → `resource-browser.ts` `search()` →
  **`GET /api/v1/resources?search=&types=&status=&owners=&parents=&personal=&period=&offset=&limit=&order=&direction=`**
  → `resources.controller.ts:33-65` `search` → `resources.service.ts:26-109`
  `searchResources` :
  - L28-74 : conditions dynamiques (`search` → `LOWER(name) LIKE` ou
    `LOWER(desc) LIKE` ; `types`/`status`/`owners`/`parents` → `ANY($n)` ;
    `personal` → `=true/false` ; `period` → `updated_at >= NOW() - INTERVAL`).
  - L81-84 : `SELECT COUNT(*) FROM "Resources" r ${where}`.
  - L87-103 : `SELECT r.id, r.name, ... FROM "Resources" r ${where} ORDER BY
    ${orderField} ${orderDir} LIMIT $n OFFSET $n`. Mapping `mapResource(r)`
    (L106, L220-239).
  - ⚠️ Le paramètre `views=true` ("récemment consultées", commentaire L27)
    **n'est pas implémenté** — aucune condition basée sur `filters.views`.
- `loadMore()` L340-361 (scroll infini, `ViewportIntersectionDirective`) →
  même `search()` avec `offset: items.length`.

### H.2 Détail ressource — `ResourcePresenter.refresh(id)`

`resource.presenter.ts:403-425` (déclenché par `activatedRoute.paramMap`,
L48-51) :

- `resourceService.find({id, markAsViewed: isInitialLoading,
  expands:['parent','statistic','metadata']})` (L406-412) →
  `resource-browser.ts:67-71` → **`GET /api/v1/resources/:id`** →
  `resources.controller.ts:68-74` `findById` → `resources.service.ts:111-130`
  `findResourceById` : `SELECT r.* FROM "Resources" r WHERE r.id::text = $1
  OR r.code = $1` (L112-126). 404 si vide (L128). Mapping `mapResource`
  (L129).
- `resourceService.tree()` (L413) → **`GET /api/v1/resources/tree`** (H.1).

Sous-pages `features/resources/resource/{overview,browse,settings,events}` :
consomment `ResourcePresenter.contextChange` déjà chargé, pas de nouveaux
appels indicateurs identifiés. `settings/members/members.page.ts` utilise
`presenter.searchMembers()` → stub `of({resources:[], total:0})`
(`resource-browser.ts:120-122`) — aucune donnée réelle.

---

## I — Ingestion d'événements PLaTon

Module `api/src/modules/features/ingestion/` (`@Controller('ingest')` →
`/api/ingest`).

### I.1 `POST /api/ingest`

`ingestion.controller.ts:20-33` `ingestEvent(event: IngestionEventDto)` :
normalise `event.timestamp` (L24-26), puis **fire-and-forget**
`ingestionService.ingestEvent(event)` (sans `await`, `.catch()` log
uniquement, L28-30), répond immédiatement
`{ status: 'accepted', message: 'Event received for processing' }` (HTTP 202,
`@HttpCode(HttpStatus.ACCEPTED)`).

### I.2 `POST /api/ingest/batch`

`ingestion.controller.ts:37-49` `ingestBatch(events: IngestionEventDto[])` :
même normalisation par event (L39-42), **fire-and-forget**
`ingestionService.ingestBatch(processedEvents)` (L44-46), répond
`{ status: 'accepted', message: '<n> events received' }` (HTTP 202).

### I.3 Cascade — `IngestionService.ingestEvent` (`ingestion.service.ts:45-87`)

1. L49 `isValidEvent(event)` (L204-220) — vérifie `type`, `userId`, force
   `timestamp` si absent. Invalide → warning + `return`.
2. L54 `findAffectedIndicators(event)` (L106-118) :
   - `refreshIndicatorCache()` (L107, L180-202) — recharge
     `indicatorDefinitionModel.find({ where: { isActive: true } })`
     (L188-190, table `indicator_definitions`) si le cache (TTL 60000 ms,
     L28) est expiré ou vide.
   - filtre les indicateurs dont `requiredEvents` (champ JSON de
     `IndicatorDefinition`) inclut `event.type` (L112).
3. Si aucun indicateur affecté → `return` (L56-59).
4. Pour chaque indicateur affecté (L61-69) :
   a. `processIndicatorUpdate(indicator, event)` (L120-178) :
      - Ne traite que `contextType === 'learner'` (L121, L124-127) ; sinon
        log debug et retourne sans rien faire.
      - Si `formula?.pipeline?.length > 0` (L130) : calcule `newValue` via
        `formulaInterpreter.interpret(indicator.formula, { userId:
        event.userId, activityId: event.activityId, courseId:
        event.courseId, indicatorId: indicator.id })` (L133-138).
      - L141-143 `indicatorValueModel.findOne({ where: { indicatorId:
        indicator.id, contextType: 'learner', contextId: event.userId } })`
        (table `indicator_values`).
      - Si trouvé et `hasDslFormula` : update `value`/`metadata.lastUpdate`,
        `save` (L145-153). Sinon : `create` + `save` (L154-167, `value: 0`
        si pas de formule DSL).
      - **Effet de bord** : `eventEmitter.emit('indicator.<name>.updated',
        {...})` (L169-177, `EventEmitter2` interne).
   b. **Fire-and-forget** L65-67 : si `event.activityId` présent,
      `this.indicatorsService.refreshSnapshots(indicator.id, event.activityId)`
      (sans `await`, `.catch()` warning) — **cascade décrite en F.3**.
5. L71-75 `eventEmitter.emit('ingestion.event.processed', { eventType,
   indicatorsCount, processingTime })`.
6. Erreur globale → `eventEmitter.emit('ingestion.event.error', {...})`
   (L80-84) puis re-throw (L85) — capturée par le `.catch()` du contrôleur.

`ingestBatch(events)` (L89-104) : boucle séquentielle, appelle `ingestEvent`
pour chaque event (L95), comptabilise `{ total, processed, failed }` (L103) —
valeur jamais consultée par le contrôleur (appel fire-and-forget).

### I.4 Méthodes annexes (non routées)

- `getIngestionStats()` (L222-227) : taille/âge du cache d'indicateurs, pas
  d'accès DB.
- `resetIndicator(indicatorId, contextId?)` (L229-237) :
  `indicatorValueModel.delete({ indicatorId, [contextId] })` → DELETE sur
  `indicator_values`.

> **Côté frontend**, aucun composant n'appelle directement `/ingest` ou
> `/ingest/batch`. `core/services/indicator-event.service.ts` (`ingestUrl =
> environment.indicatorsApiUrl + '/ingest'`, L21) expose `flush()` (L62-77 →
> `POST {ingestUrl}/batch`, toutes les 5s ou si la file dépasse 50 événements,
> L29-31/L57-59) et des méthodes `sendExerciseAnswered`/
> `sendSessionCompleted`/`sendSessionStarted`/`sendActivityViewed`/
> `sendCourseEnrolled` (L91-130). Ce service est consommé par
> `core/interceptors/indicator.interceptor.ts` (enregistré globalement dans
> `app.config.ts:44` via `withInterceptors([indicatorInterceptor])`) : il
> intercepte les requêtes `POST/PUT/PATCH/DELETE` et, si l'URL contient
> `/exercises/.../answers` ou `/sessions`, traduit la réponse en
> `IndicatorEvent` (`indicator.interceptor.ts:24-58`). **Ces URLs
> (`/exercises`, `/sessions`) ne sont pas exposées par ce microservice** —
> l'interceptor est prévu pour s'activer une fois le frontend intégré dans
> l'application PLaTon principale (où ces routes existent réellement).

---

## J — Modules legacy / orphelins

### J.1 `activity-attempts` (legacy)

`api/src/modules/features/activity-indicator/` (`@Controller('indicators/activity-attempts')`
→ `/api/indicators/activity-attempts`) :

| Route | Contrôleur | Service | Données |
|---|---|---|---|
| `GET /value?userId=&activityId=&indicatorId=` | `activity-indicator.controller.ts:21-55` `getIndicatorValue` | `getIndicatorWithDetails` (`activity-indicator.service.ts:27-40`) | `attemptsCalculator.calculateForActivity` + `platonService.getActivityDetails(activityId)` + `indicatorDefinitionModel.findOne` |
| `GET /raw?userId=&activityId=` | `activity-indicator.controller.ts:61-74` `getRawValue` | `getIndicatorValue` (`activity-indicator.service.ts:23-25`) | idem, sans détails |
| `GET /history?userId=&activityId=&limit=` | `activity-indicator.controller.ts:80-121` `getHistory` | `indicatorsService.getValues(...)` puis filtre en mémoire sur `metadata.activityId` | table `indicator_values` |
| `POST /recalc/:activityId` | `activity-indicator.controller.ts:127-155` `recalcForActivity` | `recalculateForActivity` (`activity-indicator.service.ts:42-51`, fire-and-forget) | boucle `platonService.getUsersByActivity` + `attemptsCalculator.calculateForActivity` + upsert `indicator_values` (`saveIndicatorValue`, L73-110) |
| `GET /activities` | `activity-indicator.controller.ts:161-168` `getActivities` | `getAllActivities` → `platonService.getAllActivities()` | table PLaTon activités |
| `GET /ranking/:activityId` | `activity-indicator.controller.ts:174-197` `getRanking` | `getRankingForActivity` (`activity-indicator.service.ts:57-71`) | boucle `platonService.getUsersByActivity` + `getIndicatorValue` par user, tri croissant |

`AttemptsCalculatorService.calculateForActivity` (`indicators/calculators/attempts-calculator.service.ts:18-108`) :
récupère `platonService.getUserSessionDataByActivity(userId, activityId)`,
groupe par exercice (`resource_id`), pour chaque exercice cherche le premier
enregistrement `grade === 100` et prend sa colonne `attempts` comme "tentatives
avant réussite", puis fait la moyenne sur les exercices réussis.

**Côté frontend** : `features/activity-indicator/activity-indicator.component.ts`
appelle `core/services/activity-indicator.service.ts:29-31`
`getValue(userId, activityId, indicatorId)` → **`GET /indicators/activity-attempts/value?userId=&activityId=&indicatorId=`**.
Ce composant est exporté par `shared/ui/index.ts:8` mais **n'est monté dans
aucune route** (`app.routes.ts`/`dashboard.routes.ts`) — orphelin, non
accessible depuis l'UI. `readme.md` §13 note que ce module devrait être migré
vers le moteur DSL.

### J.2 Services frontend orphelins ou peu utilisés

- **`core/services/group.service.ts`** : `getGroupsForTeacher(teacherId)`
  (L18-20 → `GET /api/groups?teacherId=`) et `getGroupMembers(groupId)`
  (L22-24 → `GET /api/groups/members?groupId=`). **Aucun composant n'injecte
  `GroupService`** — service défini mais jamais utilisé. Backend
  correspondant : `groups.controller.ts:13-16`/`24-27` → `groups.service.ts:8-14`
  → `PlatonService.getGroupsForTeacher` (`platon.service.ts:240-255`,
  `SELECT cg.id, cg.name, cg.course_id, c.name FROM "CourseGroups" cg JOIN
  "Courses" c ON c.id = cg.course_id WHERE c.owner_id = $1`) et
  `PlatonService.getUserIdsByGroup` (`platon.service.ts:226-235`,
  `SELECT cgm.user_id FROM "CourseGroupsMember" cgm JOIN "CourseGroups" cg ON
  cg.group_id = cgm.group_id WHERE cg.id = $1`).
- **`core/services/user.service.ts`** : `getUserById(id)` (L21-23 →
  `GET /api/users/:id`). **Utilisé** par `sidebar.component.ts:48` et
  `toolbar.component.ts:40` (`await this.userService.getUserById(this.USER_ID).toPromise()`)
  → `users.controller.ts:9-26` `getUserById` →
  `PlatonService.getUserById` (`platon.service.ts:113-134`,
  `SELECT id, username, first_name, last_name, active, role, email,
  last_login, first_login, created_at, updated_at, discord_id, last_activity
  FROM "Users" WHERE id = $1`). Si absent → `{ success: false, message:
  'Utilisateur non trouvé' }` (HTTP 200, pas de 404). Sinon projection
  camelCase sans exposer les champs sensibles (`active`, `*_login`,
  `*_at`, `discord_id`, `last_activity`).
- **`core/services/indicator-event.service.ts`** : voir I.4 — utilisé par
  l'intercepteur global mais ses cibles (`/exercises`, `/sessions`) ne sont
  pas exposées par ce microservice.

---

## Annexe — Tables et entités référencées

### Tables PLaTon (connexion `'platon'`, lecture seule)

`Courses`, `CourseMembers`, `CourseGroups`, `CourseGroupsMember`,
`CourseSections`, `Activities`, `Resources`, `Sessions`, `SessionData`,
`Users`.

### Entités/tables `indicators` (connexion `'indicators'`, lecture/écriture)

| Entité | Table | Écrite par |
|---|---|---|
| `IndicatorDefinition` | `indicator_definitions` | `create`/`update`/`toggleStatus`/`delete` (E.1), `incrementUsageCount`/`decrementUsageCount` (D), `rollbackFormula` (E.4) |
| `IndicatorValue` | `indicator_values` | `computeView` (B.2), `calculateAndStoreValue` (D.1), `recalculate` (E.3), `processIndicatorUpdate` (I.3), `saveIndicatorValue` legacy (J.1) |
| `IndicatorFormulaVersion` | `indicator_formula_versions` | `saveFormulaVersion` lors de `create`/`update` (E.1) ; lue par `getFormulaHistory`/`rollbackFormula` (E.4) |
| `IndicatorExecutionLog` | `indicator_execution_logs` | écrite à l'intérieur de `interpret()` (B.2 étape 9, E.3, F.3) si `context.indicatorId` fourni ; lue par `getExecutionLogs` (E.5) |
| `IndicatorSnapshot` | `indicator_snapshots` | CRUD F.2, lue/rafraîchie par `refreshSnapshots` (F.3) |
| `UserIndicatorPreference` | `user_indicator_preferences` | CRUD D |

---

Voir aussi `readme.md` (architecture, modèle de données, moteur DSL, sécurité)
et `guide.md` (parcours pas-à-pas pour créer/tester chaque type
d'indicateur).
