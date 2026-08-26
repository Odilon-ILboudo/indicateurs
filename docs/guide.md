# Guide pratique - Créer les indicateurs "Tentatives avant première réussite"

Ce guide couvre tous les cas raisonnables de l'indicateur **« Nombre moyen de
tentatives avant première réussite »** (mesure : `attempts_at_success` sur
`SessionData`), déclinés selon deux axes :

- **le périmètre** (`contextType` + portée activité/cours/plateforme),
- **la déclinaison** (moyenne globale / moyenne détaillée / répartition
  détaillée / répartition globale).

Contrairement à la version précédente de ce guide (construction pas-à-pas dans
le builder visuel), chaque cas est donné ici sous forme de **JSON complet, prêt
à coller** via le panneau **Import** du builder (bouton "Import" → mode JSON →
coller → "Appliquer" → "Créer"). Le format exact est celui validé par
`pipeline-import.util.ts` :

```json
{
  "name": "...",
  "description": "...",
  "interpretationHint": "...",
  "contextType": "learner | teacher | admin | course | activity | group",
  "requiredEvents": ["..."],
  "thresholds": { "good": 0, "warning": 0 },
  "visualizations": [{ "label": "...", "type": "card | gauge | line-chart | bar-chart | histogram", "unit": "..." }],
  "pipeline": [ { "type": "...", "label": "...", "params": { } } ]
}
```

> **1 indicateur = 1 formule.** Deux déclinaisons différentes de la même mesure
> (ex. "moyenne globale" et "par exercice") sont donc **deux indicateurs
> distincts**, jamais deux visualisations d'un seul indicateur.

> **Plusieurs visualisations, seulement si la formule produit un scalaire.**
> `card` et `gauge` affichent toutes les deux un simple nombre - la même
> formule peut donc avoir les deux à la fois (deux façons de regarder la même
> valeur). `bar-chart` (objet `{clé: valeur}`) et `histogram` (tableau
> `[{bucket, count}]`) produisent une donnée structurée qu'une `card`/`gauge`
> ne sait pas afficher : ces cas restent à une seule visualisation, ce n'est
> pas un oubli. Dans ce guide, tous les cas "moyenne globale" (1, 3, 5, 9, 13,
> 17, 21, 22) ont donc une seconde visualisation `gauge` en plus de la `card`
> ; les cas "par exercice/activité" et "répartition" n'en ont qu'une.

---

## Regrouper les 22 cas en une famille

`familyName` **n'est pas** un champ importable via JSON (absent des clés
reconnues par `parseIndicatorImport` - voir le gabarit plus haut) : il faut le
renseigner à la main, indicateur par indicateur, dans l'étape 1 du wizard
après import, ou en renommant depuis la table de gestion admin (icône crayon
sur la ligne de famille). Nom et description à utiliser pour les 22 cas de ce
guide :

| Champ | Valeur |
|---|---|
| Nom de la famille | `Tentatives avant réussite` |
| Description | Nombre moyen de tentatives avant la première réussite (`attempts_at_success`), décliné selon le public (apprenant, groupe de TP, activité, cours, enseignant, admin), le périmètre (une activité ou un cours entier) et la représentation (moyenne globale, détail par exercice/activité, répartition des effectifs) - voir `docs/guide.md` pour les 22 cas. |

---

## 0. Correctif bloquant à faire AVANT de créer quoi que ce soit

**Aucun des cas de ce guide ne se mettra à jour en temps réel tant que ce point
n'est pas corrigé.** Vérifié le 2026-08-12 :

- Le trigger legacy (`trg_platon_outbox_session_data`, sur `SessionData.grade`)
  écrit un événement `exercise.answered` dont le payload ne contient **pas**
  `attempts_at_success` - inutilisable pour ces indicateurs.
- Une règle correcte existe déjà en base (`indicator_event_rules`, événement
  **"Exercice complet"** / `exercice.completed`, surveille bien
  `attempts_at_success`, mapping de contexte complet userId/courseId/
  activityId/sessionId) mais n'est **pas installée** :
  `password authentication failed for user "postgres"`.

**À faire, une seule fois :**

1. Corriger `PLATON_DB_ADMIN_PASSWORD` dans `api/.env` pour qu'il corresponde
   au vrai mot de passe superuser du Postgres utilisé (actuellement `12345678`
   ne fonctionne pas contre le conteneur `platon_postgres` lancé).
2. Redémarrer le backend.
3. `/dashboard/indicators` (rôle Admin) → **"Événements & déclencheurs"** →
   sur la ligne **"Exercice complet"** → **Installer**.
