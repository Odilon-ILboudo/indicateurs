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
  "contextType": "learner",
  "requiredEvents": ["exercice.completed"],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [{ "label": "Tentatives avant réussite", "type": "card", "unit": "tentatives" }],
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

```json
{
  "name": "Tentatives avant réussite - Apprenant (cours entier)",
  "description": "Nombre moyen de tentatives avant la première réussite, sur toutes les activités du cours.",
  "contextType": "learner",
  "requiredEvents": ["exercice.completed"],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [{ "label": "Tentatives avant réussite (cours)", "type": "card", "unit": "tentatives" }],
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
  "contextType": "group",
  "requiredEvents": ["exercice.completed"],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [{ "label": "Tentatives avant réussite (groupe)", "type": "card", "unit": "tentatives" }],
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

### Cas 9 à 12 - mêmes 4 déclinaisons, sur tout le cours

Remplacer `"contextFields": ["group_id", "activity_id"]` par
`"contextFields": ["group_id", "course_id"]` dans chacun des 4 pipelines
ci-dessus (cas 5→9, 6→10, 7→11, 8→12), et pour les cas 10/11 (par activité),
remplacer `row.resource_name || row.resource_id` par `row.activity_id` (même
limite d'absence de nom lisible qu'au cas 4). Noms et descriptions à adapter
("... sur tout le cours" au lieu de "... sur cette activité").

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
  "contextType": "activity",
  "requiredEvents": ["exercice.completed"],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [{ "label": "Tentatives avant réussite (activité)", "type": "card", "unit": "tentatives" }],
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
  "name": "Tentatives avant réussite - Activité (répartition par exercice)",
  "description": "Répartition des étudiants par nombre de tentatives avant réussite, détaillée par exercice, tous groupes confondus.",
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

Mêmes 4 pipelines que les cas 13 à 16, en remplaçant
`"contextFields": ["activity_id"]` par `"contextFields": ["course_id"]`, et
pour les déclinaisons "par exercice"/"répartition par exercice" (cas 18, 19),
remplacer le regroupement par `resource_name`/`resource_id` par
`row.activity_id` (même limite de nom lisible qu'au cas 4 - aucune activité
n'a de nom directement exploitable dans une formule).

- **Cas 17** (moyenne globale) : une version existe déjà (`Tentatives avant
  réussite - Cours`), mais son pipeline actuel regroupe par nom de ressource
  via un `js` (`join(Resources)` + regroupement) - ce n'est **pas** une vraie
  moyenne globale au sens de ce cas. À vérifier/recréer avec le pipeline
  simple `fetch→filter→extract→aggregate(avg)→round` si le besoin est
  vraiment "une seule valeur pour tout le cours".
- **Cas 18** (par activité) : à créer, `js` groupé par `activity_id`.
- **Cas 19** (répartition par activité, contournement 2D) : à créer,
  nominatif indirect.
- **Cas 20** (répartition toutes activités confondues) : à créer, nominatif
  direct (`userIds`) - même restriction `visibilityRoles` que le cas 16.

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
  "contextType": "teacher",
  "requiredEvents": ["exercice.completed"],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [{ "label": "Tentatives avant réussite (plateforme)", "type": "card", "unit": "tentatives" }],
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
  "contextType": "admin",
  "requiredEvents": ["exercice.completed"],
  "thresholds": { "good": 2, "warning": 4 },
  "visualizations": [{ "label": "Tentatives avant réussite (plateforme)", "type": "card", "unit": "tentatives" }],
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

`line-chart` affiche `result.metadata.history`, jamais alimenté par
`computeView` (toujours `[]`) - la courbe reste vide même avec une formule
correcte. Limite frontend connue, non résolue - éviter ce type pour les 22 cas
ci-dessus.

### Note sur le format attendu par `bar-chart` et `histogram`

- `bar-chart` : objet plat `{ "clé": valeur }` (ou tableau
  `[{key, value}]`) - une barre par clé.
- `histogram` : tableau `[{ bucket, count, userIds? }]` - une barre par
  `bucket`, `userIds` (identifiants bruts) résolus en noms par `computeView`
  via `getUserNameMap` (pas besoin de `join` sur `Users` dans la formule).
