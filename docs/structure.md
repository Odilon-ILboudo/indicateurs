# Structure d'un indicateur

Ce document détaille l'anatomie d'un **indicateur** (`IndicatorDefinition`) : ce
qu'il contient, comment lire sa définition JSON, et pourquoi on peut le décrire
comme une **ressource réutilisable**. Pour le moteur qui exécute les formules et
le modèle Option B+, voir [`readme.md`](../readme.md) §6 et §7.

---

## 1. Un indicateur = une ressource réutilisable

Une `IndicatorDefinition` est créée **une seule fois** (nom, pipeline DSL,
visualisations, seuils) mais sert de base à plusieurs formes de réutilisation :

1. **Définition unique → N valeurs calculées**
   La formule est paramétrée par un `FormulaContext` (`userId`, `courseId`,
   `groupId`, `activityId`). Le même pipeline est exécuté pour chaque
   utilisateur/groupe/activité concerné, produisant une ligne `indicator_values`
   distincte par `(contextType, contextId)` - sans dupliquer la formule.

2. **Réutilisation par utilisateur (préférences)**
   Chaque utilisateur active/désactive l'indicateur indépendamment, choisit sa
   visualisation préférée (`activeVizId`) et masque celles qu'il ne veut pas
   (`enabledVizIds`) - la ressource est unique, sa présentation est
   personnalisée par consommateur (`UserIndicatorPreference`).

3. **Réutilisation comme template (recettes)**
   `FORMULA_RECIPES` (dans le builder) sont des pipelines prêts à l'emploi,
   copiés pour démarrer un nouvel indicateur - réutilisation au sens "patron",
   pas instance partagée.

4. **Réutilisation au sein d'un cercle**
   Plusieurs indicateurs partageant un `circleName` réutilisent la même *idée
   métier* (souvent un pipeline très similaire), chacun adapté à un
   `contextType` cible - réutilisation conceptuelle plus que technique.

**Limite importante** : il n'y a **pas de composition/imbrication**. Un pipeline
ne peut pas référencer la sortie d'un autre indicateur - chaque `formula` est
autonome. "Ressource réutilisable" est donc vrai au sens *définition unique →
calculs multiples par contexte*, pas au sens *brique composable dans d'autres
indicateurs*.

---

## 2. Anatomie complète (exemple annoté)

```jsonc
{
  "id": "uuid",
  "name": "Tentatives avant réussite",
  "description": "Nombre moyen de tentatives avant la première note de 100",

  // Le contexte unique de cet indicateur - détermine QUI le voit et
  // comment son contextId est construit (voir readme.md §7-8)
  "contextType": "learner",   // learner | teacher | admin | course | activity | group

  // Optionnel - relie cet indicateur à ses "sœurs" du même thème mais
  // scopées à d'autres contextType. Voir readme.md §8.
  "circleName": "Tentatives avant réussite",

  // Événements PLaTon qui déclenchent un recalcul / refresh
  "requiredEvents": ["exercise.answered"],

  "isActive": true,
  "usageCount": 12,

  // Seuils de performance globaux (optionnel) - partagés par toutes les visualisations.
  // good  : valeur ≤ good    → vert
  // warning : valeur ≤ warning → orange
  // Difficile (rouge) = valeur > warning, déduit automatiquement.
  "thresholds": { "good": 2, "warning": 4 },

  // Aide à l'analyse (optionnel) - affiché dans le panneau latéral de la page détail.
  "interpretationHint": "Un résultat élevé signifie que l'étudiant a eu du mal à réussir.",

  // Formule unique partagée par TOUTES les visualisations (1 indicateur = 1 formule).
  // Voir readme.md §6 pour le catalogue des 10 types d'étapes.
  "formula": {
    "version": "1.0",
    "pipeline": [
      { "type": "fetch",     "label": "Charger sessions",     "params": { "table": "SessionData", "contextFields": ["user_id","activity_id"] } },
      { "type": "filter",    "label": "Sessions réussies",    "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
      { "type": "extract",   "label": "Tentatives avant réussite", "params": { "extractField": "attempts_at_success" } },
      { "type": "aggregate", "label": "Moyenne",              "params": { "aggregateFn": "avg" } },
      { "type": "round",     "label": "Arrondir",             "params": { "decimals": 2 } }
    ]
  },

  // 1 à N visualisations - représentations visuelles différentes du même résultat.
  // Elles ne contiennent PAS de formule propre ni de seuils (tout est au-dessus).
  "visualizations": [
    {
      "id": "uuid-viz-1",
      "label": "Vue carte",
      "type": "card",   // card | gauge | line-chart | bar-chart | histogram
      "icon": "repeat",
      "color": "#1890ff",
      "unit": "tentatives"
    },
    {
      "id": "uuid-viz-2",
      "label": "Vue jauge",
      "type": "gauge",
      "icon": "speed",
      "color": "#1890ff",
      "unit": "tentatives"
    }
  ]
}
```