4. Vérifier que le badge passe à "Installé" (pas d'erreur affichée).

Une fois fait, **tous** les indicateurs de ce guide utilisent
`requiredEvents: ["exercice.completed"]` - ne créez pas de règle
supplémentaire, ni ne réutilisez `exercise.answered` (payload incompatible).

> Sans ce correctif, les indicateurs se calculent quand même à la première
> consultation ou via **"Recalculer"** (icône replay, table de gestion) - mais
> jamais automatiquement quand un étudiant répond à un exercice.

---

## Tableau des 22 cas

| # | `contextType` | Périmètre | Déclinaison | Statut en base (2026-08-12) |
|---|---|---|---|---|
| 1 | `learner` | 1 activité | moyenne globale | existe (event à corriger) |
| 2 | `learner` | 1 activité | par exercice | à créer |
| 3 | `learner` | 1 cours entier | moyenne globale | à créer |
| 4 | `learner` | 1 cours entier | par activité | à créer |
| 5 | `group` | 1 activité | moyenne globale | à créer |
| 6 | `group` | 1 activité | par exercice | à créer |
| 7 | `group` | 1 activité | répartition par exercice | à créer (voir limite 2D) |
| 8 | `group` | 1 activité | répartition tous exercices | à créer |
| 9 | `group` | 1 cours entier | moyenne globale | à créer |
| 10 | `group` | 1 cours entier | par activité | à créer |
| 11 | `group` | 1 cours entier | répartition par activité | à créer (voir limite 2D) |
| 12 | `group` | 1 cours entier | répartition toutes activités | à créer |
| 13 | `activity` | tous groupes | moyenne globale | existe |
| 14 | `activity` | tous groupes | par exercice | existe une version approchante (`sum` au lieu d'`avg`) |
| 15 | `activity` | tous groupes | répartition par exercice | à créer (nominatif + limite 2D) |
| 16 | `activity` | tous groupes | répartition tous exercices | à créer (nominatif) |
| 17 | `course` | tout le cours | moyenne globale | existe une version approchante (regroupée par ressource, pas une vraie moyenne globale) |
| 18 | `course` | tout le cours | par activité | à créer |
| 19 | `course` | tout le cours | répartition par activité | à créer (nominatif + limite 2D) |
| 20 | `course` | tout le cours | répartition toutes activités | à créer (nominatif) |
| 21 | `teacher` | plateforme entière | moyenne globale (seule variante possible) | à créer |
| 22 | `admin` | plateforme entière | moyenne globale (seule variante possible) | à créer |

**Limite 2D** (cas 7, 11, 15, 19) : aucun type de visualisation actuel
(`card`/`gauge`/`line-chart`/`bar-chart`/`histogram`) ne représente nativement
deux dimensions (exercice/activité **et** nombre de tentatives) - `bar-chart`
attend un objet plat `{clé: valeur}`, `histogram` un tableau `[{bucket,
count}]` à une seule dimension. Le JSON donné pour ces 4 cas est un
**contournement** (clé composite `"Exercice (N tentatives)"`), pas une vraie
répartition facettée - à valider avant usage réel.

**Nominatif** (cas 15, 16, 19, 20) : `activity`/`course` sont visibles à tous
les rôles par défaut (`RoleService.INDICATOR_VISIBILITY`), y compris les
étudiants. Une répartition liste des noms d'étudiants (`userIds` résolus en
noms par `computeView`) - **restreindre `visibilityRoles` à `["teacher",
"admin"]`** après création (non réglable via l'import JSON, à faire depuis la
table de gestion).

---

## Cas 1 à 4 - `learner` (rôle Étudiant)

### Cas 1 - moyenne globale, sur l'activité

```json
{
  "name": "Tentatives avant réussite - Apprenant (activité)",
  "description": "Nombre moyen de tentatives avant la première réussite, sur les exercices de l'activité consultée.",
  "interpretationHint": "Une valeur basse indique que l'étudiant réussit rapidement ses exercices sur cette activité ; une valeur élevée peut signaler une difficulté à comprendre l'énoncé ou le concept visé.",
  "contextType": "learner",
  "requiredEvents": ["exercice.completed"],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [
    { "label": "Tentatives avant réussite", "type": "card", "unit": "tentatives" },
    { "label": "Tentatives avant réussite (jauge)", "type": "gauge", "unit": "tentatives" }
  ],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": ["user_id", "activity_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "extract", "label": "Tentatives avant réussite", "params": { "extractField": "attempts_at_success" } },
    { "type": "aggregate", "label": "Moyenne", "params": { "aggregateFn": "avg" } },
    { "type": "round", "label": "Arrondir", "params": { "decimals": 2 } }
  ]
}
```

### Cas 2 - détaillée par exercice, sur l'activité

```json
{
  "name": "Tentatives avant réussite - Apprenant (par exercice)",
  "description": "Nombre de tentatives avant la première réussite, détaillé par exercice de l'activité.",
  "interpretationHint": "Permet de repérer les exercices particulièrement difficiles pour cet étudiant, plutôt qu'une moyenne qui les masquerait.",
  "contextType": "learner",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Tentatives par exercice", "type": "bar-chart", "unit": "tentatives" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": ["user_id", "activity_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Par exercice", "params": { "code": "const out = {};\nfor (const row of input) {\n  const name = row.resource_name || row.resource_id;\n  const v = parseInt(row.attempts_at_success);\n  if (!isNaN(v)) out[name] = v;\n}\nreturn out;" } }
  ]
}
```
`resource_name` est directement disponible sur `SessionData` (dénormalisé) -
pas besoin de `join` vers `Resources`, contrairement à ce que suggérait la
version précédente de ce guide.

### Cas 3 - moyenne globale, sur tout le cours

**Volontairement sans déclencheur** (`requiredEvents: []`) - c'est le cas
choisi pour tester le recalcul périodique plutôt que le temps réel.
`AggregationService.recalculateTriggerlessIndicators()` tourne à la fréquence
définie par la variable d'environnement `TRIGGERLESS_RECALC_CRON` (défaut :
toutes les minutes) et appelle `IndicatorsService.recalculate()` sur tout
indicateur actif sans déclencheur, quel que soit son `contextType`.
`recalculate()` gère correctement les trois contextTypes personnels
(`learner`/`teacher`/`admin`), y compris quand leur formule est restreinte à
une activité ou à un cours (une valeur est recalculée par activité/cours
concerné, pas une seule valeur globale). Les contextTypes `group`/`activity`/
`course` n'ont pas de notion d'utilisateur "abonné" au sens de
`UserIndicatorPreference` et ne sont donc jamais concernés par ce recalcul
périodique - ils ont besoin d'un déclencheur réel pour être mis à jour.

