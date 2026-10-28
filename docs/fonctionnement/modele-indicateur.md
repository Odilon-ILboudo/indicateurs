# Modèle d'un indicateur : contexte, visualisations, familles, visibilité

Comment un indicateur est décrit (un contexte, une formule, plusieurs visualisations), regroupé en famille, et qui peut le voir.

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

## Sélection de la visualisation par l'utilisateur, enregistrée en BDD

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

## Modal d'édition de la carte (`IndicatorConfigModalComponent`)

Le bouton crayon de chaque carte ouvre `IndicatorConfigModalComponent` via
`NzModalService.create()`. Les données sont transmises par
`ModalDataService.setData()` (service partagé), lu dans le `ngOnInit` de la
fenêtre.

La fenêtre permet de **cocher ou décocher les visualisations visibles** (au
moins une : la dernière cochée ne peut pas être décochée). La sélection est
enregistrée dans `user_indicator_preferences.enabled_viz_ids` via
`IndicatorService.setEnabledVizIds()`.

## Masquage de visualisations : `enabledVizIds`

L'utilisateur peut ainsi masquer certaines visualisations d'un indicateur
(`user_indicator_preferences.enabled_viz_ids`, `null` = toutes visibles). La
carte passe par un getter `visibleVisualizations` (filtre `isVizEnabled`, et
retour à toutes les visualisations si le filtre n'en laissait aucune) au lieu
de lire directement `indicator.visualizations`.

## Wizard admin (`indicator-builder.component.ts`) : 3 étapes

| Étape | Contenu |
|---|---|
| 1. Définition | Nom, description, aide à l'analyse (`interpretationHint`) |
| 2. Contexte | `contextType` unique, liste de visualisations (type, couleur, unité), **seuils de performance** (`good`, `warning`, `critical`, optionnels) |
| 3. Formules | Pipeline DSL **unique, partagé par toutes les visualisations** (mode Visuel ou Import), « Tester » et « Déboguer pas à pas », restriction de visibilité (contextes `course` et `activity` seulement), événements déclencheurs (`requiredEvents`) |

**Principe clé** : 1 indicateur = 1 formule. Les visualisations diffèrent uniquement par leur rendu, jamais par les données calculées. À l'enregistrement, `submit()` sauvegarde la formule au niveau de l'indicateur.

`FORMULA_RECIPES` fournit des recettes prêtes à l'emploi : Tentatives avant
réussite, Note moyenne, Exercices réussis, Notes moyennes par ressource (avec
un `join` sur `Resources`), Tentatives par étudiant (groupe).

## Familles (`familyName`)

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

## Visibilité par rôle (`RoleService.canSeeIndicatorContext`)

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

## Comment changer de rôle pour tester

Il n'existe aucun mécanisme de simulation de rôle côté frontend. Pour tester
sous un rôle donné, il faut se connecter avec un compte qui a ce rôle, puis se
déconnecter et se reconnecter avec un autre compte pour en changer. Hors
production, la page de connexion propose aussi un formulaire de connexion
locale, qui s'authentifie auprès d'un PLaTon lancé en local ([securite.md](../architecture/securite.md)).

## Indicateurs personnels : `learner`, `teacher`, `admin`

Les six `contextType` se répartissent en deux familles.

| Famille | Types | Lié à | Où il s'affiche |
|---|---|---|---|
| Objet de PLaTon | `course`, `activity`, `group` | un cours, une activité, un groupe | la page de ce cours ou de cette activité |
| Personne | `learner`, `teacher`, `admin` | l'utilisateur lui-même | son tableau de bord |

Un indicateur `teacher` ou `admin` se comporte exactement comme un indicateur
`learner` : il décrit une personne, son `contextId` est l'identifiant de cette
personne (`userId`), et sa valeur s'affiche dans le tableau de bord de cette
personne. Il n'y a pas de « page d'un enseignant » ou « page d'un
administrateur », comme il y a une page de cours.

Exemples : `learner`, « ma note moyenne », vue par l'étudiant ; `teacher`, « le
nombre moyen de tentatives dans mes cours », vu par l'enseignant ; `admin`, une
statistique globale, vue par l'administrateur.

Quand un événement arrive, la valeur d'un indicateur `teacher` est recalculée
pour le **propriétaire du cours** de l'événement (`Courses.owner_id`). Un membre
`teacher` du cours qui n'en est pas le propriétaire n'est pas recalculé
automatiquement : voir [limites-connues.md](../architecture/limites-connues.md).
