# Guide pratique - Créer et exploiter des indicateurs

Ce guide construit **6 indicateurs**, un par `contextType` possible
(`learner`, `activity`, `course`, `group`, `teacher`, `admin`), classés du
**plus simple au plus complexe**, et conçus pour exercer **toutes** les
fonctionnalités implémentées du module Indicateurs : les 10 types d'étapes du
DSL (y compris les 4 types de jointure et les 5 fonctions d'agrégation), les 5
types de visualisation, les seuils, le multi-vue (sélection/masquage), les
familles d'indicateurs, la visibilité par rôle, les snapshots de groupe, le
recalcul, l'historique/rollback, les logs d'exécution, l'aperçu/débogueur
pas-à-pas, l'import/export YAML/JSON, les recettes, et le précalcul de
contexte.

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

| # | Indicateur | `contextType` | Visualisations | Nouveautés introduites |
|---|---|---|---|---|
| 1 | Tentatives avant réussite - Apprenant | `learner` | 1 (carte) | wizard 3 étapes, recette, `fetch`/`groupBy`/`findFirst`/`extract`/`aggregate(avg)`/`round`, seuils carte, activation, recalcul |
| 2 | Tentatives avant réussite - Activité | `activity` | 2 (carte + jauge) | multi-vue, jauge + seuils jauge, sélection de vue active (`activeVizId`), masquage de vue (`enabledVizIds`), recette "Note moyenne", étape `filter` (variante) |
| 3 | Tentatives avant réussite - Cours | `course` | 3 (carte, carte, barres) | `filter` + `aggregate(count)`, `join` (gauche, implicite) + `js` → objet, recette "Notes moyennes par ressource" |
| 4 | Tentatives avant réussite - Groupe de TP | `group` | 3 (barres, carte, histogramme) | `useGroupContext`, `join` avec `Users`, `aggregate(sum)`, histogramme, **snapshots** |
| 5 | Vue d'ensemble plateforme - Enseignant | `teacher` | 2 (cartes) | `requiredEvents` vide (cron uniquement), `fetch` global (`contextFields: []`), `join` **interne** (inner), `divide` + `round` |
| 6 | Diagnostic plateforme - Admin | `admin` | 4 (carte, carte, courbe, barres) | `aggregate(min)`/`aggregate(max)`, `join` **complète** (full) et **droite** (right), code JS avancé, courbe, **historique/rollback**, **logs d'exécution**, import/export YAML/JSON |

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

**Étape 2 « Contexte »** : `contextType = learner` (pré-rempli, en tête de
la liste déroulante). Une visualisation "Vue principale" existe par défaut -
la configurer :

| Champ | Valeur |
|---|---|
| Libellé | `Tentatives avant réussite` |
| Type | Carte (valeur scalaire) |
| Icône | `repeat` |
| Couleur | au choix (ex. bleu) |
| Unité | `tentatives` |
| Seuils | Bon ≤ `2` · Moyen ≤ `4` · Critique > `4` |

**Étape 3 « Formules »** : cliquer sur la recette **"Tentatives avant
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

####  À tester côté utilisateur (rôle Étudiant)

1. Passer `defaultUserId` sur l'**Étudiant**, F5.
2. `/dashboard/indicators` → onglet "Indicateurs" (sélecteur,
   `IndicatorSelectorComponent`) → activer l'indicateur "Tentatives avant
   réussite - Apprenant" via le **switch ✓/✗**.
3. `/dashboard/overview` → la carte apparaît, colorée selon les seuils
   configurés.

####  Manipulation admin : recalcul

1. Repasser en rôle **Admin**, F5, `/dashboard/indicators`.
2. Sur la ligne de l'indicateur, cliquer l'icône **"Recalculer"** (replay) →
   confirmer la popconfirm → message
   *"Recalcul terminé - x/y valeurs mises à jour"*. Cela recalcule la valeur
   `learner` de tous les utilisateurs ayant activé l'indicateur (ici
   l'étudiant de l'étape précédente).

####  Variantes à explorer (débogueur pas-à-pas)

- **`findFirst` sans condition** : retirez `whereField`/`whereValue` de
  l'étape "Première réussite" (ne garder que `sortField = created_at`) →
  re-déboguer : `findFirst` prend alors la **1ère ligne triée**, peu importe
  la note - la valeur change.
- **Autres fonctions d'agrégation** : changez `aggregateFn` de `avg` à
  `max` → observez le pire cas (nombre maximal de tentatives avant
  réussite, tous exercices confondus).