---

## 3. Détail des champs

| Champ | Description |
|---|---|
| `id` | UUID, généré à la création. |
| `name` | Nom affiché, unique. |
| `description` | Texte libre, affiché en infobulle/aide. |
| `contextType` | Le contexte auquel appartient l'indicateur - fixe pour toute sa durée de vie. Détermine `contextId` lors du calcul (`userId` pour `learner`, `courseId`/`groupId`/`activityId` pour les autres) et qui peut le voir (table de visibilité, readme §8). |
| `circleName` | `null` ou nom partagé par d'autres indicateurs traitant du même thème sous un autre `contextType`. Sert uniquement à l'affichage groupé (repliable) côté admin/sélecteur - aucun lien technique entre les membres d'un cercle. |
| `requiredEvents` | Liste d'événements PLaTon (`exercise.answered`, …) qui, lors de l'ingestion, déclenchent un recalcul de la valeur `learner` et un `refreshSnapshots()` des snapshots de groupe liés à l'activité concernée. Le wizard ne propose que les événements **configurés et installés** (voir readme.md §6bis, `event-rules`) - impossible d'y saisir une valeur libre. |
| `isActive` | Indicateur visible/calculable ou désactivé globalement. |
| `usageCount` | Compteur d'utilisation (nombre d'utilisateurs l'ayant activé). |
| `formula` | **Formule unique partagée par toutes les visualisations** - pipeline DSL (1 indicateur = 1 formule). |
| `thresholds` | `{ good?: number; warning?: number }` - seuils globaux optionnels : ≤ good = vert, ≤ warning = orange, > warning = rouge. Affectent la couleur de la valeur (card) et la légende du panneau latéral. |
| `interpretationHint` | Texte libre optionnel affiché dans le panneau latéral de la page détail pour guider l'interprétation des résultats. |
| `visualizations[]` | Voir ci-dessous - au moins une, généralement la première = vue par défaut. |

### Champs d'une `IndicatorVisualization`

| Champ | Description |
|---|---|
| `id` | UUID stable, généré à la création dans le builder - sert de clé pour `activeVizId`/`enabledVizIds`. |
| `label` | Libellé affiché (chip, onglet). |
| `type` | `card` (valeur scalaire), `gauge`, `line-chart`, `bar-chart` (résultat objet `{clé: valeur}`), `histogram` (résultat tableau `[{bucket, count, users?}]`). |
| `icon`, `color` | Apparence. |
| `unit` | Unité affichée à côté de la valeur (ex: "tentatives", "%"). |

> **Note** : les visualisations ne portent pas de formule propre ni de seuils. Ces champs sont au niveau de `IndicatorDefinition` et s'appliquent à toutes les vues.

---

## 4. Cycle de vie d'un indicateur

| Étape | Où |
|---|---|
| Création / édition | Wizard 3 étapes (`indicator-builder.component.ts`) → `POST`/`PATCH /indicators` |
| Activation par un utilisateur | `POST /preferences/:indicatorId?userId=` → `user_indicator_preferences` |
| Calcul d'une valeur | `computeView`/`recalculate` → ligne `indicator_values` (une par `contextId`/`vizId`) |
| Log d'exécution | Chaque exécution de pipeline → `indicator_execution_logs` |
| "Carte épinglée" pour un groupe | `POST /indicators/:id/snapshots` → `indicator_snapshots` (refreshé automatiquement à chaque ingestion d'événement) |

---

## Pour aller plus loin

- [`readme.md`](../readme.md) §5 - schéma complet des 5 entités (`indicator_definitions`,
  `indicator_values`, `indicator_execution_logs`,
  `indicator_snapshots`, `user_indicator_preferences`)
- [`readme.md`](../readme.md) §6 - moteur DSL : catalogue des 10 types d'étapes,
  `computeView`, snapshots vivants
- [`readme.md`](../readme.md) §7 - modèle Option B+ (`contextType` + `visualizations[]`),
  sélection de viz par l'utilisateur
- [`readme.md`](../readme.md) §8 - cercles d'indicateurs et visibilité par rôle
