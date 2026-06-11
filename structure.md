# Structure d'un indicateur

Ce document détaille l'anatomie d'un **indicateur** (`IndicatorDefinition`) : ce
qu'il contient, comment lire sa définition JSON, et pourquoi on peut le décrire
comme une **ressource réutilisable**. Pour le moteur qui exécute les formules et
le modèle Option B+, voir [`readme.md`](readme.md) §6 et §7.

---

## 1. Un indicateur = une ressource réutilisable

Une `IndicatorDefinition` est créée **une seule fois** (nom, pipeline DSL,
visualisations, seuils) mais sert de base à plusieurs formes de réutilisation :

1. **Définition unique → N valeurs calculées**
   La formule est paramétrée par un `FormulaContext` (`userId`, `courseId`,
   `groupId`, `activityId`). Le même pipeline est exécuté pour chaque
   utilisateur/groupe/activité concerné, produisant une ligne `indicator_values`
   distincte par `(contextType, contextId)` — sans dupliquer la formule.

2. **Réutilisation par utilisateur (préférences)**
   Chaque utilisateur active/désactive l'indicateur indépendamment, choisit sa
   visualisation préférée (`activeVizId`) et masque celles qu'il ne veut pas
   (`enabledVizIds`) — la ressource est unique, sa présentation est
   personnalisée par consommateur (`UserIndicatorPreference`).

3. **Réutilisation comme template (recettes)**
   `FORMULA_RECIPES` (dans le builder) sont des pipelines prêts à l'emploi,
   copiés pour démarrer un nouvel indicateur — réutilisation au sens "patron",
   pas instance partagée.

4. **Réutilisation au sein d'une famille**
   Plusieurs indicateurs partageant un `familyName` réutilisent la même *idée
   métier* (souvent un pipeline très similaire), chacun adapté à un
   `contextType` cible — réutilisation conceptuelle plus que technique.

**Limite importante** : il n'y a **pas de composition/imbrication**. Un pipeline
ne peut pas référencer la sortie d'un autre indicateur — chaque `formula` est
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

  // Le contexte unique de cet indicateur — détermine QUI le voit et
  // comment son contextId est construit (voir readme.md §7-8)
  "contextType": "learner",        // learner | teacher | admin | course | activity | group

  // Optionnel — relie cet indicateur à ses "sœurs" du même thème mais
  // scopées à d'autres contextType (ex: la version "course" et "group"
  // de ce même indicateur). Voir readme.md §8.
  "familyName": "Tentatives avant réussite",

  // Événements PLaTon qui déclenchent un recalcul / refresh
  "requiredEvents": ["exercise.answered"],

  "isActive": true,
  "usageCount": 12,

  // Formule "fallback" : utilisée par toute visualisation sans formule propre
  "formula": null,

  // 1 à N visualisations — chacune peut avoir SA PROPRE formule (Option B+)
  "visualizations": [
    {
      "id": "uuid-viz-1",
      "label": "Vue carte",
      "type": "card",              // card | gauge | line-chart | bar-chart | histogram
      "icon": "repeat",
      "color": "#1890ff",

      // Métadonnées d'affichage propres à CETTE visualisation
      "unit": "tentatives",
      "thresholds": { "good": 1, "warning": 3, "danger": 5 },

      // Pipeline DSL — voir readme.md §6 pour le catalogue des 10 types d'étapes
      "formula": {
        "version": "1.0",
        "pipeline": [
          { "type": "fetch",     "label": "Charger sessions",     "params": { "table": "SessionData", "contextFields": ["user_id","activity_id"] } },
          { "type": "groupBy",   "label": "Grouper par exercice", "params": { "groupField": "resource_id" } },
          { "type": "findFirst", "label": "Première réussite",    "params": { "whereField": "grade", "whereValue": 100, "sortField": "created_at" } },
          { "type": "extract",   "label": "Tentatives",           "params": { "extractField": "attempts" } },
          { "type": "aggregate", "label": "Moyenne",              "params": { "aggregateFn": "avg" } },
          { "type": "round",     "label": "Arrondir",             "params": { "decimals": 2 } }
        ]
      }
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
| `contextType` | Le contexte auquel appartient l'indicateur — fixe pour toute sa durée de vie. Détermine `contextId` lors du calcul (`userId` pour `learner`, `courseId`/`groupId`/`activityId` pour les autres) et qui peut le voir (table de visibilité, readme §8). |
| `familyName` | `null` ou nom partagé par d'autres indicateurs traitant du même thème sous un autre `contextType`. Sert uniquement à l'affichage groupé (repliable) côté admin/sélecteur — aucun lien technique entre les membres d'une famille. |
| `requiredEvents` | Liste d'événements PLaTon (`exercise.answered`, …) qui, lors de l'ingestion, déclenchent un recalcul de la valeur `learner` et un `refreshSnapshots()` des snapshots de groupe liés à l'activité concernée. |
| `isActive` | Indicateur visible/calculable ou désactivé globalement. |
| `usageCount` | Compteur d'utilisation (nombre d'utilisateurs l'ayant activé). |
| `formula` | Pipeline DSL "fallback", utilisé par une visualisation dont `formula` est `null` ou a un pipeline vide. |
| `visualizations[]` | Voir ci-dessous — au moins une, généralement la première = vue par défaut. |

### Champs d'une `IndicatorVisualization`

| Champ | Description |
|---|---|
| `id` | UUID stable, généré à la création dans le builder — sert de clé pour `activeVizId`/`enabledVizIds` et pour la clé de cache `indicator_values` (`contextId:vizId`). |
| `label` | Libellé affiché (chip, onglet). |
| `type` | `card` (valeur scalaire), `gauge`, `line-chart`, `bar-chart` (résultat objet `{clé: valeur}`), `histogram` (résultat tableau `[{bucket, count, users?}]`). |
| `icon`, `color` | Apparence. |
| `unit` | Unité affichée à côté de la valeur (ex: "tentatives", "%"). |
| `thresholds` | `{ good, warning, danger }` — bornes utilisées pour colorer la valeur (vert/orange/rouge). |
| `formula` | Pipeline propre à cette visualisation, ou `null`/vide pour utiliser `formula` de l'indicateur. |

---

## 4. Cycle de vie d'un indicateur

| Étape | Où |
|---|---|
| Création / édition | Wizard 3 étapes (`indicator-builder.component.ts`) → `POST`/`PATCH /indicators` |
| Historique des formules | Chaque modification crée une ligne `indicator_formula_versions` (rollback possible) |
| Activation par un utilisateur | `POST /preferences/:indicatorId?userId=` → `user_indicator_preferences` |
| Calcul d'une valeur | `computeView`/`recalculate` → ligne `indicator_values` (une par `contextId`/`vizId`) |
| Log d'exécution | Chaque exécution de pipeline → `indicator_execution_logs` |
| "Carte épinglée" pour un groupe | `POST /indicators/:id/snapshots` → `indicator_snapshots` (refreshé automatiquement à chaque ingestion d'événement) |

---

## Pour aller plus loin

- [`readme.md`](readme.md) §5 — schéma complet des 6 entités (`indicator_definitions`,
  `indicator_values`, `indicator_formula_versions`, `indicator_execution_logs`,
  `indicator_snapshots`, `user_indicator_preferences`)
- [`readme.md`](readme.md) §6 — moteur DSL : catalogue des 10 types d'étapes,
  `computeView`, snapshots vivants
- [`readme.md`](readme.md) §7 — modèle Option B+ (`contextType` + `visualizations[]`),
  sélection de viz par l'utilisateur
- [`readme.md`](readme.md) §8 — familles d'indicateurs et visibilité par rôle