---

### A.2 Indicateur 2/6 - Activité (`activity`)

**Étape 1** : nom pré-rempli `Tentatives avant réussite - Activité`. Ajouter
un second tag dans "Événements déclencheurs" : `activity.completed` (en plus
de `exercise.answered`) - démontre l'édition d'un champ multi-tags
pré-rempli.

**Étape 2** : `contextType = activity` (pré-rempli). Configurer 2
visualisations :

**Vue 1 (par défaut, "Vue principale")** :

| Champ | Valeur |
|---|---|
| Libellé | `Note moyenne` |
| Type | Carte (valeur scalaire) |
| Icône | `star` |
| Unité | *(laisser vide)* |
| Seuils | Bon ≤ `80` · Moyen ≤ `50` · Critique > `50` |

**Vue 2** : cliquer **"Ajouter une visualisation"** (le type proposé par
défaut suit le cycle carte → barres → histogramme → jauge → ligne ; changez-le
si besoin) :

| Champ | Valeur |
|---|---|
| Libellé | `Tentatives avant réussite` |
| Type | **Jauge** |
| Icône | `repeat` |
| Unité | `tentatives` |
| Seuils | Bon ≤ `5` · Moyen ≤ `8` · Critique > `8` (le seuil "Bon" définit aussi le maximum affiché par la jauge) |

**Étape 3** :
- Onglet **"Note moyenne"** : recette **"Note moyenne"** →
  `fetch (contextFields: user_id, activity_id)` → `extract(grade)` →
  `aggregate(avg)` → `round(1)`.
- Onglet **"Tentatives avant réussite"** : recette **"Tentatives avant
  réussite"** (même pipeline qu'à l'étape A.1). Comme le contexte `activity`
  ne fournit pas de `userId` (`computeView` ne peuple que `activityId`), le
  champ `contextFields: user_id` de l'étape `fetch` est ignoré et le calcul
  porte sur **tous les étudiants de l'activité**.

Tester chaque onglet (Tester + Déboguer). Cliquer **"Créer"** → enchaîne sur
"Cours".

####  À tester côté utilisateur (rôle Enseignant)

1. Passer `defaultUserId` sur l'**Enseignant**, F5.
2. `/dashboard/overview` → utiliser le **sélecteur de contexte enseignant**
   (`TeacherContextSelectorComponent`) : Cours → Activité → "Voir par : cours
   entier" ou activité. Cette sélection déclenche en arrière-plan
   `POST /indicators/precompute-context` (`precomputeContext()`,
   fire-and-forget) qui pré-calcule toutes les valeurs `course`/`group`/
   `activity` pour ce contexte avant même qu'on clique sur une carte.
3. Aller sur `/dashboard/courses/:id/activities/:activityId` → section
   **"Indicateurs"** → carte "Tentatives avant réussite - Activité".
4. **Sélection de vue active** (`activeVizId`) : cliquer sur les **chips**
   (une par visualisation) pour basculer entre "Note moyenne" (carte) et
   "Tentatives avant réussite" (jauge). Ce choix est persisté en base
   (`user_indicator_preferences.active_viz_id` via `setVizPreference`) -
   recharger la page : le choix est conservé, et identique entre la carte et
   la page détail (`/dashboard/indicator/:id`).

####  Masquage de visualisation (`enabledVizIds`)

1. `/dashboard/indicators` → sélecteur → repérer cet indicateur, colonne
   **"Visualisations"** : 2 icônes (une par vue), avec info-bulle "visible -
   cliquer pour masquer" / "masquée - cliquer pour afficher".
2. Cliquer sur l'icône d'une des 2 vues → elle grise → persiste
   `enabledVizIds` (`PATCH /preferences/:indicatorId`). Sur la carte / page
   détail, seule l'autre vue reste sélectionnable.
3. Recliquer pour la réafficher. Si vous tentez de masquer la dernière vue
   restante, un message *"Vous devez garder au moins une visualisation
   active."* l'empêche.

####  Variante : étape `filter`

Sur l'onglet "Note moyenne", cliquer **"Ajouter une étape"** → choisir
**"Filtrer"**, l'insérer entre `fetch` et `extract` :

| Champ | Valeur |
|---|---|
| Champ | `grade` |
| Opérateur | `>=` |
| Valeur | `50` |