Pour observer le recalcul périodique : créez l'indicateur, activez-le depuis
un compte étudiant (`UserIndicatorPreference`), puis attendez jusqu'à une
minute (ou cliquez "Recalculer" côté admin pour ne pas attendre).

```json
{
  "name": "Tentatives avant réussite - Apprenant (cours entier)",
  "description": "Nombre moyen de tentatives avant la première réussite, sur toutes les activités du cours.",
  "interpretationHint": "Vue d'ensemble de la progression de l'étudiant sur tout le cours, moins sensible aux variations d'une seule activité.",
  "contextType": "learner",
  "requiredEvents": [],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [
    { "label": "Tentatives avant réussite (cours)", "type": "card", "unit": "tentatives" },
    { "label": "Tentatives avant réussite (cours, jauge)", "type": "gauge", "unit": "tentatives" }
  ],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": ["user_id", "course_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "extract", "label": "Tentatives avant réussite", "params": { "extractField": "attempts_at_success" } },
    { "type": "aggregate", "label": "Moyenne", "params": { "aggregateFn": "avg" } },
    { "type": "round", "label": "Arrondir", "params": { "decimals": 2 } }
  ]
}
```

### Cas 4 - détaillée par activité, sur tout le cours

```json
{
  "name": "Tentatives avant réussite - Apprenant (par activité)",
  "description": "Nombre moyen de tentatives avant la première réussite, détaillé par activité du cours.",
  "interpretationHint": "Permet de situer les activités les plus difficiles pour cet étudiant sur l'ensemble du cours.",
  "contextType": "learner",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Tentatives par activité", "type": "bar-chart", "unit": "tentatives" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": ["user_id", "course_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Par activité", "params": { "code": "const groups = {};\nfor (const row of input) {\n  const key = row.activity_id;\n  if (!groups[key]) groups[key] = [];\n  const v = parseInt(row.attempts_at_success);\n  if (!isNaN(v)) groups[key].push(v);\n}\nconst out = {};\nfor (const [key, vals] of Object.entries(groups)) {\n  out[key] = Math.round((vals.reduce((a,b)=>a+b,0)/vals.length)*100)/100;\n}\nreturn out;" } }
  ]
}
```
**Limite trouvée** : `Activities` n'a pas de colonne `name`, et son `id` ne
correspond pas à `Resources.id` (vérifié, jointure directe infructueuse). Ce
pipeline affiche donc les activités par **identifiant brut** (UUID), pas par
nom lisible - à améliorer si besoin (probablement en résolvant les noms côté
frontend plutôt que dans la formule).

---

## Cas 5 à 12 - `group` (rôle Chargé de TP / Enseignant)

### Cas 5 - moyenne globale, sur l'activité

```json
{
  "name": "Tentatives avant réussite - Groupe (activité, moyenne globale)",
  "description": "Nombre moyen de tentatives avant la première réussite, tous étudiants et exercices du groupe confondus, sur cette activité.",
  "interpretationHint": "Moyenne unique pour ce groupe sur cette activité, tous exercices confondus. Une valeur élevée peut indiquer que le groupe a besoin d'un accompagnement supplémentaire - voir la variante \"par exercice\" pour savoir si la difficulté est répartie ou concentrée sur un exercice précis.",
  "contextType": "group",
  "requiredEvents": ["exercice.completed"],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [
    { "label": "Tentatives avant réussite (groupe)", "type": "card", "unit": "tentatives" },
    { "label": "Tentatives avant réussite (groupe, jauge)", "type": "gauge", "unit": "tentatives" }
  ],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions du groupe", "params": { "table": "SessionData", "contextFields": ["group_id", "activity_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "extract", "label": "Tentatives avant réussite", "params": { "extractField": "attempts_at_success" } },
    { "type": "aggregate", "label": "Moyenne", "params": { "aggregateFn": "avg" } },
    { "type": "round", "label": "Arrondir", "params": { "decimals": 2 } }
  ]
}
```

### Cas 6 - détaillée par exercice, sur l'activité

