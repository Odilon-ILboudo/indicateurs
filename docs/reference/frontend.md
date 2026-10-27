# Frontend

Routes, écrans et composants de l'application Angular (`frontend/src/app/`).

## Routing

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
  /courses/...                        : pages Cours (copiées et adaptées de PLaTon)
```

Les pages « Cours » viennent de PLaTon ; leurs dépendances sont remplacées par des stubs locaux (voir [structure.md](../architecture/structure.md#stubs-platon-frontendsrcplaton-stubs)).

## Sidebar

Liens : Tableau de bord, Indicateurs, Cours. Il n'y a pas d'onglet
« Admin » dans la navigation principale : les composants d'administration
(`admin-indicator-manager`, `indicator-builder`) sont accessibles dans l'onglet
« Indicateurs », pour le rôle `admin` seulement (`canCreateIndicators`).

## Point d'entrée embarqué (`<indicateurs-app>`)

Second point d'entrée de build (`ng build indicateurs-embed`, cible
`src/main-embed.ts`), à côté de l'application autonome : sans administration,
sans sidebar ni toolbar (le LMS hôte fournit les siennes), compilé comme
[Web Component](https://developer.mozilla.org/fr/docs/Web/API/Web_components).
Les attributs de la balise, le routage interne et le contrat avec PLaTon sont
décrits dans [integration-indicateurs.md](../platon-integration/integration-indicateurs.md)
et [integration-platon.md](../platon-integration/integration-platon.md).

## `DashboardContext` et navigation par page cours/activité

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

## Familles d'indicateurs : pages dédiées

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

## `IndicatorCardComponent`

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

## Page activité (`/dashboard/courses/:id/activities/:activityId`)

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

## `IndicatorDetailComponent` : filtres de période

Pour les visualisations `line-chart`, un sélecteur de période est affiché :
`7 jours | 30 jours | 90 jours | Tout | Personnalisé`, sous forme de
`nz-radio-group` (`nzButtonStyle="solid"`), 7 jours par défaut. L'option
« Personnalisé » affiche un `nz-range-picker` avec bornes incluses
(00:00 à 23:59). La courbe s'appuie sur `metadata.history` de la valeur.

## Graphiques (`buildIndicatorChartOptions`, `shared/utils/indicator-chart-options.util.ts`)

Utilitaire partagé, appelé par `IndicatorDetailComponent` pour les types
`gauge`, `bar-chart` et `histogram` (le type `line-chart` est construit
directement dans le composant) :

- **bar-chart** : libellés lisibles (par exemple `resource_name`), tronqués à
  25 caractères avec infobulle complète, valeur affichée sur la barre.
- **histogram** : `structuredValue: [{ bucket, count, users?: string[] }]`,
  infobulle qui liste les noms.