Renommez la vue "Note moyenne (réussites ≥ 50)" et comparez via le débogueur
le nombre de lignes avant/après l'étape "Filtrer", et la valeur finale
avec/sans ce filtre.

---

### A.3 Indicateur 3/6 - Cours (`course`)

**Étape 1** : nom pré-rempli `Tentatives avant réussite - Cours`,
`requiredEvents` inchangé (`exercise.answered`).

**Étape 2** : `contextType = course`. Configurer **3 visualisations** :

| Vue | Libellé | Type | Icône | Unité | Seuils |
|---|---|---|---|---|---|
| 1 (défaut) | `Tentatives avant réussite (cours)` | Carte | `repeat` | `tentatives` | Bon ≤ `2` · Moyen ≤ `4` · Critique > `4` |
| 2 (ajoutée) | `Exercices réussis` | Carte | `check_circle` | `exercices` | Bon ≤ `10` · Moyen ≤ `5` · Critique > `0` *(à ajuster selon votre jeu de données)* |
| 3 (ajoutée) | `Notes moyennes par ressource` | Barres horizontales | `bar_chart` | *(vide - pas de seuils pour ce type)* | - |

**Étape 3** :

- Onglet **"Tentatives avant réussite (cours)"** : recette **"Tentatives
  avant réussite"** (identique à A.1/A.2 - comme pour `activity`, le contexte
  `course` ne fournit pas de `userId`, donc le calcul porte sur tous les
  étudiants).
- Onglet **"Exercices réussis"** : recette **"Exercices réussis"** →

  | # | Étape | Paramètres |
  |---|---|---|
  | 1 | `fetch` | table `SessionData`, contextFields = `user_id`, `activity_id` |
  | 2 | `filter` | field `grade`, opérateur `==`, valeur `100` |
  | 3 | `extract` | extractField = `resource_id` |
  | 4 | `aggregate` | aggregateFn = `count` |

- Onglet **"Notes moyennes par ressource"** : recette **"Notes moyennes par
  ressource"** →

  | # | Étape | Paramètres |
  |---|---|---|
  | 1 | `fetch` | table `SessionData`, contextFields = `user_id`, `activity_id` |
  | 2 | `join` | table `Resources`, **type Gauche (left)** *(par défaut, ne pas modifier)*, clé gauche `resource_id`, clé droite `id` |
  | 3 | `js` | calcule la moyenne des notes par ressource (objet `{ "Nom de la ressource": moyenne }`) |

  Cette dernière étape illustre une **jointure gauche** suivie d'un **code
  JS** qui transforme un tableau de lignes en **objet** `{clé: valeur}`,
  format attendu par la visualisation **barres horizontales**.

Tester chaque onglet (Tester + Déboguer). Cliquer **"Créer"** → enchaîne sur
"Groupe de TP".

####  À tester (rôle Enseignant)