```json
{
  "name": "Tentatives avant réussite - Groupe (activité, par exercice)",
  "description": "Nombre moyen de tentatives avant la première réussite, détaillé par exercice, pour ce groupe sur cette activité.",
  "interpretationHint": "Moyenne des tentatives avant réussite calculée séparément pour chaque exercice de l'activité, pour ce groupe uniquement. Permet d'identifier l'exercice précis qui pose difficulté à l'ensemble du groupe.",
  "contextType": "group",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Tentatives par exercice", "type": "bar-chart", "unit": "tentatives" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions du groupe", "params": { "table": "SessionData", "contextFields": ["group_id", "activity_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Moyenne par exercice", "params": { "code": "const groups = {};\nfor (const row of input) {\n  const name = row.resource_name || row.resource_id;\n  if (!groups[name]) groups[name] = [];\n  const v = parseInt(row.attempts_at_success);\n  if (!isNaN(v)) groups[name].push(v);\n}\nconst out = {};\nfor (const [name, vals] of Object.entries(groups)) {\n  out[name] = Math.round((vals.reduce((a,b)=>a+b,0)/vals.length)*100)/100;\n}\nreturn out;" } }
  ]
}
```

### Cas 7 - répartition détaillée par exercice (contournement 2D)

```json
{
  "name": "Tentatives avant réussite - Groupe (activité, répartition par exercice)",
  "description": "Répartition des étudiants du groupe par nombre de tentatives avant réussite, détaillée par exercice.",
  "interpretationHint": "Pour chaque exercice de l'activité, nombre d'étudiants du groupe ayant réussi en exactement 1, 2, 3... tentatives. Donnée agrégée (comptages uniquement) : utile pour repérer un exercice où plusieurs étudiants du groupe ont buté au même endroit.",
  "contextType": "group",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Répartition par exercice", "type": "bar-chart", "unit": "étudiants" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions du groupe", "params": { "table": "SessionData", "contextFields": ["group_id", "activity_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Répartition composite", "params": { "code": "const out = {};\nfor (const row of input) {\n  const ex = row.resource_name || row.resource_id;\n  const v = parseInt(row.attempts_at_success);\n  if (isNaN(v)) continue;\n  const key = `${ex} (${v} tentative${v > 1 ? 's' : ''})`;\n  out[key] = (out[key] || 0) + 1;\n}\nreturn out;" } }
  ]
}
```

### Cas 8 - répartition globale, tous exercices confondus

```json
{
  "name": "Tentatives avant réussite - Groupe (activité, répartition globale)",
  "description": "Répartition des étudiants du groupe par nombre moyen de tentatives avant la première réussite, tous exercices confondus.",
  "interpretationHint": "Chaque étudiant du groupe est regroupé selon sa propre moyenne de tentatives sur cette activité, puis réparti en tranches. Donnée nominative (réservée aux enseignants/admin) : une répartition étalée peut signaler un groupe hétérogène, à la différence d'une répartition resserrée.",
  "contextType": "group",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Répartition des effectifs", "type": "histogram", "unit": "tentatives" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions du groupe", "params": { "table": "SessionData", "contextFields": ["group_id", "activity_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Répartition par moyenne étudiant", "params": { "code": "const perStudent = {};\nfor (const row of input) {\n  if (!perStudent[row.user_id]) perStudent[row.user_id] = [];\n  perStudent[row.user_id].push(parseInt(row.attempts_at_success) || 0);\n}\nconst buckets = {};\nfor (const [uid, vals] of Object.entries(perStudent)) {\n  const avg = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);\n  if (!buckets[avg]) buckets[avg] = [];\n  buckets[avg].push(uid);\n}\nreturn Object.entries(buckets)\n  .map(([bucket, userIds]) => ({ bucket: parseInt(bucket), count: userIds.length, userIds }))\n  .sort((a,b) => a.bucket - b.bucket);" } }
  ]
}
```
`userIds` (identifiants bruts) suffit - `computeView` résout les noms
automatiquement, pas besoin de `join` sur `Users`.

### Cas 9 - moyenne globale, sur tout le cours

```json
{
  "name": "Tentatives avant réussite - Groupe (cours entier, moyenne globale)",
  "description": "Nombre moyen de tentatives avant la première réussite, tous étudiants et activités du groupe confondus, sur tout le cours.",
  "interpretationHint": "Moyenne unique pour ce groupe sur l'ensemble du cours, toutes activités confondues. Vue d'ensemble moins sensible aux variations d'une seule activité que les moyennes par activité.",
  "contextType": "group",
  "requiredEvents": ["exercice.completed"],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [
    { "label": "Tentatives avant réussite (groupe, cours)", "type": "card", "unit": "tentatives" },
    { "label": "Tentatives avant réussite (groupe, cours, jauge)", "type": "gauge", "unit": "tentatives" }
  ],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions du groupe", "params": { "table": "SessionData", "contextFields": ["group_id", "course_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "extract", "label": "Tentatives avant réussite", "params": { "extractField": "attempts_at_success" } },
    { "type": "aggregate", "label": "Moyenne", "params": { "aggregateFn": "avg" } },
    { "type": "round", "label": "Arrondir", "params": { "decimals": 2 } }
  ]
}
```

### Cas 10 - détaillée par activité, sur tout le cours

