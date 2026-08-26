# Calcul différentiel et recalcul total - Documentation technique

Ce document explique en détail comment le système calcule la valeur d'un indicateur lorsqu'un événement PLaTon arrive (ex : un étudiant répond à un exercice). Il couvre les deux modes : **calcul différentiel** (mise à jour partielle, sans SQL) et **recalcul total** (pipeline DSL complet depuis la base de données).

---

## 1. Contexte : pourquoi deux modes ?

Chaque fois qu'un étudiant répond à un exercice, un événement est ingéré. Pour chaque indicateur actif concerné par cet événement, le système doit mettre à jour la valeur calculée.

La façon naïve : **réexécuter tout le pipeline DSL** à chaque événement.

```
fetch(SessionData) → filter → extract → aggregate   → SQL sur toutes les sessions
```

Pour 100 étudiants × 10 exercices = 1 000 sessions, chaque réponse d'étudiant déclencherait une requête SQL qui lit toutes les 1 000 lignes. Avec 10 indicateurs actifs = 10 000 lignes lues par événement.

La solution : **mémoriser l'état intermédiaire** entre deux événements. Quand une nouvelle session arrive, on met à jour uniquement la session concernée en mémoire, et on recalcule l'agrégat sur ce petit dictionnaire - **zéro SQL**.

---

## 2. Vue d'ensemble du flux

```
Étudiant répond
       │
       ▼
RabbitMQ → IngestionService.ingestForContext() / processAggregateIndicator()
       │
       ▼
       IndicatorsService.computeViewIncremental()
       │
       ├─ getIncrementalShape(formula)   ← analyse le pipeline DSL
       │
       ├─ [shape connue + état en BDD] → CALCUL DIFFÉRENTIEL  (0 SQL)
       │
       └─ [sinon]                       → RECALCUL TOTAL      (SQL complet)
              │
              └─ résultat stocké dans indicator_values
                 + état intermédiaire stocké dans indicator_values.metadata
```

---

## 3. Le pipeline DSL

Un indicateur est défini par un pipeline d'étapes. Exemple :

```yaml
pipeline:
  - type: fetch
    params: { table: SessionData, contextFields: [user_id, activity_id] }
  - type: filter
    params: { field: grade, operator: ">", value: 0 }
  - type: groupBy
    params: { groupField: resource_id }
  - type: findFirst
    params: { sortField: grade }
  - type: extract
    params: { extractField: grade }
  - type: aggregate
    params: { aggregateFn: avg }
  - type: round
    params: { decimals: 1 }
```

Chaque étape reçoit la sortie de la précédente. La **frontière critique** est l'étape `extract` :

- **Avant `extract`** : les données sont des **rows** (objets avec tous les champs de SessionData)
- **Après `extract`** : les données sont des **nombres** (`number[]` ou scalaire)

Cette frontière détermine ce qui peut être mis en cache et ce qui ne peut pas l'être.

---

## 4. Détection de la forme incrémentable - `getIncrementalShape`

**Fichier** : `api/src/modules/features/indicators/interpreter/formula-interpreter.service.ts`

La méthode `getIncrementalShape(formula)` analyse le pipeline et retourne un objet `IncrementalShape` si le pipeline est éligible au calcul différentiel, ou `null` sinon.

### Forme acceptée (ordre strict)

```
fetch(SessionData, contextFields ∋ user_id)
  [join]*         ← 0 ou plusieurs
  [filter]*       ← 0 ou plusieurs
  [groupBy]       ← optionnel
  [findFirst]     ← optionnel
  extract
  aggregate(avg|sum|count|min|max)
  [round|divide|js]*   ← 0 ou plusieurs, dans n'importe quel ordre
```

### Forme rejetée (retourne `null`)