1. Sélecteur de contexte enseignant → "Voir par : cours entier".
2. `/dashboard/overview` → carte "Tentatives avant réussite - Cours" avec ses
   3 vues (chips). Sélectionner "Notes moyennes par ressource" → graphique en
   barres horizontales avec **noms de ressources lisibles** (jamais d'UUID),
   tronqués à 25 caractères avec info-bulle complète.

####  Masquage (rappel)

Comme à l'étape A.2, masquez la vue "Exercices réussis" via le sélecteur
(icônes "Visualisations") pour ne garder que 2 vues actives, puis
réaffichez-la.

####  Variantes : tous les opérateurs `filter`

Sur l'onglet "Exercices réussis", éditez l'étape "Filtrer" et testez
successivement (en relançant **"Déboguer pas à pas"** à chaque fois pour
observer le nombre de lignes restantes après l'étape "Filtrer") :

| Opérateur | Valeur | Signification |
|---|---|---|
| `==` | `100` | exercices réussis du premier coup *(valeur de départ de la recette)* |
| `!=` | `100` | exercices **non** réussis |
| `>=` | `50` | exercices avec note ≥ 50 |
| `<=` | `30` | exercices avec note ≤ 30 |
| `>`  | `0`  | exercices avec une note strictement positive |
| `<`  | `100` | exercices avec une note < 100 |

Remettez `==` / `100` à la fin pour conserver le comportement "Exercices
réussis" attendu.

---

### A.4 Indicateur 4/6 - Groupe de TP (`group`)

**Étape 1** : nom pré-rempli `Tentatives avant réussite - Groupe de TP`.
Ajouter un second tag : `exercise.viewed` (en plus de `exercise.answered`).

**Étape 2** : `contextType = group`. Configurer **3 visualisations** :

| Vue | Libellé | Type | Icône | Unité | Seuils |
|---|---|---|---|---|---|
| 1 (défaut) | `Tentatives par étudiant` | Barres horizontales | `groups` | *(vide)* | - |
| 2 (ajoutée) | `Total tentatives du groupe` | Carte | `analytics` | `tentatives` | Bon ≤ `20` · Moyen ≤ `40` · Critique > `40` |
| 3 (ajoutée) | `Distribution des notes du groupe` | Histogramme | `leaderboard` | *(vide)* | - |

**Étape 3** :

- Onglet **"Tentatives par étudiant"** : recette **"Tentatives par étudiant
  (groupe)"** →

  | # | Étape | Paramètres |
  |---|---|---|
  | 1 | `fetch` | table `SessionData`, contextFields = `group_id`, `activity_id`, **"Requête groupe de TP" = ON** (`useGroupContext`) |
  | 2 | `join` | table `Users`, **type Gauche (left)** *(défaut)*, clé gauche `user_id`, clé droite `id` |
  | 3 | `js` | additionne `attempts` par étudiant → objet `{ "Prénom Nom": total }` |

  Le switch **"Requête groupe de TP"** (`useGroupContext`) déclenche côté
  backend une jointure automatique `CourseGroupsMember`/`CourseGroups` :
  seules les lignes `SessionData` dont `user_id` appartient au groupe de TP
  sélectionné dans le contexte sont conservées (nécessite `activityId`).

- Onglet **"Total tentatives du groupe"** - pipeline **manuel**, via
  **"Ajouter une étape"** :

  | # | Étape | Paramètres |
  |---|---|---|
  | 1 | `fetch` | table `SessionData`, contextFields = `group_id`, `activity_id`, **"Requête groupe de TP" = ON** |
  | 2 | `extract` | extractField = `attempts` |
  | 3 | `aggregate` | aggregateFn = **`sum`** |

- Onglet **"Distribution des notes du groupe"** - pipeline **manuel** :

  | # | Étape | Paramètres |
  |---|---|---|
  | 1 | `fetch` | table `SessionData`, contextFields = `group_id`, `activity_id`, **"Requête groupe de TP" = ON** |
  | 2 | `join` | table `Users`, type **Gauche (left)**, clé gauche `user_id`, clé droite `id` |
  | 3 | `js` | code ci-dessous → tableau `[{ bucket, count, users }]`, format attendu par l'histogramme |

  Code de l'étape `js` :

  ```js
  const buckets = [
    { label: '0-25',   min: 0,  max: 25 },
    { label: '25-50',  min: 25, max: 50 },
    { label: '50-75',  min: 50, max: 75 },
    { label: '75-100', min: 75, max: 100 },
  ];
  const result = buckets.map(b => ({ bucket: b.label, count: 0, users: [] }));
  for (const row of input) {
    const grade = parseFloat(row.grade);
    if (isNaN(grade)) continue;
    const idx = Math.min(Math.floor(grade / 25), 3);
    result[idx].count++;
    const name = (row.first_name && row.last_name)
      ? `${row.first_name} ${row.last_name}`
      : row.user_id;
    if (!result[idx].users.includes(name)) result[idx].users.push(name);
  }
  return result;
  ```

**Tester** : dans "Tester cette formule", choisir un **Cours** puis un
**Groupe** (`previewCtx.groupId`) - pas besoin de sélectionner d'utilisateur
pour ce contexte. "Tester" / "Déboguer pas à pas".

Cliquer **"Créer"** → fin de la famille (4/4), la modale se ferme.

####  À tester (rôle Enseignant)

Sélecteur de contexte enseignant → "Voir par : groupe de TP" → la carte
"Tentatives avant réussite - Groupe de TP" affiche ses 3 vues (chips :
barres / carte / histogramme).

####  Snapshots - fonctionnalité spécifique au contexte `group`

1. Aller sur `/dashboard/courses/:id/activities/:activityId` → section
   **"Par groupe"** (`GroupSnapshotsPanelComponent`), distincte de la section
   "Indicateurs" (qui ne montre que les indicateurs `activity`).
2. Pour l'indicateur "Tentatives avant réussite - Groupe de TP" : utiliser le
   **menu déroulant des groupes** (les groupes déjà épinglés sont masqués) →
   choisir un groupe → ajoute une `IndicatorSnapshot` (carte épinglée),
   `POST /indicators/:id/snapshots` (**409** si le groupe est déjà épinglé,
   géré côté UI).
3. **Éditer le titre** de la carte épinglée (édition inline) →
   `PATCH /indicators/:id/snapshots/:snapshotId`.
4. **Supprimer** la carte (popconfirm) →
   `DELETE /indicators/:id/snapshots/:snapshotId`.
5. Ces snapshots sont **rafraîchis automatiquement**
   (`forceRefresh = true`, pour les 3 visualisations) à chaque ingestion
   d'événement PLaTon pour cette activité (`IngestionService` →
   `refreshSnapshots()`, fire-and-forget) - aucune action manuelle requise
   pour observer ce mécanisme en usage normal de la plateforme.

####  Variante : type de jointure

Sur l'onglet "Tentatives par étudiant", changez le **"Type de jointure"** de
`Gauche` à `Interne (inner)` puis relancez le débogueur : avec `inner`, un
étudiant du groupe qui n'aurait **aucune** ligne correspondante dans `Users`
disparaîtrait du résultat (alors qu'il restait avec `left`). Remettez
`Gauche` ensuite.

---

## Étape B - Indicateur 5/6 - Enseignant (`teacher`) - autonome

Cet indicateur n'appartient à aucune famille. `/dashboard/indicators` →
bouton **"Nouvel indicateur"**.

**Étape 1** :
- Nom : `Vue d'ensemble plateforme`
- Description : `Indicateurs globaux non personnalisés, à destination des enseignants.`
- **Événements déclencheurs : laisser vide.** Sans `requiredEvents`, le
  détail de l'indicateur affichera *"Cron quotidien uniquement"* au lieu de
  *"Temps réel à chaque événement"* - la valeur n'est alors mise à jour que
  par le cron quotidien ou par un recalcul manuel (voir plus bas).

**Étape 2** : `contextType = teacher`. Pour ce contexte, `computeView`
construit `formulaContext = { userId: <id enseignant>, activityId:
undefined }` - **pas de fallback `TARGET_ACTIVITY_ID`** (contrairement à
`learner`). Configurer **2 visualisations** :

| Vue | Libellé | Type | Icône | Unité | Seuils |
|---|---|---|---|---|---|
| 1 (défaut) | `Activités liées à un cours` | Carte | `school` | `activités` | Bon ≤ `5` · Moyen ≤ `2` · Critique > `0` *(à ajuster)* |
| 2 (ajoutée) | `Volume hebdomadaire moyen` | Carte | `timeline` | `sessions/jour` | Bon ≤ `50` · Moyen ≤ `100` · Critique > `100` *(à ajuster)* |

**Étape 3** - pipelines **manuels** (pas de recette adaptée) :

- Onglet **"Activités liées à un cours"** :

  | # | Étape | Paramètres |
  |---|---|---|
  | 1 | `fetch` | table **`Activities`**, contextFields = **(laisser vide - aucune sélection)** → requête globale, non filtrée par contexte |
  | 2 | `join` | table **`Courses`**, **type Interne (inner)**, clé gauche `course_id`, clé droite `id`, "Filtrer par contexte" = vide |
  | 3 | `extract` | extractField = `id` |
  | 4 | `aggregate` | aggregateFn = `count` |

  La jointure **interne** ne conserve que les activités dont le `course_id`
  correspond effectivement à un cours existant - `extract` + `aggregate
  (count)` donnent leur nombre.

- Onglet **"Volume hebdomadaire moyen"** :

  | # | Étape | Paramètres |
  |---|---|---|
  | 1 | `fetch` | table `SessionData`, contextFields = **(vide)** |
  | 2 | `extract` | extractField = `id` |
  | 3 | `aggregate` | aggregateFn = `count` |
  | 4 | `divide` | diviser par `7` |
  | 5 | `round` | decimals = `1` |

  Cette dernière vue illustre les étapes **`divide`** (constante de division)
  et **`round`**, ici utilisées pour estimer un nombre moyen de sessions par
  jour sur une semaine.

>  Pour des pipelines avec `contextFields: []` (requêtes globales), la
> sélection Cours/Activité/Groupe/Utilisateur du panneau "Tester" n'a aucune
> influence sur le résultat - le pipeline ignore le contexte. "Tester" /
> "Déboguer pas à pas" fonctionnent normalement.

Cliquer **"Créer"**.

####  À tester (rôle Enseignant)

1. Passer `defaultUserId` sur l'**Enseignant**, F5.
2. `/dashboard/overview` affiche cet indicateur dans le tableau de bord
   personnel de l'enseignant - un `contextType: 'teacher'` est traité comme
   un contexte "orphelin" : `contextId = son propre userId`, exactement comme
   le flux `learner` (readme §8).
3. Comme `requiredEvents` est vide, la valeur n'existe pas tant qu'elle n'a
   pas été calculée au moins une fois. Repassez en **Admin**,
   `/dashboard/indicators`, et cliquez **"Recalculer"** sur cet indicateur
   pour initialiser sa valeur, puis revenez en Enseignant et rechargez.

---

## Étape C - Indicateur 6/6 - Admin (`admin`) - LE PLUS COMPLEXE

Toujours en rôle **Admin** : `/dashboard/indicators` → **"Nouvel
indicateur"**.

**Étape 1** :
- Nom : `Diagnostic plateforme`
- Description : `Indicateurs globaux de diagnostic, réservés à l'administration.`
- **Événements déclencheurs** : ajouter les **4 tags disponibles** :
  `exercise.answered`, `exercise.viewed`, `activity.completed`,
  `activity.started`.

**Étape 2** : `contextType = admin` (formulaContext identique à `teacher` :
`{ userId: <id admin>, activityId: undefined }`). Configurer **4
visualisations** :

| Vue | Libellé | Type | Icône | Unité | Seuils |
|---|---|---|---|---|---|
| 1 (défaut) | `Tentatives minimales (plateforme)` | Carte | `trending_down` | `tentatives` | Bon ≤ `1` · Moyen ≤ `2` · Critique > `2` |
| 2 (ajoutée) | `Tentatives maximales (plateforme)` | Carte | `trending_up` | `tentatives` | Bon ≤ `5` · Moyen ≤ `15` · Critique > `15` |
| 3 (ajoutée) | `Note moyenne globale` | Graphique ligne | `show_chart` | *(vide)* | - |
| 4 (ajoutée) | `Comptes sans session enregistrée` | Barres horizontales | `groups` | *(vide)* | - |

**Étape 3** :

- Onglet **"Tentatives minimales (plateforme)"** :

  | # | Étape | Paramètres |
  |---|---|---|
  | 1 | `fetch` | table `SessionData`, contextFields = **(vide)** |
  | 2 | `extract` | extractField = `attempts` |
  | 3 | `aggregate` | aggregateFn = **`min`** |

- Onglet **"Tentatives maximales (plateforme)"** : identique mais
  `aggregateFn = max`.

- Onglet **"Note moyenne globale"** :

  | # | Étape | Paramètres |
  |---|---|---|
  | 1 | `fetch` | table `SessionData`, contextFields = **(vide)** |
  | 2 | `join` | table `Users`, **type Complète (full)**, clé gauche `user_id`, clé droite `id`, "Filtrer par contexte" = vide |
  | 3 | `extract` | extractField = `grade` |
  | 4 | `aggregate` | aggregateFn = `avg` |
  | 5 | `round` | decimals = `1` |

  Une jointure **complète (full)** conserve à la fois les sessions sans
  utilisateur correspondant *et* les utilisateurs sans session - ces
  dernières lignes n'ont pas de champ `grade`, mais `extract` filtre déjà les
  valeurs non numériques (`isNaN`), donc `aggregate(avg)` reste correct.

  >  **Limite connue** : la visualisation **"Graphique ligne"**
  > (`line-chart`) affiche `result.metadata.history`, qui n'est **jamais
  > alimenté** par `computeView` (toujours `[]`, voir readme §13). La courbe
  > s'affichera donc vide même si "Tester" renvoie une valeur correcte.
  > Configurez tout de même cette vue pour explorer l'UI (type, icône,
  > couleur, absence de seuils pour ce type) - c'est une limite du frontend,
  > pas une erreur de configuration de votre part.

- Onglet **"Comptes sans session enregistrée"** :

  | # | Étape | Paramètres |
  |---|---|---|
  | 1 | `fetch` | table `SessionData`, contextFields = **(vide)** |
  | 2 | `join` | table `Users`, **type Droite (right)**, clé gauche `user_id`, clé droite `id`, "Filtrer par contexte" = vide |
  | 3 | `js` | code ci-dessous → objet `{ "Comptes sans session": n }` |

  Code de l'étape `js` :

  ```js
  let count = 0;
  for (const row of input) {
    if (row.user_id === undefined || row.user_id === null) count++;
  }
  return { 'Comptes sans session': count };
  ```

  Une jointure **droite (right)** ajoute les lignes de `Users` qui n'ont
  **aucune** correspondance dans `SessionData` (champ `user_id` alors
  `undefined`) - ce code les compte.

Tester chaque onglet (Tester + Déboguer pas à pas).

####  Import / export YAML / JSON (round-trip)

Sur l'onglet **"Note moyenne globale"** :

1. Cliquer **"Import"** (à côté de "Visuel") → le panneau s'ouvre **déjà
   pré-rempli** avec le pipeline courant sérialisé (round-trip via
   `pipelineToText`).
2. Cliquer **"Référence YAML"** → affiche une documentation inline des 10
   types d'étapes et de leurs paramètres.
3. Modifier un détail dans le YAML (ex. le `label` de l'étape `round` →
   `Arrondir à 1 décimale`), puis cliquer **"Appliquer"**.
4. Basculer en **JSON** (le panneau se re-sérialise dans le nouveau format),
   vérifier que le pipeline est identique.
5. Tester le bouton **"Fichier"** : exporter le contenu du panneau dans un
   fichier `.yaml`, puis le ré-importer via le sélecteur de fichier.
6. Revenir en mode **"Visuel"** → vérifier que le `label` modifié apparaît
   bien sur l'étape "Arrondir".

>  **Escape hatch** : dans le panneau Import, une étape avec un `type`
> inconnu mais un `params.code` non vide est automatiquement convertie en
> étape `js` (avec un avertissement listant les étapes converties) - utile
> pour migrer un pipeline écrit pour un type d'étape pas encore supporté côté
> UI.

Cliquer **"Créer"**.

####  À tester (rôle Admin)

`/dashboard/overview` (rôle Admin) affiche cet indicateur dans le tableau de
bord personnel de l'administrateur (contexte "orphelin" `admin`, comme
`teacher`), avec ses 4 vues en chips.

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
  des visualisations avec leur pipeline (chips colorés par type d'étape,
  "(formule globale)" si la vue n'a pas de pipeline propre).
- **Familles repliables** : ligne violette avec chevron + badge "N
  indicateurs" - cliquer pour déplier/replier (`toggleFamily`,
  `buildIndicatorDisplayRows`). Avec le filtre "Familles uniquement", seule la
  famille "Tentatives avant réussite" (4 membres) doit apparaître.