```json
{
  "name": "Tentatives avant réussite - Groupe (cours entier, par activité)",
  "description": "Nombre moyen de tentatives avant la première réussite, détaillé par activité, pour ce groupe sur tout le cours.",
  "interpretationHint": "Moyenne des tentatives avant réussite calculée séparément pour chaque activité du cours, pour ce groupe uniquement. Situe les activités les plus difficiles pour ce groupe.",
  "contextType": "group",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Tentatives par activité", "type": "bar-chart", "unit": "tentatives" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions du groupe", "params": { "table": "SessionData", "contextFields": ["group_id", "course_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Moyenne par activité", "params": { "code": "const groups = {};\nfor (const row of input) {\n  const key = row.activity_id;\n  if (!groups[key]) groups[key] = [];\n  const v = parseInt(row.attempts_at_success);\n  if (!isNaN(v)) groups[key].push(v);\n}\nconst out = {};\nfor (const [key, vals] of Object.entries(groups)) {\n  out[key] = Math.round((vals.reduce((a,b)=>a+b,0)/vals.length)*100)/100;\n}\nreturn out;" } }
  ]
}
```
Regroupé par `activity_id` brut (UUID) - même limite d'absence de nom
lisible qu'au cas 4 (`Activities` n'a pas de colonne `name` exploitable).

### Cas 11 - répartition détaillée par activité (contournement 2D)

```json
{
  "name": "Tentatives avant réussite - Groupe (cours entier, répartition par activité)",
  "description": "Répartition des étudiants du groupe par nombre de tentatives avant réussite, détaillée par activité, sur tout le cours.",
  "interpretationHint": "Pour chaque activité du cours, nombre d'étudiants du groupe ayant réussi en exactement 1, 2, 3... tentatives. Donnée agrégée (comptages uniquement), à l'échelle du cours entier.",
  "contextType": "group",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Répartition par activité", "type": "bar-chart", "unit": "étudiants" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions du groupe", "params": { "table": "SessionData", "contextFields": ["group_id", "course_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Répartition composite", "params": { "code": "const out = {};\nfor (const row of input) {\n  const act = row.activity_id;\n  const v = parseInt(row.attempts_at_success);\n  if (isNaN(v)) continue;\n  const key = `${act} (${v} tentative${v > 1 ? 's' : ''})`;\n  out[key] = (out[key] || 0) + 1;\n}\nreturn out;" } }
  ]
}
```
Même contournement que le cas 7 (clé composite) et même limite de nom
lisible que le cas 10.

### Cas 12 - répartition globale, toutes activités confondues

```json
{
  "name": "Tentatives avant réussite - Groupe (cours entier, répartition globale)",
  "description": "Répartition des étudiants du groupe par nombre moyen de tentatives avant la première réussite, toutes activités du cours confondues.",
  "interpretationHint": "Chaque étudiant du groupe est regroupé selon sa propre moyenne de tentatives sur l'ensemble du cours, puis réparti en tranches. Donnée nominative (réservée aux enseignants/admin) : une hétérogénéité qui persiste sur tout le cours mérite un signalement particulier.",
  "contextType": "group",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Répartition des effectifs", "type": "histogram", "unit": "tentatives" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions du groupe", "params": { "table": "SessionData", "contextFields": ["group_id", "course_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Répartition par moyenne étudiant", "params": { "code": "const perStudent = {};\nfor (const row of input) {\n  if (!perStudent[row.user_id]) perStudent[row.user_id] = [];\n  perStudent[row.user_id].push(parseInt(row.attempts_at_success) || 0);\n}\nconst buckets = {};\nfor (const [uid, vals] of Object.entries(perStudent)) {\n  const avg = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);\n  if (!buckets[avg]) buckets[avg] = [];\n  buckets[avg].push(uid);\n}\nreturn Object.entries(buckets)\n  .map(([bucket, userIds]) => ({ bucket: parseInt(bucket), count: userIds.length, userIds }))\n  .sort((a,b) => a.bucket - b.bucket);" } }
  ]
}
```

> **Aucun de ces 8 cas (5 à 12) n'existe encore en base** - à créer un par un
> si besoin, pas de recette automatique dans le builder pour l'instant.

---

## Cas 13 à 16 - `activity` (tous rôles, tous groupes confondus)

### Cas 13 - moyenne globale

**Existe déjà** (`Tentatives avant réussite - Activité`). Formule de
référence :
```json
{
  "name": "Tentatives avant réussite - Activité",
  "description": "Nombre moyen de tentatives avant la première réussite, tous étudiants et groupes confondus, sur cette activité.",
  "interpretationHint": "Moyenne unique sur toute l'activité : tous les exercices, tous les groupes et tous les étudiants sont mélangés dans un seul chiffre. Donne une vue d'ensemble rapide, mais masque si la difficulté vient d'un exercice précis ou est répartie uniformément - voir \"Tentatives avant réussite - Activité (par exercice)\" pour ce détail.",
  "contextType": "activity",
  "requiredEvents": ["exercice.completed"],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [
    { "label": "Tentatives avant réussite (activité)", "type": "card", "unit": "tentatives" },
    { "label": "Tentatives avant réussite (activité, jauge)", "type": "gauge", "unit": "tentatives" }
  ],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": ["activity_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "extract", "label": "Tentatives avant réussite", "params": { "extractField": "attempts_at_success" } },
    { "type": "aggregate", "label": "Moyenne", "params": { "aggregateFn": "avg" } },
    { "type": "round", "label": "Arrondir", "params": { "decimals": 2 } }
  ]
}
```