- Pipeline qui ne commence pas par `fetch(SessionData)`
- `fetch` sans `user_id` dans `contextFields`
- `js` **avant** `extract` (opère sur des rows qu'on ne cache pas)
- Absence de `aggregate` ou plus d'un `aggregate`
- Toute étape non reconnue après `extract` (autre que `aggregate`, `round`, `divide`, `js`)

### L'objet `IncrementalShape`

```typescript
interface IncrementalShape {
  extractField: string;          // champ extrait (ex: "grade")
  postSteps: FormulaStep[];      // étapes après extract : aggregate, round, divide, js
  filterSteps: FormulaStep[];    // les filtres à réévaluer sur chaque event
  joinSteps: FormulaStep[];      // les joins à ré-appliquer si nécessaire
  needsTargetedFetch: boolean;   // true si joinSteps.length > 0
  groupByField?: string;         // champ de groupement (ex: "resource_id")
  findFirst?: {                  // spec findFirst si présent
    sortField?: string;
    whereField?: string;
    whereValue?: any;
  };
}
```

---

## 5. Les 4 structures de métadonnées

Selon la forme du pipeline, un état intermédiaire différent est stocké dans la colonne `metadata` de la table `indicator_values` (sous la clé `incremental`). Ces 4 structures sont **mutuellement exclusives** - une seule est présente à la fois.

### 5.1 `rowValues` - pipeline sans groupBy ni findFirst

**Exemple de pipeline** : `fetch → [filter*] → extract → aggregate`

```json
{
  "incremental": {
    "rowValues": {
      "session-uuid-1": 80,
      "session-uuid-2": 60,
      "session-uuid-3": 45
    }
  }
}
```

Chaque clé est un `sessionId`, chaque valeur est la valeur extraite (`row[extractField]`).

**Sur événement** : on met à jour `rowValues[sessionId] = nouvValeur`, puis `aggregate(Object.values(rowValues))`.

---

### 5.2 `groupRowValues` - pipeline avec groupBy, sans findFirst

**Exemple de pipeline** : `fetch → [filter*] → groupBy(resource_id) → extract → aggregate`

```json
{
  "incremental": {
    "groupRowValues": {
      "resource-uuid-A": {
        "session-1": 80,
        "session-3": 60
      },
      "resource-uuid-B": {
        "session-2": 75,
        "session-4": 45
      }
    }
  }
}
```

**Sur événement pour session-1** (qui appartient au groupe `resource-uuid-A`) :
1. `groupRowValues["resource-uuid-A"]["session-1"] = nouvValeur`
2. `allValues = flatMap(groupRowValues, g => values(g))` → `[nouvValeur, 60, 75, 45]`
3. `aggregate(allValues)` → résultat final

Seule la copie du groupe `resource-uuid-A` est nécessaire - les autres groupes sont inchangés.

---

### 5.3 `candidateRows` - pipeline avec findFirst, sans groupBy

**Exemple de pipeline** : `fetch → [filter*] → findFirst(sortField: grade) → extract → aggregate`

```json
{
  "incremental": {
    "candidateRows": {
      "session-1": { "sortValue": 80, "extractedValue": 80, "passes": true },
      "session-2": { "sortValue": 45, "extractedValue": 45, "passes": true },
      "session-3": { "sortValue": 60, "extractedValue": 60, "passes": false }
    }
  }
}
```

Chaque entrée contient :
- `sortValue` : valeur du champ de tri (ex: `grade`) - pour trouver le "premier"
- `extractedValue` : valeur à extraire après findFirst
- `passes` : `true` si la ligne satisfait la condition `whereField == whereValue` (ou toujours `true` si pas de condition)

**Sur événement pour session-2** (nouvelle note = 90) :
1. `candidateRows["session-2"] = { sortValue: 90, extractedValue: 90, passes: true }`
2. **Trouver le gagnant** : scan O(n) de toutes les entrées où `passes = true`, trier par `sortValue` ascending, prendre le premier → `session-2` (sortValue = 90... wait, ascending = session-1 avec 80 serait premier)
   - Exemple avec ascending : session-1 (80) est le premier → `winner = 80`
3. `applyPostSteps([80], postSteps)` → résultat

**Note** : le "premier" est le **minimum** du `sortField` (tri ascending). Pour le maximum, les utilisateurs doivent adapter leur pipeline.

---

### 5.4 `groupCandidateRows` - pipeline avec groupBy ET findFirst

**Exemple de pipeline** : `fetch → [filter*] → groupBy(resource_id) → findFirst(sortField: grade) → extract → aggregate`

```json
{
  "incremental": {
    "groupCandidateRows": {
      "resource-uuid-A": {
        "session-1": { "sortValue": 80, "extractedValue": 80, "passes": true },
        "session-3": { "sortValue": 60, "extractedValue": 60, "passes": true }
      },
      "resource-uuid-B": {
        "session-2": { "sortValue": 75, "extractedValue": 75, "passes": true }
      }
    }
  }
}
```

**Sur événement pour session-1** (groupe `resource-uuid-A`, nouvelle note = 50) :
1. `groupCandidateRows["resource-uuid-A"]["session-1"] = { sortValue: 50, extractedValue: 50, passes: true }`
2. **Gagnant groupe A** : scan de `resource-uuid-A` → min sortValue = session-1 (50) → `winner_A = 50`
3. **Gagnant groupe B** : scan de `resource-uuid-B` → session-2 (75) → `winner_B = 75`
4. `applyPostSteps([50, 75], postSteps)` → `avg([50, 75]) = 62.5`

---

## 6. La méthode `applyPostSteps` - post-traitement asynchrone

**Fichier** : `formula-interpreter.service.ts`

```typescript
async applyPostSteps(values: number[], postSteps: FormulaStep[]): Promise<number>
```

Applique en séquence toutes les étapes qui viennent après `extract`. Les étapes supportées :

| Type | Entrée | Sortie | Description |
|---|---|---|---|
| `aggregate` | `number[]` | `number` | avg / sum / count / min / max |
| `round` | `number` | `number` | arrondi à N décimales |
| `divide` | `number` | `number` | divise par une constante |
| `js` | `number[]` ou `number` | `number` | code JS arbitraire dans isolate V8 |

### Pourquoi `js` est autorisé ici

Le `js` après `extract` ne reçoit que des nombres - il n'a pas besoin des rows SessionData. Il s'exécute dans un isolate V8 (sans accès à la BDD) et transforme le résultat numérique. Donc : **0 SQL supplémentaire**, compatible avec le calcul différentiel.

---

## 7. Les chemins dans `computeViewIncremental`

**Fichier** : `api/src/modules/features/indicators/indicators.service.ts`

Cette méthode est appelée pour chaque couple `(indicateur, événement)`, depuis
`IngestionService.ingestForContext()`/`processAggregateIndicator()`. Elle
décide quel chemin emprunter.

```
computeViewIncremental(indicator, event)
        │
        ├─ 1. getIncrementalShape(formula) → shape ou null
        │
        ├─ shape?.findFirst ?
        │      ├─ OUI → Chemin findFirst (§7.3)
        │      │
        │      ├─ shape?.groupByField ?
        │      │      └─ OUI → groupCandidateRows
        │      │      └─ NON → candidateRows
        │      │
        │      └─ Fallback : computeWithCandidateRows (SQL complet)
        │
        ├─ shape?.groupByField ?
        │      └─ OUI → Chemin groupBy (§7.2)
        │             ├─ existingGroupRowValues en BDD ? → incrémental
        │             └─ sinon → computeWithGroupRowMap (SQL complet)
        │
        └─ else → Chemin rowValues (§7.1) ou SQL complet (§7.4)
```

### 7.1 Chemin `rowValues` (le plus simple)

**Condition** : shape connue, pas de `groupBy`, pas de `findFirst`, `existingRowValues` présent en BDD, `event.sessionId` présent.

Trois sous-chemins selon les étapes du pipeline :

#### Sous-chemin A : pas de join, pas de filter (0 SQL)

```
event.payload["grade"] = 85
rowValues["session-42"] = 85
newValue = applyPostSteps(Object.values(rowValues), postSteps)
```

#### Sous-chemin B : filter sans join (0 SQL)

```
évalue filter(grade > 0) sur event.payload :
  → passe : rowValues["session-42"] = event.payload["grade"]
  → échoue : delete rowValues["session-42"]
newValue = applyPostSteps(Object.values(rowValues), postSteps)
```

#### Sous-chemin C : join (1 SQL ciblé)

```
fetchSingleSessionRow("session-42", context, shape)
  → 1 SELECT WHERE id = "session-42" + joins en mémoire
  → évalue filter sur la row obtenue
  → met à jour ou supprime rowValues["session-42"]
newValue = applyPostSteps(Object.values(rowValues), postSteps)
```

### 7.2 Chemin `groupRowValues`

**Condition** : `shape.groupByField` présent, pas de `findFirst`, `existingGroupRowValues` en BDD.

```
sourceRow = event.payload (ou row fetchée si join)
groupKey = sourceRow["resource_id"]   // ex: "resource-uuid-A"

groupRowValues["resource-uuid-A"]["session-42"] = sourceRow["grade"]

allValues = flatMap(groupRowValues, g => values(g))
newValue = applyPostSteps(allValues, postSteps)
```

Si le filtre échoue : `delete groupRowValues[groupKey]["session-42"]`

### 7.3 Chemin `candidateRows` / `groupCandidateRows`

**Condition** : `shape.findFirst` présent.

```
sourceRow = event.payload (ou row fetchée si join)
entry = {
  sortValue: sourceRow["grade"],      // champ de tri
  extractedValue: sourceRow["grade"], // champ extrait
  passes: true                        // condition whereField == whereValue
}

// Sans groupBy :
candidateRows["session-42"] = entry
newValue = computeResultFromCandidates(candidateRows, shape)
  → findCandidateWinner : scan O(n), tri par sortValue, premier qui passes=true
  → applyPostSteps([winner], postSteps)

// Avec groupBy :
groupCandidateRows["resource-uuid-A"]["session-42"] = entry
newValue = computeResultFromGroupCandidates(groupCandidateRows, shape)
  → pour chaque groupe : findCandidateWinner → un gagnant par groupe
  → applyPostSteps([winner_A, winner_B, ...], postSteps)
```

### 7.4 Recalcul total (fallback)

**Déclencheurs** :
- `shape = null` (pipeline non incrémentable : `js` avant `extract`, pipeline inconnu)
- Aucune métadonnée existante en BDD pour cet `(indicatorId, contextType, contextId)` = **premier événement**
- `event.sessionId` absent
- Valeur non extractible du payload

**Ce qui se passe** :

```
shape != null → computeWithRowMap / computeWithGroupRowMap / computeWithCandidateRows
  → fetch SQL complet depuis SessionData
  → applique joins, filters, groupBy, findFirst en mémoire
  → construit rowValues / groupRowValues / candidateRows / groupCandidateRows
  → stocke l'état en BDD pour les prochains événements

shape = null → interpret(formula, context)
  → exécute le pipeline DSL étape par étape depuis zéro
  → aucun état stocké (pas de calcul différentiel possible)
```

**Important** : le premier événement déclenche toujours un recalcul total. C'est ce recalcul qui initialise l'état intermédiaire en BDD, permettant aux événements suivants d'être différentiels.

---

## 8. Stockage de l'état et de la valeur

**Table** : `indicator_values`

| Colonne | Contenu |
|---|---|
| `indicatorId` | ID de l'indicateur |
| `contextType` | `'learner'` (ou `'course'`, `'group'`, etc.) |
| `contextId` | `userId` pour learner, `courseId:activityId` pour course/group |
| `value` | La valeur scalaire calculée (ex: `82.5`) |
| `metadata` | JSONB : `{ incremental: { rowValues/groupRowValues/... }, structuredValue? }` |

À chaque mise à jour, on fait un `UPSERT` sur `(indicatorId, contextType, contextId)`.

### Pourquoi stocker dans JSONB et non dans une table dédiée ?

- Évite une table supplémentaire avec ses propres index et contraintes
- L'état intermédiaire est toujours lié à exactement 1 ligne `indicator_values`
- Lecture atomique : on lit valeur + état en 1 seule requête

### Coût du JSONB vs coût SQL

À chaque événement incrémental :
- **Lecture** : 1 SELECT pour récupérer `indicator_values` (valeur + metadata)
- **Écriture** : 1 UPSERT (valeur mise à jour + metadata mise à jour)
- **SQL PLaTon** : 0 (sauf si `needsTargetedFetch = true` → 1 SELECT ciblé sur 1 ligne)

vs recalcul total :
- **SQL PLaTon** : 1 SELECT sur toutes les sessions (potentiellement des centaines de lignes + JOINs)

---

## 9. Invalidation et recalcul forcé

Le calcul différentiel n'est **jamais** utilisé dans ces cas :

| Cas | Mécanisme |
|---|---|
| Admin clique "Recalculer" | `POST /indicators/:id/recalculate` → `computeView(forceRefresh=true)` |
| `computeView(forceRefresh=true)` | ignore le cache, recalcule depuis zéro via le chemin SQL complet correspondant (`computeWithRowMap`/`computeWithGroupRowMap`/`computeWithCandidateRows` si le pipeline est incrémentable, `interpret()` générique sinon), écrase le JSONB |
| `refreshSnapshots` (refresh d'un snapshot épinglé) | passe `deltaEvent` → tente différentiel, sinon `computeView(forceRefresh=true)` |
| `refreshActivityViews` (toutes les vues cachées d'une activité) | idem |

---

## 10. Ce qui reste irréductible (non incrémentable)

| Étape | Position dans le pipeline | Raison |
|---|---|---|
| `js` avant `extract` | Opère sur des rows entières | Les rows ne sont pas cachées (trop volumineuses pour JSONB) |

Tout le reste est maintenant incrémentable :
- `groupBy` → `groupRowValues` (mise à jour du groupe touché uniquement)
- `findFirst` → `candidateRows` / `groupCandidateRows` (scan O(n) sans SQL)
- `js` après `extract` → `postSteps` asynchrones (0 SQL, juste CPU dans l'isolate V8)
- `filter`, `join`, `round`, `divide` → déjà pris en charge

---

## 11. Exemple complet bout en bout

**Indicateur** : "Note moyenne au premier essai par exercice, pour les sessions complétées"

**Pipeline** :
```yaml
fetch(SessionData, [user_id, activity_id])
→ filter(grade > 0)
→ groupBy(resource_id)
→ findFirst(sortField: created_at)   # première tentative = plus ancienne
→ extract(grade)
→ aggregate(avg)
→ round(decimals: 1)
```

**Métadonnée stockée** : `groupCandidateRows`

**Événement** : étudiant `U1` répond à l'exercice `E2` (session `S5`), note = 78, `created_at = "2026-06-01T10:00:00"`

**État avant** :
```json
{
  "E1": {
    "S1": { "sortValue": "2026-05-30T09:00:00", "extractedValue": 90, "passes": true },
    "S2": { "sortValue": "2026-05-31T14:00:00", "extractedValue": 55, "passes": true }
  },
  "E2": {
    "S3": { "sortValue": "2026-05-30T11:00:00", "extractedValue": 70, "passes": true },
    "S4": { "sortValue": "2026-05-30T15:00:00", "extractedValue": 80, "passes": true }
  }
}
```

**Étape 1** : `passesFilter(grade > 0, { grade: 78 })` → `true`

**Étape 2** : ajout de S5 dans le groupe E2
```json
"E2": {
  "S3": { "sortValue": "2026-05-30T11:00:00", "extractedValue": 70, "passes": true },
  "S4": { "sortValue": "2026-05-30T15:00:00", "extractedValue": 80, "passes": true },
  "S5": { "sortValue": "2026-06-01T10:00:00", "extractedValue": 78, "passes": true }
}
```

**Étape 3** : trouver le gagnant de chaque groupe (tri ascending par `created_at`)
- E1 → S1 (`2026-05-30T09:00:00`) → `extractedValue = 90`
- E2 → S3 (`2026-05-30T11:00:00`) → `extractedValue = 70`

**Étape 4** : `applyPostSteps([90, 70], [aggregate(avg), round(1)])`
- `avg([90, 70]) = 80`
- `round(80, 1) = 80.0`

**Résultat** : `80.0` - **0 SQL PLaTon**, 1 UPSERT `indicator_values`

---

## 12. Fichiers concernés

| Fichier | Rôle |
|---|---|
| `interpreter/formula-interpreter.service.ts` | Analyse le pipeline (`getIncrementalShape`), calculs complets (`computeWithRowMap` etc.), calcul des résultats depuis l'état (`computeResultFrom*`), `applyPostSteps` async |
| `ingestion/ingestion.service.ts` | Reçoit l'événement (`ingestForContext`/`processAggregateIndicator`) et appelle `computeViewIncremental` avec le bon contexte selon le `contextType` |
| `indicators/indicators.service.ts` | `computeView` (calcul à la demande), `computeViewIncremental` (orchestre la décision différentiel vs total pour chaque événement), `recalculate` (recalcul périodique/manuel) |
| `indicators/entities/indicator-value.entity.ts` | Table `indicator_values` qui stocke valeur + métadonnées |