- **Sélection de vue active** + **masquage de vues** : voir étapes A.2/A.3.

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

>  `AdminIndicatorManagerComponent` (la table de **gestion**, étapes A à C)
> **n'applique pas** ce filtre - il montre toujours les 6 indicateurs, quel
> que soit le rôle courant. C'est volontaire : c'est l'outil
> d'administration.

---

## Étape F - Outils admin avancés

Toujours dans `/dashboard/indicators` (rôle **Admin**), table de gestion :

- **Modifier** (icône crayon) → rouvre le builder hydraté (`hydrate()`) avec
  les valeurs existantes. Exemple : ouvrez l'indicateur 6 "Diagnostic
  plateforme", onglet "Tentatives minimales (plateforme)", changez
  `aggregateFn` de `min` à `max`, puis sauvegardez → cela crée une **nouvelle
  version** dans `indicator_formula_versions`.
- **Historique des versions** (icône horloge, visible seulement si
  l'indicateur a une formule DSL) → liste les versions avec leur pipeline
  (tags par type d'étape) et un bouton **"Restaurer cette version"**
  (popconfirm) → `POST /indicators/:id/rollback/:versionId`. Utilisez-le pour
  annuler la modification précédente et revenir à `aggregateFn = min`.
- **Logs d'exécution** (icône document) → table Date / userId (tronqué) /
  Valeur / Durée / Erreur (`GET /indicators/:id/logs?limit=100`). Les lignes
  en erreur apparaissent en rouge.
- **Recalculer** (icône replay, popconfirm) →
  `POST /indicators/:id/recalculate` : ne recalcule que les utilisateurs
  ayant activé l'indicateur, pour la première vue `learner` uniquement.
- **Switch actif/inactif** (`isActive`) → `PATCH /indicators/:id/status` : un
  indicateur désactivé disparaît de `GET /indicators` (liste active, donc du
  sélecteur utilisateur) mais reste dans `GET /indicators/all` (gestion
  admin). Testez-le sur l'indicateur 5 "Vue d'ensemble plateforme" : désactivez,
  vérifiez sa disparition du tableau de bord enseignant, puis réactivez.
- **Supprimer** (icône corbeille rouge, popconfirm) →
  `DELETE /indicators/:id`.

   Pour exercer cette action sans perdre l'un des 6 indicateurs du guide,
  créez d'abord un **7ᵉ indicateur jetable** (`/dashboard/indicators` →
  "Nouvel indicateur", n'importe quel contexte, nom `Test suppression`, sans
  formule particulière), puis supprimez-le immédiatement.

- **Schéma PLaTon** (`GET /indicators/schema`) : déjà utilisé implicitement à
  chaque fois que vous avez ouvert un sélecteur "Table" ou "Colonnes de
  filtre" dans le builder - c'est ce endpoint qui peuple ces listes
  (`platonSchema`, avec mise en cache `_colsCache`).
- **Précalcul de contexte** (`POST /indicators/precompute-context`) : déjà
  exercé en A.2 via le sélecteur de contexte enseignant - aucun appel manuel
  nécessaire.

### À propos de `joinContextFields`

Le champ **"Filtrer par contexte"** de l'étape `join` (paramètre
`joinContextFields`) permet de filtrer la **table jointe** par les mêmes
colonnes de contexte que `fetch` (`user_id`, `activity_id`, `course_id`).
Aucun des 6 indicateurs de ce guide n'en a besoin : les jointures utilisées
(`Resources`, `Users`, `Courses`) ne possèdent pas de colonnes de contexte
pertinentes pour ce filtrage côté table jointe. Exemple d'usage hypothétique
(non applicable ici faute de colonne `course_id` sur `SessionData`, voir
readme §13) : dans une formule de contexte `course`, une étape `join` sur
`Activities` avec `joinContextFields: ['course_id']` ne conserverait que les
activités du cours courant.

