# Guide pratique - Créer et exploiter des indicateurs

Ce guide construit **6 indicateurs**, un par `contextType` possible
(`learner`, `activity`, `course`, `group`, `teacher`, `admin`), classés du
**plus simple au plus complexe**, et conçus pour exercer **toutes** les
fonctionnalités implémentées du module Indicateurs : les 10 types d'étapes du
DSL (y compris les 4 types de jointure et les 5 fonctions d'agrégation), les 5
types de visualisation, les seuils, le multi-vue (sélection/masquage), les
familles d'indicateurs, la visibilité par rôle, les snapshots de groupe, le
recalcul, les logs d'exécution, l'aperçu/débogueur pas-à-pas, l'import/export
YAML/JSON, les recettes, et le précalcul de contexte.

> **Principe clé** : **1 indicateur = 1 formule**, partagée par toutes ses
> visualisations. Les visualisations d'un même indicateur diffèrent uniquement
> par leur représentation visuelle (type de graphique, icône, couleur, seuils),
> jamais par les données calculées. Pour mesurer des grandeurs différentes,
> il faut créer des indicateurs différents (éventuellement regroupés dans une
> même famille).

Pour la référence complète de l'architecture, du modèle de données et du
moteur DSL, voir [`readme.md`](readme.md) - ce guide s'appuie dessus et ne
répète que ce qui est nécessaire à l'action.

---

## 0. Avant de commencer

1. Lancer le backend (`cd api && nest start --watch`, port 3001) et le
   frontend (`cd frontend && ng serve`, port 4200).
2. Toute la création/gestion d'indicateurs se fait dans
   **Tableau de bord → Indicateurs** (`/dashboard/indicators`), section
   admin (`AdminIndicatorManagerComponent`).
3. **Changement de rôle** (rappel readme §8) : `localStorage` n'a aucun
   effet - éditez `frontend/src/environments/environment.ts`, champ
   `defaultUserId`, puis rechargez la page (F5). Le rôle est dérivé de cet
   utilisateur à chaque chargement.

| Rôle | UUID `defaultUserId` |
|---|---|
| **Admin** | `055dc07c-3f4a-41d8-8d2d-828b75d441b4` |
| **Enseignant** | `ee225671-e8b5-422d-9191-7189a5be58c8` |
| **Étudiant** | `e901cddd-0e08-4a3d-8aad-4d2c49f39fdd` |

4. Rappel des permissions (`role.service.ts`) :
   - `canCreateIndicators` = **Admin uniquement** → boutons "Nouvel
     indicateur" et "Créer une famille" invisibles pour les autres rôles.
   - `canManageIndicators` = Admin **ou** Enseignant → accès en lecture à la
     table de gestion.

➡️ **Pour toute la phase de création (étapes A à C ci-dessous), restez en
rôle Admin.**

---

## Plan d'ensemble

| # | Indicateur | `contextType` | Visualisations | Formule (résultat) | Nouveautés introduites |
|---|---|---|---|---|---|
| 1 | Tentatives avant réussite - Apprenant | `learner` | 1 (carte) | scalaire - avg tentatives | wizard 3 étapes, recette, `fetch`/`groupBy`/`findFirst`/`extract`/`aggregate(avg)`/`round`, seuils, recalcul |
| 2 | Tentatives avant réussite - Activité | `activity` | 2 (carte + jauge) | scalaire - **même formule pour les 2 vues** | multi-viz sur formule unique, sélection de vue (`activeVizId`), masquage (`enabledVizIds`), variante `filter` |
| 3 | Tentatives avant réussite - Cours | `course` | 1 (barres horizontales) | objet `{ressource: moy_note}` | `join` **gauche**, `js` retournant un objet structuré |
| 4 | Tentatives avant réussite - Groupe de TP | `group` | 1 (barres horizontales) | objet `{étudiant: total_tentatives}` | `useGroupContext`, **snapshots** de groupe |
| 5 | Vue d'ensemble plateforme - Enseignant | `teacher` | 1 (carte) | scalaire - avg note (sessions réelles) | `requiredEvents` vide, `fetch` global, `join` **interne**, `aggregate(avg)`, `round` |
| 6 | Diagnostic plateforme - Admin | `admin` | 2 (carte + jauge) | scalaire - count utilisateurs sans session | `join` **droite** (`right`), `js`, import/export YAML/JSON, logs d'exécution |

Les indicateurs 1 à 4 partagent une **famille** (`familyName = "Tentatives
avant réussite"`), créée en une fois via le wizard "Créer une famille". Les
indicateurs 5 et 6 sont autonomes.

---

## Étape A - Famille "Tentatives avant réussite" (indicateurs 1 à 4)

### A.0 Lancer le wizard de famille

1. `/dashboard/indicators` (rôle **Admin**) → bouton **"Créer une famille"**.
2. Dans la modale "Créer une famille d'indicateurs" :
   - **Nom de la famille** : `Tentatives avant réussite`
   - **Description** : `Nombre moyen de tentatives nécessaires avant la première réussite (note 100), décliné par contexte.`
   - **Événements déclencheurs** (champ tags) : ajouter `exercise.answered`
   - **Contextes à couvrir** (multi-sélection) : cocher dans cet ordre
     **Apprenant**, **Activité**, **Cours**, **Groupe de TP** (l'ordre de
     sélection détermine l'ordre d'enchaînement des wizards).
3. Cliquer **"Configurer les indicateurs"** → ouvre directement le builder
   pour le 1er contexte (Apprenant), pré-rempli avec le nom
   `Tentatives avant réussite - Apprenant`, la description et
   `requiredEvents = [exercise.answered]`.

À chaque "Créer", la modale se ferme et celle du contexte suivant s'ouvre
automatiquement, jusqu'au dernier (Groupe de TP).

---

### A.1 Indicateur 1/6 - Apprenant (`learner`) - LE PLUS SIMPLE

**Étape 1 « Définition »** (déjà pré-remplie par la famille) : vérifier
nom, description, `requiredEvents = [exercise.answered]`.

**Étape 2 « Contexte »** : `contextType = learner` (pré-rempli). Une
visualisation "Vue principale" existe par défaut - la configurer :

| Champ | Valeur |
|---|---|
| Libellé | `Tentatives avant réussite` |
| Type | Valeur scalaire |
| Icône | `repeat` |
| Couleur | au choix (ex. bleu) |
| Unité | `tentatives` |

Puis dans la section **"Seuil de performance"** (globale, sous les visualisations) :

| Seuil | Valeur |
|---|---|
| Bon ≤ | `2` |
| Moyen ≤ | `4` |

> "Difficile" (rouge) est automatique : tout ce qui dépasse "Moyen ≤ 4".

**Étape 3 « Formule »** : cliquer sur la recette **"Tentatives avant
réussite"**. Cela applique automatiquement le pipeline :

| # | Étape | Paramètres |
|---|---|---|
| 1 | `fetch` | table `SessionData`, contextFields = `user_id`, `activity_id` |
| 2 | `groupBy` | groupField = `resource_id` |
| 3 | `findFirst` | whereField = `grade`, whereValue = `100`, sortField = `created_at` |
| 4 | `extract` | extractField = `attempts` |
| 5 | `aggregate` | aggregateFn = `avg` |
| 6 | `round` | decimals = `2` |

**Tester** :
- Dans "Tester cette formule", choisir un **Cours**, puis un
  **Utilisateur** (étudiant) dans la liste déroulante "Utilisateur".
- Cliquer **"Tester"** → un résultat scalaire (nombre) s'affiche.
- Cliquer **"Déboguer pas à pas"** → un panneau affiche le contexte effectif
  (`userId=…`, `activityId=(TARGET_ACTIVITY_ID)` si non précisé,
  `groupId=-`) puis, pour chacune des 6 étapes : type, durée, et un aperçu
  tabulaire du résultat (avec "Afficher tout" si > 5 lignes).

Cliquer **"Créer"** → enchaîne automatiquement sur l'indicateur "Activité".

#### À tester côté utilisateur (rôle Étudiant)

1. Passer `defaultUserId` sur l'**Étudiant**, F5.
2. `/dashboard/indicators` → onglet "Indicateurs" (sélecteur,
   `IndicatorSelectorComponent`) → activer l'indicateur "Tentatives avant
   réussite - Apprenant" via le **switch ✓/✗**.
3. `/dashboard/overview` → la carte apparaît, colorée selon les seuils
   configurés.

#### Manipulation admin : recalcul

1. Repasser en rôle **Admin**, F5, `/dashboard/indicators`.
2. Sur la ligne de l'indicateur, cliquer l'icône **"Recalculer"** (replay) →
   confirmer la popconfirm → message
   *"Recalcul terminé - x/y valeurs mises à jour"*. Cela recalcule la valeur
   `learner` de tous les utilisateurs ayant activé l'indicateur.

#### Variantes à explorer (débogueur pas-à-pas)

- **`findFirst` sans condition** : retirez `whereField`/`whereValue` de
  l'étape "Première réussite" (ne garder que `sortField = created_at`) →
  re-déboguer : `findFirst` prend alors la **1ère ligne triée**, peu importe
  la note - la valeur change.
- **Autres fonctions d'agrégation** : changez `aggregateFn` de `avg` à
  `max` → observez le pire cas (nombre maximal de tentatives avant réussite,
  tous exercices confondus).

---

### A.2 Indicateur 2/6 - Activité (`activity`)

**Étape 1** : nom pré-rempli `Tentatives avant réussite - Activité`. Ajouter
un second tag dans "Événements déclencheurs" : `activity.completed` (en plus
de `exercise.answered`).

**Étape 2** : `contextType = activity` (pré-rempli). Configurer **2
visualisations** - elles afficheront toutes deux le **même scalaire** calculé
par la formule unique, simplement avec des représentations visuelles
différentes :

**Vue 1 (par défaut, "Vue principale")** :

| Champ | Valeur |
|---|---|
| Libellé | `Tentatives avant réussite (carte)` |
| Type | Valeur scalaire |
| Icône | `repeat` |
| Unité | `tentatives` |

**Vue 2** : cliquer **"Ajouter une visualisation"** :

| Champ | Valeur |
|---|---|
| Libellé | `Tentatives avant réussite (jauge)` |
| Type | **Jauge** |
| Icône | `speed` |
| Unité | `tentatives` |

Puis dans la section **"Seuil de performance"** (globale, partagée par les deux vues) :

| Seuil | Valeur |
|---|---|
| Bon ≤ | `2` |
| Moyen ≤ | `4` |

> Le seuil "Bon ≤ 2" définit aussi le **maximum affiché par la jauge**.

**Étape 3 « Formule »** : cliquer sur la recette **"Tentatives avant
réussite"** - identique à A.1. Cette formule unique est partagée par la carte
et la jauge ; comme le contexte `activity` ne fournit pas de `userId`
(`computeView` ne peuple que `activityId`), le champ
`contextFields: user_id` est ignoré et le calcul porte sur **tous les
étudiants de l'activité**.

Tester (Tester + Déboguer). Cliquer **"Créer"** → enchaîne sur "Cours".

#### À tester côté utilisateur (rôle Enseignant)

1. Passer `defaultUserId` sur l'**Enseignant**, F5.
2. Aller sur `/dashboard/courses/:id/activities/:activityId` → section
   **"Indicateurs"** → carte "Tentatives avant réussite - Activité".
3. **Sélection de vue active** (`activeVizId`) : cliquer sur les **chips**
   (une par visualisation) pour basculer entre la carte et la jauge. La
   valeur numérique affichée est identique - seul le rendu visuel change.
   Ce choix est persisté en base (`user_indicator_preferences.active_viz_id`)
   et conservé après rechargement.

> Note : il n'existe pas de route d'API `/indicators/precompute-context` dans
> le backend actuel. Le sélecteur de contexte enseignant met à jour l'état
> affiché, et les cartes ou détails calculent les valeurs `course`/`group`/
> `activity` à la demande via `computeView()`.

#### Masquage de visualisation (`enabledVizIds`)

1. `/dashboard/indicators` → sélecteur → repérer cet indicateur, colonne
   **"Visualisations"** : 2 icônes (une par vue), avec info-bulle "visible -
   cliquer pour masquer" / "masquée - cliquer pour afficher".
2. Cliquer sur l'icône d'une des 2 vues → elle grise → persiste
   `enabledVizIds` (`PATCH /preferences/:indicatorId`). Sur la carte / page
   détail, seule l'autre vue reste sélectionnable.
3. Recliquer pour la réafficher. Si vous tentez de masquer la dernière vue
   restante, un message *"Vous devez garder au moins une visualisation
   active."* l'empêche.

#### Variante : étape `filter`

Ouvrir l'indicateur en édition (icône crayon), dans l'éditeur de formule
cliquer **"Ajouter une étape"** → choisir **"Filtrer"**, l'insérer entre
`fetch` et `groupBy` :

| Champ | Valeur |
|---|---|
| Champ | `grade` |
| Opérateur | `>=` |
| Valeur | `50` |

Relancer le débogueur et comparer le nombre de lignes avant/après "Filtrer",
puis la valeur finale avec/sans ce filtre. Retirer le step `filter` pour
retrouver le comportement original avant de sauvegarder.

---

### A.3 Indicateur 3/6 - Cours (`course`)

**Étape 1** : nom pré-rempli `Tentatives avant réussite - Cours`,
`requiredEvents` inchangé (`exercise.answered`).

**Étape 2** : `contextType = course`. Configurer **1 visualisation** - la
formule retournant un objet structuré `{ressource: valeur}`, seul le type
**barres horizontales** est adapté :

| Vue | Libellé | Type | Icône | Unité |
|---|---|---|---|---|
| 1 (défaut) | `Note moyenne par ressource` | Barres horizontales | `bar_chart` | *(vide)* |

Pas de seuil pour cet indicateur (résultat structuré, pas scalaire).

**Étape 3 « Formule »** : recette **"Notes moyennes par ressource"**
(construction manuelle si la recette n'existe pas) :

| # | Étape | Paramètres |
|---|---|---|
| 1 | `fetch` | table `SessionData`, contextFields = `course_id` |
| 2 | `join` | table `Resources`, **type Gauche (left)** *(par défaut)*, clé gauche `resource_id`, clé droite `id` |
| 3 | `js` | voir code ci-dessous |

Code à coller dans l'étape `js` :

```javascript
const groups = {};
for (const row of input) {
  const key = row.name || 'Inconnu';
  if (!groups[key]) groups[key] = [];
  const g = parseFloat(row.grade);
  if (!isNaN(g)) groups[key].push(g);
}
const out = {};
for (const [key, vals] of Object.entries(groups)) {
  out[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10;
}
return out;
```

Après le `join`, chaque ligne de `input` contient à la fois les champs de
`SessionData` (`grade`, `resource_id`…) et ceux de `Resources` (`name`,
`type`…). Le code groupe par `name` (nom lisible de la ressource), calcule
la moyenne des `grade` de chaque groupe, et retourne un **objet**
`{ "Nom de la ressource": note_moyenne }` - format attendu par la
visualisation **barres horizontales** (une barre par clé).

> **Pourquoi 1 seule visualisation ici ?** La formule retourne un objet
> structuré, pas un scalaire. Une carte ou une jauge n'a pas de moyen d'en
> afficher le contenu de façon utile. Quand le résultat de la formule est
> structuré (objet ou tableau), choisissez exclusivement des types de viz
> adaptés (barres, histogramme).

Tester (Tester + Déboguer). Cliquer **"Créer"** → enchaîne sur
"Groupe de TP".

#### À tester (rôle Enseignant)

1. Sélecteur de contexte enseignant → "Voir par : cours entier".
2. `/dashboard/overview` → carte "Tentatives avant réussite - Cours" →
   graphique en barres horizontales avec **noms de ressources lisibles**
   (jamais d'UUID), tronqués à 25 caractères avec info-bulle complète.

#### Variantes : tous les opérateurs `filter`

Ouvrir l'éditeur de formule et insérer un step `filter` entre `fetch` et
`join`. Tester successivement (relancer **"Déboguer pas à pas"** à chaque
fois pour observer le nombre de lignes restantes) :

| Opérateur | Valeur | Signification |
|---|---|---|
| `==` | `100` | sessions réussies uniquement |
| `!=` | `100` | sessions **non** réussies |
| `>=` | `50` | sessions avec note ≥ 50 |
| `<=` | `30` | sessions avec note ≤ 30 |
| `>`  | `0`  | sessions avec note strictement positive |
| `<`  | `100` | sessions avec note < 100 |

Retirer le step `filter` avant de sauvegarder pour conserver l'indicateur
sur toutes les sessions.

---

### A.4 Indicateur 4/6 - Groupe de TP (`group`)

**Étape 1** : nom pré-rempli `Tentatives avant réussite - Groupe de TP`.
Ajouter un second tag : `exercise.viewed` (en plus de `exercise.answered`).

**Étape 2** : `contextType = group`. Configurer **1 visualisation** - la
formule retournera un objet par étudiant, adapté aux barres :

| Vue | Libellé | Type | Icône | Unité |
|---|---|---|---|---|
| 1 (défaut) | `Tentatives par étudiant` | Barres horizontales | `groups` | *(vide)* |

**Étape 3 « Formule »** : recette **"Tentatives par étudiant (groupe)"**
(ou pipeline manuel) :

| # | Étape | Paramètres |
|---|---|---|
| 1 | `fetch` | table `SessionData`, contextFields = `activity_id`, **"Requête groupe de TP" = ON** (`useGroupContext`) |
| 2 | `join` | table `Users`, **type Gauche (left)** *(défaut)*, clé gauche `user_id`, clé droite `id` |
| 3 | `js` | voir code ci-dessous |

Code à coller dans l'étape `js` :

```javascript
const groups = {};
for (const row of input) {
  const name = ((row.first_name || '') + ' ' + (row.last_name || '')).trim()
               || row.user_id || 'Inconnu';
  if (!groups[name]) groups[name] = 0;
  groups[name] += parseInt(row.attempts) || 0;
}
return groups;
```

Après le `join`, chaque ligne a `attempts` (de `SessionData`) + `first_name`
et `last_name` (de `Users`). Le code additionne toutes les tentatives par
étudiant et retourne un objet `{ "Prénom Nom": total }` - une barre par
étudiant dans la visualisation barres horizontales.

Le switch **"Requête groupe de TP"** (`useGroupContext`) déclenche côté
backend une jointure automatique `CourseGroupsMember`/`CourseGroups` :
seules les lignes `SessionData` dont `user_id` appartient au groupe de TP
sélectionné dans le contexte sont conservées.

**Tester** : choisir un **Cours** puis un **Groupe** (`previewCtx.groupId`).
"Tester" / "Déboguer pas à pas".

Cliquer **"Créer"** → fin de la famille (4/4), la modale se ferme.

#### À tester (rôle Enseignant)

Sélecteur de contexte enseignant → "Voir par : groupe de TP" → la carte
"Tentatives avant réussite - Groupe de TP" affiche son graphique en barres
(une barre par étudiant du groupe).

#### Snapshots - fonctionnalité spécifique au contexte `group`

1. Aller sur `/dashboard/courses/:id/activities/:activityId` → section
   **"Par groupe"** (`GroupSnapshotsPanelComponent`).
2. Pour cet indicateur : **menu déroulant des groupes** → choisir un groupe
   → ajoute une `IndicatorSnapshot` (carte épinglée),
   `POST /indicators/:id/snapshots` (**409** si déjà épinglé).
3. **Éditer le titre** de la carte épinglée (édition inline) →
   `PATCH /indicators/:id/snapshots/:snapshotId`.
4. **Supprimer** la carte (popconfirm) →
   `DELETE /indicators/:id/snapshots/:snapshotId`.
5. Les snapshots sont **rafraîchis automatiquement** à chaque ingestion
   d'événement PLaTon pour cette activité (`IngestionService` →
   `refreshSnapshots()`, fire-and-forget).

#### Variante : type de jointure

Dans l'éditeur de formule, changez le **"Type de jointure"** de `Gauche` à
`Interne (inner)` puis relancez le débogueur : avec `inner`, un étudiant du
groupe sans aucune ligne correspondante dans `Users` disparaîtrait du résultat
(alors qu'il restait avec `left`). Remettez `Gauche` avant de sauvegarder.

#### Variante : `aggregate(sum)` sur un scalaire

Pour illustrer la fonction `sum`, remplacer le pipeline par :

| # | Étape | Paramètres |
|---|---|---|
| 1 | `fetch` | table `SessionData`, contextFields = `activity_id`, **"Requête groupe de TP" = ON** |
| 2 | `extract` | extractField = `attempts` |
| 3 | `aggregate` | aggregateFn = **`sum`** |

Ce pipeline retourne un **scalaire** (total de toutes les tentatives du
groupe) - compatible avec carte ou jauge si l'on ajoute une 2ᵉ visualisation.
Ne pas sauvegarder, c'est une exploration.

---

## Étape B - Indicateur 5/6 - Enseignant (`teacher`) - autonome

Cet indicateur n'appartient à aucune famille. `/dashboard/indicators` →
bouton **"Nouvel indicateur"**.

**Étape 1** :
- Nom : `Vue d'ensemble plateforme`
- Description : `Indicateurs globaux non personnalisés, à destination des enseignants.`
- **Événements déclencheurs : laisser vide.** Sans `requiredEvents`, la valeur
  n'est mise à jour que par le cron quotidien ou par un recalcul manuel.

**Étape 2** : `contextType = teacher`. Configurer **1 visualisation** :

| Vue | Libellé | Type | Icône | Unité |
|---|---|---|---|---|
| 1 (défaut) | `Note moyenne des étudiants` | Carte | `school` | `/100` |

Section **"Seuil de performance"** :

| Seuil | Valeur |
|---|---|
| Bon ≤ | `80` |
| Moyen ≤ | `50` |

**Étape 3 « Formule »** : pipeline **manuel** :

| # | Étape | Paramètres |
|---|---|---|
| 1 | `fetch` | table `SessionData`, contextFields = **(vide)** - requête globale |
| 2 | `join` | table `Activities`, **type Interne (inner)**, clé gauche `activity_id`, clé droite `id` |
| 3 | `extract` | extractField = `grade` |
| 4 | `aggregate` | aggregateFn = `avg` |
| 5 | `round` | decimals = `1` |

La jointure **interne** ne conserve que les sessions dont l'activité existe
réellement en base - ce qui filtre les données corrompues ou les sessions
orphelines. `extract(grade)` + `aggregate(avg)` + `round` donnent la note
moyenne réelle des étudiants sur toute la plateforme.

> Pour les pipelines sans `contextFields`, la sélection Cours/Activité/
> Groupe/Utilisateur du panneau "Tester" n'a aucune influence sur le résultat.

Cliquer **"Créer"**.

#### À tester (rôle Enseignant)

1. Passer `defaultUserId` sur l'**Enseignant**, F5.
2. `/dashboard/overview` → carte de cet indicateur (contexte "orphelin"
   `teacher` : `contextId = userId de l'enseignant`).
3. Comme `requiredEvents` est vide, la valeur n'existe pas tant qu'elle n'a
   pas été calculée. Repassez en **Admin**, `/dashboard/indicators`, cliquez
   **"Recalculer"** sur cet indicateur, puis revenez en Enseignant et
   rechargez.

---

## Étape C - Indicateur 6/6 - Admin (`admin`) - LE PLUS COMPLEXE

Toujours en rôle **Admin** : `/dashboard/indicators` → **"Nouvel
indicateur"**.

**Étape 1** :
- Nom : `Diagnostic plateforme`
- Description : `Nombre d'utilisateurs inscrits n'ayant jamais soumis d'exercice.`
- **Événements déclencheurs** : `exercise.answered`

**Étape 2** : `contextType = admin`. Configurer **2 visualisations** - la
formule retourne un scalaire, la carte et la jauge l'affichent différemment :

| Vue | Libellé | Type | Icône | Unité |
|---|---|---|---|---|
| 1 (défaut) | `Utilisateurs sans session (carte)` | Carte | `person_off` | `utilisateurs` |
| 2 (ajoutée) | `Utilisateurs sans session (jauge)` | **Jauge** | `speed` | `utilisateurs` |

Section **"Seuil de performance"** (partagé par les deux vues) :

| Seuil | Valeur |
|---|---|
| Bon ≤ | `5` |
| Moyen ≤ | `20` |

*(ajustez selon le nombre total d'utilisateurs sur votre plateforme)*

**Étape 3 « Formule »** : pipeline **manuel** :

| # | Étape | Paramètres |
|---|---|---|
| 1 | `fetch` | table `SessionData`, contextFields = **(vide)** |
| 2 | `join` | table `Users`, **type Droite (right)**, clé gauche `user_id`, clé droite `id` |
| 3 | `js` | voir code ci-dessous |

```javascript
let count = 0;
for (const row of input) {
  if (!row.activity_id) count++;
}
return count;
```

Après un `join right`, les utilisateurs sans aucune session apparaissent comme
des lignes avec tous les champs de `SessionData` à `null` (dont `activity_id`).
Le code JS compte ces lignes et retourne le nombre d'utilisateurs inscrits
n'ayant jamais soumis d'exercice - une vraie métrique de diagnostic sur
l'engagement.

Tester sans sélectionner de Cours ni d'Utilisateur (requête globale). Au
débogueur, l'étape 2 (join) montre des lignes avec `activity_id = null` - ce
sont les utilisateurs sans session. L'étape 3 retourne leur nombre.

Cliquer **"Créer"**.

#### Variante : import / export YAML / JSON (round-trip)

1. Cliquer **"Import"** → le panneau s'ouvre pré-rempli avec le pipeline
   courant sérialisé.
2. Cliquer **"Référence YAML"** → documentation inline des 10 types d'étapes.
3. Modifier un détail dans le YAML (ex. le `label` du step `js` →
   `Compter les utilisateurs sans session`), puis cliquer **"Appliquer"**.
4. Basculer en **JSON** → vérifier que le pipeline est identique.
5. Tester le bouton **"Fichier"** : exporter dans un `.yaml`, puis
   ré-importer via le sélecteur de fichier.
6. Revenir en mode **"Visuel"** → vérifier que le `label` modifié apparaît
   sur l'étape js.

> **Escape hatch** : une étape avec un `type` inconnu mais un `params.code`
> non vide est automatiquement convertie en étape `js`.

#### À tester (rôle Admin)

`/dashboard/overview` (rôle Admin) → carte "Diagnostic plateforme" avec ses
2 vues (chips carte / jauge).

---

## Étape D - Manipulation / configuration côté utilisateur (récapitulatif)

Ces actions sont disponibles dès qu'au moins un des 6 indicateurs existe ;
exercez-les sur n'importe lequel d'entre eux dans
`/dashboard/indicators` (sélecteur) :

- **Activer / désactiver** un indicateur dans son tableau de bord - switch
  ✓/✗ sur chaque ligne (`toggleIndicator`, persiste dans
  `UserDashboardSettings.activeIndicators`).
- **Filtres de la liste** :
  - "Filtrer par contexte" : Tous les contextes / Cours / Activité /
    Apprenant / Groupe / Enseignant / Admin.
  - "Trier par" : Nom / Plus utilisés / Moins utilisés (`usageCount`).
  - "Familles / indicateurs uniques" : Familles + indicateurs uniques /
    Familles uniquement / Indicateurs uniques.
- **Voir le détail** (icône œil) → modale avec : badge actif/inactif, badge
  "Famille : …" si applicable, description, contextes, déclencheurs (libellés
  français pour les non-admins, codes bruts pour l'admin), mode de mise à
  jour ("Temps réel" / "Cron quotidien"), nombre d'utilisations, et la liste
  des visualisations avec leur type et icône.
- **Familles repliables** : ligne violette avec chevron + badge "N
  indicateurs" - cliquer pour déplier/replier (`toggleFamily`,
  `buildIndicatorDisplayRows`). Avec le filtre "Familles uniquement", seule
  la famille "Tentatives avant réussite" (4 membres) doit apparaître.
- **Renommer une famille** (icône crayon sur la ligne de famille, onglet
  Administration) → modale de saisie → met à jour le `familyName` de tous
  les membres en parallèle.
- **Sélection de vue active** + **masquage de vues** : voir étapes A.2.

---

## Étape E - Test de la visibilité par rôle

Table de référence (`RoleService.INDICATOR_VISIBILITY`) :

| `contextType` | Rôles qui voient l'indicateur |
|---|---|
| `learner` | `student` |
| `teacher` | `teacher` |
| `admin` | `admin` |
| `course` | tous (`student`, `teacher`, `admin`, `demo`) |
| `activity` | tous |
| `group` | `teacher`, `admin` |

Pour chaque rôle, basculez `defaultUserId` (table de l'étape 0) + F5, puis
ouvrez `/dashboard/indicators` (sélecteur) et vérifiez :

| Rôle | Indicateurs **visibles** parmi les 6 | Indicateurs **masqués** |
|---|---|---|
| Étudiant | Apprenant, Activité, Cours | Groupe de TP, Enseignant, Admin |
| Enseignant | Activité, Cours, Groupe de TP, Enseignant | Apprenant, Admin |
| Admin | Activité, Cours, Groupe de TP, Admin | Apprenant, Enseignant |

> `AdminIndicatorManagerComponent` (la table de **gestion**, étapes A à C)
> **n'applique pas** ce filtre - il montre toujours les 6 indicateurs, quel
> que soit le rôle courant. C'est volontaire : c'est l'outil d'administration.

---

## Étape F - Outils admin avancés

Toujours dans `/dashboard/indicators` (rôle **Admin**), table de gestion :

- **Modifier** (icône crayon) → rouvre le builder hydraté (`hydrate()`) avec
  les valeurs existantes, y compris la formule DSL prête à être éditée.
- **Logs d'exécution** (icône document) → table Date / userId (tronqué) /
  Valeur / Durée / Erreur (`GET /indicators/:id/logs?limit=100`). Les lignes
  en erreur apparaissent en rouge.
- **Recalculer** (icône replay, popconfirm) →
  `POST /indicators/:id/recalculate` : recalcule les valeurs pour tous les
  utilisateurs concernés.
- **Switch actif/inactif** (`isActive`) → `PATCH /indicators/:id/status` : un
  indicateur désactivé disparaît de `GET /indicators` (liste active, donc du
  sélecteur utilisateur) mais reste dans `GET /indicators/all` (gestion
  admin). Testez-le sur l'indicateur 5 "Vue d'ensemble plateforme" : désactivez,
  vérifiez sa disparition du tableau de bord enseignant, puis réactivez.
- **Supprimer** (icône corbeille rouge, popconfirm) →
  `DELETE /indicators/:id`.

   Pour exercer cette action sans perdre l'un des 6 indicateurs du guide,
  créez d'abord un **7ᵉ indicateur jetable** (n'importe quel contexte, nom
  `Test suppression`, sans formule particulière), puis supprimez-le
  immédiatement.

- **Schéma PLaTon** (`GET /indicators/schema`) : déjà utilisé implicitement à
  chaque fois que vous avez ouvert un sélecteur "Table" ou "Colonnes de
  filtre" dans le builder - c'est ce endpoint qui peuple ces listes
  (`platonSchema`, avec mise en cache `_colsCache`).
- Les sélections de contexte enseignant ne déclenchent pas de route de
  pré-calcul dédiée : elles sont stockées dans `DashboardSettingsService` et
  les valeurs `course`/`group`/`activity` sont calculées par `computeView()`
  lorsque les cartes ou la page détail sont affichées.

### À propos de `joinContextFields`

Le champ **"Filtrer par contexte"** de l'étape `join` (paramètre
`joinContextFields`) permet de filtrer la **table jointe** par les mêmes
colonnes de contexte que `fetch` (`user_id`, `activity_id`, `course_id`).
Aucun des 6 indicateurs de ce guide n'en a besoin : les jointures utilisées
(`Resources`, `Users`, `Courses`) ne possèdent pas de colonnes de contexte
pertinentes pour ce filtrage côté table jointe. Exemple d'usage hypothétique :
dans une formule de contexte `course`, une étape `join` sur `Activities` avec
`joinContextFields: ['course_id']` ne conserverait que les activités du cours
courant.

### Note sur le type de visualisation "Graphique ligne"

La visualisation **ligne** (`line-chart`) affiche `result.metadata.history`,
qui n'est **jamais alimenté** par `computeView` (toujours `[]`, voir readme
§13). La courbe s'affichera donc vide même si la formule retourne une valeur
correcte. Ce type de visualisation est disponible dans le builder (icône,
seuils, couleur configurables) mais reste une limite frontend non résolue.

### Note sur le type de visualisation "Histogramme"

L'histogramme attend un tableau de buckets `[{ bucket, count }]`. Cela
nécessite une étape `js` produisant ce format - la formule ne peut donc pas
aussi retourner un scalaire utilisable par une carte. Pour tester ce type :
créer un **indicateur jetable** (`contextType = group`, 1 viz histogramme),
utiliser le pipeline de la section A.4 "Distribution des notes" ci-dessous.

Pipeline histogramme (groupe, contextType = `group`) :

| # | Étape | Paramètres |
|---|---|---|
| 1 | `fetch` | table `SessionData`, contextFields = `activity_id`, **"Requête groupe de TP" = ON** |
| 2 | `js` | voir code ci-dessous |

```javascript
const buckets = [
  { label: '0-25',   min: 0,  max: 25 },
  { label: '25-50',  min: 25, max: 50 },
  { label: '50-75',  min: 50, max: 75 },
  { label: '75-100', min: 75, max: 100 },
];
const result = buckets.map(b => ({ bucket: b.label, count: 0 }));
for (const row of input) {
  const grade = parseFloat(row.grade);
  if (isNaN(grade)) continue;
  const idx = Math.min(Math.floor(grade / 25), 3);
  result[idx].count++;
}
return result;
```