### Cas 14 - détaillée par exercice

Une version existe (`Tentatives v2 - Activité`) mais fait un `sum`, pas une
`avg` - à corriger ou recréer proprement :
```json
{
  "name": "Tentatives avant réussite - Activité (par exercice)",
  "description": "Nombre moyen de tentatives avant la première réussite, détaillé par exercice, tous groupes confondus.",
  "interpretationHint": "Moyenne des tentatives avant réussite calculée séparément pour chaque exercice de l'activité (tous groupes et étudiants confondus au sein de chaque exercice). Permet de repérer quel exercice précis pose problème, contrairement à \"Tentatives avant réussite - Activité\" qui donne une seule moyenne mélangeant tous les exercices.",
  "contextType": "activity",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Tentatives par exercice", "type": "bar-chart", "unit": "tentatives" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": ["activity_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Moyenne par exercice", "params": { "code": "const groups = {};\nfor (const row of input) {\n  const name = row.resource_name || row.resource_id;\n  if (!groups[name]) groups[name] = [];\n  const v = parseInt(row.attempts_at_success);\n  if (!isNaN(v)) groups[name].push(v);\n}\nconst out = {};\nfor (const [name, vals] of Object.entries(groups)) {\n  out[name] = Math.round((vals.reduce((a,b)=>a+b,0)/vals.length)*100)/100;\n}\nreturn out;" } }
  ]
}
```

### Cas 15 - répartition détaillée par exercice (contournement 2D, nominatif)

```json
{
  "name": "Nombre de tentatives avant réussite par exercice: répartition des étudiants",
  "description": "Répartition des étudiants par nombre de tentatives avant réussite, détaillée par exercice, tous groupes confondus.",
  "interpretationHint": "Pour chaque exercice de l'activité, nombre d'étudiants ayant réussi en exactement 1, 2, 3... tentatives. Donnée agrégée (comptages uniquement, aucun étudiant nommé) : montre si la réussite est rapide pour la plupart des étudiants ou si une minorité a eu besoin de beaucoup plus de tentatives, exercice par exercice.",
  "contextType": "activity",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Répartition par exercice", "type": "bar-chart", "unit": "étudiants" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": ["activity_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Répartition composite", "params": { "code": "const out = {};\nfor (const row of input) {\n  const ex = row.resource_name || row.resource_id;\n  const v = parseInt(row.attempts_at_success);\n  if (isNaN(v)) continue;\n  const key = `${ex} (${v} tentative${v > 1 ? 's' : ''})`;\n  out[key] = (out[key] || 0) + 1;\n}\nreturn out;" } }
  ]
}
```
**Nominatif indirectement** (les barres regroupent des étudiants, sans lister
leurs noms ici - contrairement au cas 16) mais reste une donnée fine sur
l'activité entière : à restreindre à `teacher`/`admin` par prudence.

### Cas 16 - répartition globale, tous exercices confondus (nominatif)

```json
{
  "name": "Tentatives avant réussite - Activité (répartition globale)",
  "description": "Répartition des étudiants par nombre moyen de tentatives avant la première réussite, tous exercices et groupes confondus.",
  "interpretationHint": "Chaque étudiant est regroupé selon sa propre moyenne de tentatives (arrondie à l'entier) sur l'ensemble des exercices de l'activité, tous groupes confondus, puis les étudiants sont répartis en tranches. Donnée nominative : chaque tranche liste les étudiants concernés - réservé aux enseignants/admin.",
  "contextType": "activity",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Répartition des effectifs", "type": "histogram", "unit": "tentatives" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": ["activity_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Répartition par moyenne étudiant", "params": { "code": "const perStudent = {};\nfor (const row of input) {\n  if (!perStudent[row.user_id]) perStudent[row.user_id] = [];\n  perStudent[row.user_id].push(parseInt(row.attempts_at_success) || 0);\n}\nconst buckets = {};\nfor (const [uid, vals] of Object.entries(perStudent)) {\n  const avg = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);\n  if (!buckets[avg]) buckets[avg] = [];\n  buckets[avg].push(uid);\n}\nreturn Object.entries(buckets)\n  .map(([bucket, userIds]) => ({ bucket: parseInt(bucket), count: userIds.length, userIds }))\n  .sort((a,b) => a.bucket - b.bucket);" } }
  ]
}
```
**Nominatif direct** (`userIds` → noms résolus au survol) : restreindre
`visibilityRoles` à `["teacher", "admin"]` après création, sinon tout étudiant
voit les noms de ses camarades.

---

## Cas 17 à 20 - `course` (tous rôles, tout le cours)