---

## Récapitulatif - couverture des fonctionnalités

| Fonctionnalité | Où l'exercer |
|---|---|
| Wizard "Nouvel indicateur" (3 étapes) | A.1 (et B, C en autonome) |
| Wizard "Créer une famille" | A.0 |
| `requiredEvents` : 1 événement, 2, vide, 4 (tous) | A.1 / A.2+A.4 / B / C |
| Les 6 `contextType` | A.1–A.4, B, C |
| `fetch` (avec/sans `contextFields`, `useGroupContext`) | toutes ; `useGroupContext` en A.4 ; `contextFields: []` en B/C |
| `join` - gauche (left) | A.3, A.4 |
| `join` - interne (inner) | B |
| `join` - droite (right) | C |
| `join` - complète (full) | C |
| `joinContextFields` | documenté en F |
| `filter` (tous opérateurs) | A.3 (recette + variantes), A.2 (variante) |
| `groupBy` | A.1–A.3 (recette) |
| `findFirst` (avec et sans condition) | A.1 (recette + variante) |
| `extract` | toutes |
| `aggregate` - `avg` | A.1–A.3, C |
| `aggregate` - `sum` | A.4 |
| `aggregate` - `count` | A.3, B |
| `aggregate` - `min` | C |
| `aggregate` - `max` | A.1 (variante), C |
| `round` | A.1, A.2, B, C |
| `divide` | B |
| `js` (objet, tableau de buckets) | A.3, A.4, C |
| Recettes (`FORMULA_RECIPES`) | A.1–A.4 |
| Import/Export YAML + JSON + fichier + round-trip | C |
| Carte + seuils | A.1, A.3, B, C |
| Jauge + seuils | A.2 |
| Barres horizontales | A.3, A.4, C |
| Histogramme | A.4 |
| Graphique ligne | C |
| Multi-vue + sélection (`activeVizId`) | A.2 |
| Masquage de vue (`enabledVizIds`) | A.2, A.3 |
| Familles d'indicateurs | A.0–A.4, D |
| Visibilité par rôle | E |
| Snapshots de groupe (CRUD + 409 + auto-refresh) | A.4 |
| Précalcul de contexte | A.2 |
| Recalcul | A.1, B |
| Historique des formules + rollback | F |
| Logs d'exécution | F |
| Activation/désactivation (`isActive`) | F |
| Suppression | F (sur un indicateur jetable) |
| Filtres liste (contexte/tri/groupement) | D |
| Aperçu (`/preview`) et débogueur pas-à-pas (`/preview-steps`) | toutes |
