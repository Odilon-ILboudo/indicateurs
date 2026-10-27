# Moteur de formules : calcul des indicateurs

Le service `FormulaInterpreterService` (`api/src/modules/features/indicators/interpreter/formula-interpreter.service.ts`) exécute la formule d'un indicateur.

## Principe

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

## Catalogue des étapes

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
| `js` | Exécute du JS arbitraire ; `input` = sortie de l'étape précédente, doit `return` un résultat. | `code`, exécuté dans un **isolate V8 séparé** (`isolated-vm`, 32 Mo, 2 s maximum), après une analyse du texte qui refuse 13 motifs dangereux (voir « L'étape `js` » plus bas). |

Rétro-compatibilité : les anciens noms de table `sessions`/`activities` sont
mappés vers `SessionData`/`Activities` (`LEGACY_TABLE_MAP`).

## Exemple : « Tentatives moyennes avant première réussite »

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

## `computeView` (`indicators.service.ts`) : calcul et cache

`POST /indicators/:id/compute-view` appelle `computeView(indicatorId, contextType,
contextId, activityId?, vizId?, forceRefresh?, courseId?)` :

- **Résolution de la formule** : `indicator.formula` ; toutes les visualisations partagent la même formule (**1 indicateur = 1 formule**).
- **Résolution `activityId`/`courseId`** : fournis par l'appelant, sans valeur par défaut, pour aucun contextType. `courseId` n'est pertinent que pour un indicateur `group` course-aware ou un indicateur personnel (`learner`/`teacher`/`admin`) dont la formule est course-aware (voir `isCourseAware()`) ; il est ignoré sinon.
- **Clé de cache** (`resolveCacheContextId()`, partagée avec `computeViewIncremental()`) : jamais de `vizId` (1 formule = 1 valeur, partagée par toutes les visualisations). Les formes de la clé, selon le `contextType`, sont décrites dans [donnees.md](../architecture/donnees.md#indicatorvalue-table-indicator_values).
  - Si une `IndicatorValue` existe déjà pour cette clé et que `forceRefresh` est
    faux → retournée directement (pas de recalcul).
- **Résolution des noms d'utilisateurs** : si le résultat est un tableau avec un
  champ `userIds[]`, ces identifiants sont remplacés par « Prénom Nom » via
  `PlatonService.getUserNameMap()` avant stockage et retour. L'identifiant
  n'apparaît que pour un utilisateur sans prénom ni nom.

Après un événement PLaTon, les valeurs en cache sont recalculées : voir [ingestion-evenements.md](./ingestion-evenements.md).

## Recalcul (`recalculate`)

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
  ces types (voir [limites-connues.md](../architecture/limites-connues.md)).

C'est ce même mécanisme qu'utilise le recalcul périodique des indicateurs
sans déclencheur (`AggregationService.recalculateTriggerlessIndicators()`,
fréquence réglable par `TRIGGERLESS_RECALC_CRON`, chaque minute par défaut) :
un seul chemin de calcul pour le bouton admin et pour le minuteur.

## Import / export YAML / JSON dans le builder

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

## Accès protégé à la base PLaTon

Les étapes `fetch` et `join` lisent des tables PLaTon choisies par
l'administrateur. Ce sont donc des noms de tables et de colonnes **saisis par
un humain** qui finissent dans du SQL. Trois protections dans
`api/src/modules/core/platon/platon.service.ts` :

**a) Les noms sont vérifiés, les valeurs sont paramétrées** (`queryTable`) :

```ts
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
  throw new Error(`Nom de table invalide : '${table}'`);
}
// ...
conditions.push(`"${col}" = $${idx++}`);   // la valeur part en paramètre $1, $2…
params.push(val);
```

**b) Jamais de `SELECT *`** : la liste des colonnes est lue dans
`information_schema`, puis filtrée par un motif de noms sensibles :

```ts
private static readonly SENSITIVE_COLUMN_PATTERN =
  /password|passwd|secret|token|api[_-]?key|hash|salt|credential|email|phone|discord|ip_address/i;
```

Une formule ne peut donc jamais lire un mot de passe ou un email, même si
l'administrateur le demande.

**c) Les tables/colonnes doivent exister** (`assertValidTableColumn`)
avant d'être utilisées dans du SQL généré (déclencheurs, voir [ingestion-evenements.md](./ingestion-evenements.md)).

## L'étape `js` : du code dans un bac à sable

Quand les étapes prédéfinies ne suffisent pas, l'administrateur peut écrire du
JavaScript. Ce code est écrit par des administrateurs, pas par l'équipe de
développement : il ne doit jamais pouvoir toucher au serveur.

Deux barrières :

**1. Analyse du texte avant exécution** (`JS_FORBIDDEN_PATTERNS`) : refus
de `process`, `require(`, `import(`, `eval(`, `Function(`, `.constructor(`,
`fetch(`, `child_process`, `fs.*`, etc.

**2. Exécution dans un isolate V8 séparé** (`executeJs`), avec la
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
[platon-local-setup.md](../deploiement/platon-local-setup.md), étape 0). Le binaire est lié à la
version de Node : il faut le réinstaller si Node change.