> **Noms volontairement différents** de l'indicateur `Tentatives avant
> réussite - Cours` déjà en base (son pipeline actuel regroupe par nom de
> ressource via un `js` - ce n'est pas une vraie moyenne globale au sens du
> cas 17 ci-dessous) - le nom est une colonne `UNIQUE`, coller un JSON avec un
> nom déjà pris échoue avec un conflit (`409`).

### Cas 17 - moyenne globale, sur tout le cours

```json
{
  "name": "Tentatives avant réussite - Cours (moyenne globale)",
  "description": "Nombre moyen de tentatives avant la première réussite, tous étudiants, groupes et activités confondus, sur tout le cours.",
  "interpretationHint": "Moyenne unique sur tout le cours : toutes les activités, tous les groupes et tous les étudiants sont mélangés dans un seul chiffre. Vue rapide qui masque si la difficulté vient d'une activité précise - voir \"Tentatives avant réussite - Cours (par activité)\" pour ce détail.",
  "contextType": "course",
  "requiredEvents": ["exercice.completed"],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [
    { "label": "Tentatives avant réussite (cours)", "type": "card", "unit": "tentatives" },
    { "label": "Tentatives avant réussite (cours, jauge)", "type": "gauge", "unit": "tentatives" }
  ],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": ["course_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "extract", "label": "Tentatives avant réussite", "params": { "extractField": "attempts_at_success" } },
    { "type": "aggregate", "label": "Moyenne", "params": { "aggregateFn": "avg" } },
    { "type": "round", "label": "Arrondir", "params": { "decimals": 2 } }
  ]
}
```

### Cas 18 - détaillée par activité, sur tout le cours

```json
{
  "name": "Tentatives avant réussite - Cours (par activité)",
  "description": "Nombre moyen de tentatives avant la première réussite, détaillé par activité, tous groupes confondus, sur tout le cours.",
  "interpretationHint": "Moyenne des tentatives avant réussite calculée séparément pour chaque activité du cours, tous groupes et étudiants confondus. Permet de repérer quelle activité précise pose problème plutôt qu'une moyenne globale qui les mélange toutes.",
  "contextType": "course",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Tentatives par activité", "type": "bar-chart", "unit": "tentatives" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": ["course_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Moyenne par activité", "params": { "code": "const groups = {};\nfor (const row of input) {\n  const key = row.activity_id;\n  if (!groups[key]) groups[key] = [];\n  const v = parseInt(row.attempts_at_success);\n  if (!isNaN(v)) groups[key].push(v);\n}\nconst out = {};\nfor (const [key, vals] of Object.entries(groups)) {\n  out[key] = Math.round((vals.reduce((a,b)=>a+b,0)/vals.length)*100)/100;\n}\nreturn out;" } }
  ]
}
```
Regroupé par `activity_id` brut (UUID) - même limite d'absence de nom
lisible qu'au cas 4 et au cas 10.

### Cas 19 - répartition détaillée par activité (contournement 2D, nominatif)

```json
{
  "name": "Tentatives avant réussite - Cours (répartition par activité)",
  "description": "Répartition des étudiants par nombre de tentatives avant réussite, détaillée par activité, tous groupes confondus, sur tout le cours.",
  "interpretationHint": "Pour chaque activité du cours, nombre d'étudiants ayant réussi en exactement 1, 2, 3... tentatives. Donnée agrégée (comptages uniquement, aucun étudiant nommé) : montre si la réussite est rapide pour la plupart des étudiants ou concentrée sur quelques activités précises.",
  "contextType": "course",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Répartition par activité", "type": "bar-chart", "unit": "étudiants" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": ["course_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Répartition composite", "params": { "code": "const out = {};\nfor (const row of input) {\n  const act = row.activity_id;\n  const v = parseInt(row.attempts_at_success);\n  if (isNaN(v)) continue;\n  const key = `${act} (${v} tentative${v > 1 ? 's' : ''})`;\n  out[key] = (out[key] || 0) + 1;\n}\nreturn out;" } }
  ]
}
```
Même contournement (clé composite) que les cas 7/11/15. Nominatif
indirectement (pas de nom listé, mais donnée fine) : à restreindre à
`teacher`/`admin` par prudence.

### Cas 20 - répartition globale, toutes activités confondues (nominatif)

```json
{
  "name": "Tentatives avant réussite - Cours (répartition globale)",
  "description": "Répartition des étudiants par nombre moyen de tentatives avant la première réussite, toutes activités et groupes confondus, sur tout le cours.",
  "interpretationHint": "Chaque étudiant du cours est regroupé selon sa propre moyenne de tentatives (arrondie à l'entier) sur l'ensemble des activités, puis réparti en tranches. Donnée nominative : chaque tranche liste les étudiants concernés - réservé aux enseignants/admin.",
  "contextType": "course",
  "requiredEvents": ["exercice.completed"],
  "visualizations": [{ "label": "Répartition des effectifs", "type": "histogram", "unit": "tentatives" }],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": ["course_id"] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "js", "label": "Répartition par moyenne étudiant", "params": { "code": "const perStudent = {};\nfor (const row of input) {\n  if (!perStudent[row.user_id]) perStudent[row.user_id] = [];\n  perStudent[row.user_id].push(parseInt(row.attempts_at_success) || 0);\n}\nconst buckets = {};\nfor (const [uid, vals] of Object.entries(perStudent)) {\n  const avg = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);\n  if (!buckets[avg]) buckets[avg] = [];\n  buckets[avg].push(uid);\n}\nreturn Object.entries(buckets)\n  .map(([bucket, userIds]) => ({ bucket: parseInt(bucket), count: userIds.length, userIds }))\n  .sort((a,b) => a.bucket - b.bucket);" } }
  ]
}
```
**Nominatif direct** (`userIds` → noms résolus au survol) : restreindre
`visibilityRoles` à `["teacher", "admin"]` après création.

---

## Cas 21 - `teacher`, plateforme entière

Seule variante possible pour ce contextType : aucun mécanisme actuel ne
permet de filtrer "les cours d'un enseignant précis" (`CONTEXT_FIELD_MAP` ne
mappe que `user_id`/`activity_id`/`course_id`, pas de `course_owner_id` - vu
sur les indicateurs `teacher` réels déjà en base, qui ont tous
`contextFields: []`).

```json
{
  "name": "Tentatives avant réussite - Plateforme (vue enseignant)",
  "description": "Nombre moyen de tentatives avant la première réussite, sur toute la plateforme.",
  "interpretationHint": "Indicateur global plateforme, identique pour tous les enseignants (aucun filtrage par cours possible actuellement).",
  "contextType": "teacher",
  "requiredEvents": ["exercice.completed"],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [
    { "label": "Tentatives avant réussite (plateforme)", "type": "card", "unit": "tentatives" },
    { "label": "Tentatives avant réussite (plateforme, jauge)", "type": "gauge", "unit": "tentatives" }
  ],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": [] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "extract", "label": "Tentatives avant réussite", "params": { "extractField": "attempts_at_success" } },
    { "type": "aggregate", "label": "Moyenne", "params": { "aggregateFn": "avg" } },
    { "type": "round", "label": "Arrondir", "params": { "decimals": 2 } }
  ]
}
```

## Cas 22 - `admin`, plateforme entière

Même limite et même pipeline que le cas 21, seul `contextType` change :

```json
{
  "name": "Tentatives avant réussite - Plateforme (vue admin)",
  "description": "Nombre moyen de tentatives avant la première réussite, sur toute la plateforme.",
  "interpretationHint": "Moyenne du nombre de tentatives avant réussite sur l'ensemble de la plateforme : tous les utilisateurs, cours et activités sont mélangés dans un seul chiffre. Identique pour tous les administrateurs, aucun filtrage par cours possible.",
  "contextType": "admin",
  "requiredEvents": ["exercice.completed"],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [
    { "label": "Tentatives avant réussite (plateforme)", "type": "card", "unit": "tentatives" },
    { "label": "Tentatives avant réussite (plateforme, jauge)", "type": "gauge", "unit": "tentatives" }
  ],
  "pipeline": [
    { "type": "fetch", "label": "Charger sessions", "params": { "table": "SessionData", "contextFields": [] } },
    { "type": "filter", "label": "Sessions réussies", "params": { "field": "attempts_at_success", "operator": ">", "value": 0 } },
    { "type": "extract", "label": "Tentatives avant réussite", "params": { "extractField": "attempts_at_success" } },
    { "type": "aggregate", "label": "Moyenne", "params": { "aggregateFn": "avg" } },
    { "type": "round", "label": "Arrondir", "params": { "decimals": 2 } }
  ]
}
```

---

## Référence - Rôles et visibilité (`RoleService.INDICATOR_VISIBILITY`)

| `contextType` | Rôle(s) qui voient l'indicateur par défaut |
|---|---|
| `learner` | `student` uniquement |
| `teacher` | `teacher` uniquement |
| `admin` | `admin` uniquement |
| `course` | tout le monde (`student`/`teacher`/`admin`/`demo`) |
| `activity` | tout le monde |
| `group` | `teacher` + `admin` |

`visibilityRoles` (sur l'indicateur, pas importable en JSON) surcharge cette
règle par défaut - à utiliser pour les cas 15, 16, 19, 20 (nominatifs).

---

## Référence - Outils admin

Toujours dans `/dashboard/indicators` (rôle Admin), table de gestion :

- **Import** (bouton, panneau builder étape 3) : coller un des JSON ci-dessus,
  "Appliquer" charge le pipeline et les métadonnées dans le formulaire -
  vérifier/compléter les champs non couverts par l'import (`familyName`,
  `baseIndicatorId`, `visibilityRoles`, `isFamilyPlaceholder` : à régler depuis
  le formulaire, pas dans le JSON).
- **Modifier** (crayon) → rouvre le builder hydraté.
- **Logs d'exécution** (document) → `GET /indicators/:id/logs?limit=100`.
- **Recalculer** (replay, popconfirm) → `POST /indicators/:id/recalculate`.
- **Switch actif/inactif** → `PATCH /indicators/:id/status`.
- **Supprimer** (corbeille, popconfirm) → `DELETE /indicators/:id`.

### Note sur le type de visualisation "Graphique ligne"

`line-chart` affiche `result.metadata.history`, alimenté par `computeView`
(chaque calcul en cache ajoute une entrée `{value, timestamp}` à l'historique
stocké en base). Seul le tout premier calcul d'un indicateur (aucune ligne en
cache) n'a pas encore d'historique - la courbe se remplit dès la deuxième
consultation.

### Note sur le format attendu par `bar-chart` et `histogram`

- `bar-chart` : objet plat `{ "clé": valeur }` (ou tableau
  `[{key, value}]`) - une barre par clé.
- `histogram` : tableau `[{ bucket, count, userIds? }]` - une barre par
  `bucket`, `userIds` (identifiants bruts) résolus en noms par `computeView`
  via `getUserNameMap` (pas besoin de `join` sur `Users` dans la formule).
