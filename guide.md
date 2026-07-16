# Guide pratique - Créer et exploiter des indicateurs

Ce guide part d'un cas d'utilisation unique et volontairement simple : l'indicateur
**« Nombre moyen de tentatives avant première réussite »**. Sa formule est la
somme des tentatives effectuées avant la première réussite, divisée par le
nombre d'exercices considérés.

L'indicateur lui-même est simple à calculer, mais **deux rôles le
consultent** - l'étudiant et le chargé de TP - ce qui suffit à exercer tout le
modèle du microservice, pas seulement son moteur de calcul :

- **L'étudiant** consulte l'indicateur sur **sa propre activité**, à
  l'échelle des exercices de cette activité, et obtient une **valeur
  unique** : en combien de tentatives il réussit en moyenne.
- **Le chargé de TP** consulte le **même indicateur**, mais sur toute
  l'activité d'un **groupe de TP** - soit pour l'ensemble des exercices (une
  valeur unique pour tout le groupe), soit **exercice par exercice** (une
  valeur par exercice).

Le calcul est identique dans les trois cas ; ce qui change, ce sont les
données auxquelles la formule s'applique, et la manière dont on les regroupe
avant de calculer - exactement ce que le champ `contextType` et l'étape
`groupBy` du DSL sont conçus pour exprimer (voir `readme.md`).

Le guide se termine par deux indicateurs supplémentaires, autonomes,
construits pour exercer les fonctionnalités du DSL que ce cas d'utilisation
ne couvre pas (jointures droite/interne, code JS, import/export YAML/JSON).

> **Principe clé** : **1 indicateur = 1 formule**, partagée par toutes ses
> visualisations. Les visualisations d'un même indicateur diffèrent
> uniquement par leur représentation visuelle (type de graphique, icône,
> couleur, seuils), jamais par les données calculées. C'est pourquoi « pour
> l'ensemble des exercices » et « exercice par exercice » sont **deux
> indicateurs distincts** (même `contextType`, formules différentes), et non
> deux visualisations d'un seul indicateur.

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
3. **Connexion et changement de rôle** : l'application utilise désormais une
   authentification SSO réelle vers PLaTon (`AuthentificationPage` redirige
   vers `https://platon.univ-eiffel.fr/login`, récupère le token au retour,
   puis lit le rôle du profil PLaTon associé - voir `readme.md` §12).
   Il n'existe plus de mécanisme de simulation de rôle côté frontend
   (l'ancien `defaultUserId` dans `environment.ts` a été retiré). Pour
   tester ce guide sous un rôle donné (étudiant, enseignant, admin), il faut
   se connecter avec un **compte PLaTon réel possédant ce rôle**, et se
   déconnecter/reconnecter avec un autre compte pour changer de rôle. Ce
   guide ne fournit pas d'identifiants de test - à demander à l'équipe PLaTon
   si besoin.
4. Rappel des permissions (`role.service.ts`) :
   - `canCreateIndicators` = **Admin uniquement** → conditionne l'affichage
     de tout l'onglet "Administration" (`indicators.page.html`), y compris
     les boutons "Nouvel indicateur" et "Créer une famille". Un enseignant
     n'a **aucun accès**, même en lecture, à cette table de gestion - il ne
     voit que le sélecteur d'indicateurs, comme un étudiant.
5. **Prérequis événements** : depuis le retrait du seed automatique legacy
   (2026-07-07), le sélecteur "Événements déclencheurs" du wizard n'accepte
   plus de saisie libre - il ne propose que les événements **configurés et
   installés** via l'écran **"Événements & déclencheurs"**
   (`event-rule-manager.component.ts`, accessible depuis `/dashboard/indicators`
   en rôle Admin). Le trigger historique de `exercise.answered`
   (`trg_platon_outbox_session_data` sur `SessionData.grade`) fonctionne
   toujours tout seul, mais n'est plus référencé par aucune règle - il
   n'apparaît donc plus dans ce sélecteur tant qu'une règle n'a pas été créée
   **et installée** pour lui.
   > ⚠️ **Piège à éviter** : créer une règle sur `SessionData`/`grade` puis
   > l'installer ajoute un **second** trigger générique en plus du trigger
   > historique - chaque réponse d'étudiant produirait alors **deux**
   > événements `exercise.answered` (inoffensif car le recalcul est
   > idempotent, mais double le bruit des logs/WebSocket). Pour ce guide,
   > préférez créer une règle sur une **colonne différente** non déjà
   > couverte, par exemple :
   > - Table `SessionData`, colonne surveillée `attempts`, opération `UPDATE`,
   >   condition `changed`.
   > - Mapping contexte : `userId → user_id`, `courseId → course_id`,
   >   `activityId → activity_id`, `sessionId → id`.
   > - Type d'événement : créer `exercise.attempted` ("Tentative
   >   enregistrée").
   > - Cliquer "Installer" → confirmer.
   >
   > Utilisez cet événement (`exercise.attempted`) comme déclencheur pour
   > tous les indicateurs créés dans ce guide.
6. **La colonne `attempts_at_success`** : les formules ci-dessous utilisent
   `attempts_at_success` (et non `attempts`) sur `SessionData` - une colonne
   ajoutée par ce projet (`api/src/scripts/migrations/add-platon-attempts-at-success-column.sql`),
   qui porte le rang de la première réponse notée 100, calculé depuis la
   table `Answers`. `attempts` seul continue d'augmenter après une réussite
   (si l'étudiant retente ensuite) et ne peut donc pas mesurer "le nombre de
   tentatives qu'il a fallu pour réussir". Un trigger sur `Answers`
   (`trg_platon_attempts_at_success`, même script) la maintient à jour en
   continu - c'est distinct de l'événement `exercise.attempted` configuré
   ci-dessous, qui ne fait que déclencher le *recalcul* de l'indicateur
   (l'un garde la donnée juste, l'autre notifie qu'il faut relire la
   donnée).

➡️ **Pour toute la phase de création (étapes A à C ci-dessous), restez en
rôle Admin.**

---

## Plan d'ensemble

| # | Indicateur | `contextType` | Visualisation | Formule (résultat) | Nouveautés introduites |
|---|---|---|---|---|---|
| 1 | Tentatives avant réussite - Apprenant | `learner` | 1 (carte) | scalaire - avg tentatives, sur l'activité de l'étudiant | wizard 3 étapes, recette, `fetch`/`filter`/`extract`/`aggregate(avg)`/`round`, seuils, recalcul |
| 2 | Tentatives avant réussite - Groupe de TP (ensemble) | `group` | 1 (carte) | scalaire - avg tentatives, tout le groupe | `useGroupContext`, même formule que l'indicateur 1 sur un contexte différent |
| 3 | Tentatives avant réussite - Groupe de TP (par exercice) | `group` | 1 (barres horizontales) | objet `{exercice: moy_tentatives}` | `join` **gauche**, `js` retournant un objet structuré, **snapshots** de groupe |
| 4 | Vue d'ensemble plateforme - Enseignant | `teacher` | 1 (carte) | scalaire - avg note (sessions réelles) | `requiredEvents` vide, `fetch` global, `join` **interne**, `aggregate(avg)`, `round` |
| 5 | Diagnostic plateforme - Admin | `admin` | 2 (carte + jauge) | scalaire - count utilisateurs sans session | `join` **droite** (`right`), `js`, import/export YAML/JSON, logs d'exécution |

Les indicateurs 1 à 3 partagent une **famille** (`familyName = "Tentatives
avant réussite"`), créée en une fois via le wizard "Créer une famille". Les
indicateurs 4 et 5 sont autonomes.

---

## Étape A - Famille "Tentatives avant réussite" (indicateurs 1 à 3)

### A.0 Lancer le wizard de famille

1. `/dashboard/indicators` (rôle **Admin**) → bouton **"Créer une famille"**.
2. Dans la modale "Créer une famille d'indicateurs" :
   - **Nom de la famille** : `Tentatives avant réussite`
   - **Description** : `Nombre moyen de tentatives nécessaires avant la première réussite (note 100), décliné par contexte.`
   - **Événements déclencheurs** (sélection multiple, événements configurés
     uniquement - voir étape 0.5) : sélectionner l'événement préparé
     (`exercise.attempted`)
   - **Contextes à couvrir** (multi-sélection) : cocher dans cet ordre
     **Apprenant**, **Groupe de TP**, **Groupe de TP** à nouveau (l'ordre de
     sélection détermine l'ordre d'enchaînement des wizards - le contexte
     `group` sera configuré deux fois, une par indicateur : "ensemble" puis
     "par exercice").

   > Si le wizard de famille n'accepte pas de sélectionner deux fois le même
   > contexte, créez l'indicateur 3 séparément (bouton "Nouvel indicateur"),
   > puis rattachez-le à la famille via le champ "Famille" du formulaire ou
   > en le renommant pour reprendre le préfixe `Tentatives avant réussite -`.

3. Cliquer **"Configurer les indicateurs"** → ouvre directement le builder
   pour le 1er contexte (Apprenant), pré-rempli avec le nom
   `Tentatives avant réussite - Apprenant`, la description et
   `requiredEvents` (l'événement sélectionné ci-dessus).

À chaque "Créer", la modale se ferme et celle du contexte suivant s'ouvre
automatiquement.

---

### A.1 Indicateur 1/5 - Apprenant (`learner`) - LE PLUS SIMPLE

**Étape 1 « Définition »** (déjà pré-remplie par la famille) : vérifier
nom, description, `requiredEvents = [exercise.attempted]`.

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
| 2 | `filter` | field = `attempts_at_success`, operator = `>`, value = `0` |
| 3 | `extract` | extractField = `attempts_at_success` |
| 4 | `aggregate` | aggregateFn = `avg` |
| 5 | `round` | decimals = `2` |

`fetch` avec `contextFields: [user_id, activity_id]` restreint
automatiquement les données à l'étudiant connecté et à l'activité consultée
- c'est ce qui donne à l'étudiant "sa propre activité, à l'échelle des
exercices d'une même activité", comme décrit en introduction.

**Tester** :
- Dans "Tester cette formule", choisir un **Cours**, puis un
  **Utilisateur** (étudiant) dans la liste déroulante "Utilisateur".
- Cliquer **"Tester"** → un résultat scalaire (nombre) s'affiche.
- Cliquer **"Déboguer pas à pas"** → un panneau affiche le contexte effectif
  (`userId=…`, `activityId=(TARGET_ACTIVITY_ID)` si non précisé,
  `groupId=-`) puis, pour chacune des 5 étapes : type, durée, et un aperçu
  tabulaire du résultat (avec "Afficher tout" si > 5 lignes).

Cliquer **"Créer"** → enchaîne automatiquement sur l'indicateur "Groupe de
TP (ensemble)".

#### À tester côté utilisateur (rôle Étudiant)

1. Se connecter avec un compte **Étudiant** (voir étape 0.3).
2. `/dashboard/indicators` → onglet "Indicateurs" (sélecteur,
   `IndicatorSelectorComponent`) → activer l'indicateur "Tentatives avant
   réussite - Apprenant" via le **switch ✓/✗**.
3. `/dashboard/overview` → la carte apparaît, colorée selon les seuils
   configurés.

#### Manipulation admin : recalcul

1. Se reconnecter en rôle **Admin**, `/dashboard/indicators`.
2. Sur la ligne de l'indicateur, cliquer l'icône **"Recalculer"** (replay) →
   confirmer la popconfirm → message
   *"Recalcul terminé - x/y valeurs mises à jour"*. Cela recalcule la valeur
   `learner` de tous les utilisateurs ayant activé l'indicateur.

#### Variantes à explorer (débogueur pas-à-pas)

- **Sans le filtre** : retirez temporairement l'étape `filter` → re-déboguer
  : `extract(attempts_at_success)` produit alors des valeurs `null` pour les
  sessions jamais réussies, qui corrompent la moyenne - observez le résultat
  avant de remettre le filtre.
- **Autres fonctions d'agrégation** : changez `aggregateFn` de `avg` à
  `max` → observez le pire cas (nombre maximal de tentatives avant réussite,
  tous exercices confondus).

---

### A.2 Indicateur 2/5 - Groupe de TP, ensemble (`group`)

Ce que dit l'introduction - « le chargé de TP consulte le même indicateur,
mais sur toute l'activité d'un groupe de TP » - se traduit très simplement :
**exactement la même formule** que l'indicateur 1, appliquée à un contexte
différent.

**Étape 1** : nom `Tentatives avant réussite - Groupe de TP (ensemble)`,
`requiredEvents` inchangé (`exercise.attempted`).

**Étape 2** : `contextType = group`. Une visualisation :

| Champ | Valeur |
|---|---|
| Libellé | `Tentatives avant réussite (groupe)` |
| Type | Valeur scalaire |
| Icône | `groups` |
| Unité | `tentatives` |

Mêmes seuils que l'indicateur 1 (Bon ≤ 2, Moyen ≤ 4).

**Étape 3 « Formule »** : cliquer sur la recette **"Tentatives avant
réussite"** - identique à A.1 :

| # | Étape | Paramètres |
|---|---|---|
| 1 | `fetch` | table `SessionData`, contextFields = `activity_id`, **"Requête groupe de TP" = ON** (`useGroupContext`) |
| 2 | `filter` | field = `attempts_at_success`, operator = `>`, value = `0` |
| 3 | `extract` | extractField = `attempts_at_success` |
| 4 | `aggregate` | aggregateFn = `avg` |
| 5 | `round` | decimals = `2` |

Seule différence avec A.1 : `contextFields` ne contient plus `user_id`, et le
switch **"Requête groupe de TP"** (`useGroupContext`) est activé - il
déclenche côté backend une jointure automatique
`CourseGroupsMember`/`CourseGroups` : seules les lignes `SessionData` dont
`user_id` appartient au groupe sélectionné dans le contexte sont conservées,
**tous exercices confondus**. C'est exactement l'illustration du principe
énoncé en introduction : « le calcul est identique... ce qui change, ce sont
les données auxquelles la formule s'applique ».

**Tester** : choisir un **Cours** puis un **Groupe**. "Tester" / "Déboguer
pas à pas".

Cliquer **"Créer"** → enchaîne sur "Groupe de TP (par exercice)".

#### À tester (rôle Enseignant)

Sélecteur de contexte enseignant → "Voir par : groupe de TP" → la carte
"Tentatives avant réussite - Groupe de TP (ensemble)" affiche une seule
valeur pour tout le groupe.

---

### A.3 Indicateur 3/5 - Groupe de TP, par exercice (`group`)

Ici, « exercice par exercice » : au lieu d'une seule moyenne pour tout le
groupe, un résultat **par exercice**. C'est un calcul différent (pas
seulement un autre affichage du même nombre) - d'où un indicateur distinct,
avec sa propre formule, plutôt qu'une deuxième visualisation de l'indicateur
2.

**Étape 1** : nom `Tentatives avant réussite - Groupe de TP (par exercice)`,
`requiredEvents` inchangé.

**Étape 2** : `contextType = group`. Une visualisation - la formule
retournant un objet `{exercice: moyenne}`, seul le type **barres
horizontales** est adapté :

| Champ | Valeur |
|---|---|
| Libellé | `Tentatives avant réussite par exercice` |
| Type | Barres horizontales |
| Icône | `bar_chart` |
| Unité | *(vide)* |

Pas de seuil pour cet indicateur (résultat structuré, pas scalaire).

**Étape 3 « Formule »** : pipeline manuel (pas de recette pour cette
variante) :

| # | Étape | Paramètres |
|---|---|---|
| 1 | `fetch` | table `SessionData`, contextFields = `activity_id`, **"Requête groupe de TP" = ON** |
| 2 | `join` | table `Resources`, **type Gauche (left)** *(par défaut)*, clé gauche `resource_id`, clé droite `id` |
| 3 | `filter` | field = `attempts_at_success`, operator = `>`, value = `0` |
| 4 | `js` | voir code ci-dessous |

Code à coller dans l'étape `js` :

```javascript
const groups = {};
for (const row of input) {
  const key = row.name || 'Inconnu';
  if (!groups[key]) groups[key] = [];
  const v = parseInt(row.attempts_at_success);
  if (!isNaN(v)) groups[key].push(v);
}
const out = {};
for (const [key, vals] of Object.entries(groups)) {
  out[key] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}
return out;
```

Après le `join`, chaque ligne contient à la fois les champs de `SessionData`
et ceux de `Resources` (dont `name`, le nom lisible de l'exercice). Le code
groupe par `name`, calcule la moyenne des `attempts_at_success` de chaque
groupe, et retourne un objet `{ "Nom de l'exercice": moyenne }` - une barre
par exercice.

> **Pourquoi un `join` ici et pas dans les indicateurs 1 et 2 ?** Ces deux
> premiers indicateurs retournent un scalaire agrégé sur toute l'activité :
> aucun besoin de savoir *quel* exercice, seulement la moyenne globale. Ici,
> le résultat est ventilé par exercice, donc il faut son nom lisible pour
> construire les clés de l'objet retourné.

Tester (Tester + Déboguer, en choisissant un **Cours** puis un **Groupe**).
Cliquer **"Créer"** → fin de la famille (3/3), la modale se ferme.

#### À tester (rôle Enseignant)

Sélecteur de contexte enseignant → "Voir par : groupe de TP" → la carte
"Tentatives avant réussite - Groupe de TP (par exercice)" affiche un
graphique en barres horizontales, une barre par exercice, avec des **noms
lisibles** (jamais d'UUID), tronqués à 25 caractères avec info-bulle
complète.

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
`Interne (inner)` puis relancez le débogueur : avec `inner`, une session sans
ressource correspondante dans `Resources` disparaîtrait du résultat (alors
qu'elle restait avec `left`, sous la clé `"Inconnu"`). Remettez `Gauche`
avant de sauvegarder.

#### Variante : tous les opérateurs `filter`

Testez successivement, à la place du filtre `attempts_at_success > 0`
(relancer **"Déboguer pas à pas"** à chaque fois) :

| Opérateur | Champ / Valeur | Signification |
|---|---|---|
| `==` | `attempts_at_success` / `1` | réussite dès la première tentative uniquement |
| `!=` | `attempts_at_success` / `1` | tout sauf une réussite immédiate |
| `>=` | `attempts_at_success` / `3` | sessions ayant nécessité au moins 3 tentatives |
| `<=` | `attempts_at_success` / `1` | équivalent à `==` `1` ici |

Remettez `field = attempts_at_success`, `operator = >`, `value = 0` avant de
sauvegarder.

---

## Étape B - Indicateur 4/5 - Enseignant (`teacher`) - autonome

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

1. Se connecter avec un compte **Enseignant**.
2. `/dashboard/overview` → carte de cet indicateur (contexte "orphelin"
   `teacher` : `contextId = userId de l'enseignant`).
3. Comme `requiredEvents` est vide, la valeur n'existe pas tant qu'elle n'a
   pas été calculée. Reconnectez-vous en **Admin**, `/dashboard/indicators`,
   cliquez **"Recalculer"** sur cet indicateur, puis revenez en Enseignant et
   rechargez.

---

## Étape C - Indicateur 5/5 - Admin (`admin`) - LE PLUS COMPLEXE

Toujours en rôle **Admin** : `/dashboard/indicators` → **"Nouvel
indicateur"**.

**Étape 1** :
- Nom : `Diagnostic plateforme`
- Description : `Nombre d'utilisateurs inscrits n'ayant jamais soumis d'exercice.`
- **Événements déclencheurs** : réutiliser l'événement configuré à l'étape
  0.5 (`exercise.attempted`) - c'est le seul événement disponible dans le
  sélecteur tant qu'aucune règle n'a été créée pour `exercise.answered`, et
  en créer une sur `SessionData`/`grade` dupliquerait le trigger historique
  (voir l'avertissement de l'étape 0.5).

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

Ces actions sont disponibles dès qu'au moins un des 5 indicateurs existe ;
exercez-les sur n'importe lequel d'entre eux dans
`/dashboard/indicators` (sélecteur) :

- **Activer / désactiver** un indicateur dans son tableau de bord - switch
  ✓/✗ sur chaque ligne (`toggleIndicator`, persiste dans
  `UserDashboardSettings.activeIndicators`).
- **Filtres de la liste** :
  - "Filtrer par contexte" : Tous les contextes / Apprenant / Groupe /
    Enseignant / Admin.
  - "Trier par" : Nom / Plus utilisés / Moins utilisés (`usageCount`).
  - **Regroupement** : un bascule à deux positions, "Indicateurs uniques" /
    "Familles" (pas trois options combinées) - il n'existe pas de vue
    combinant les deux à la fois.
- **Voir le détail** (icône œil) → modale avec : badge actif/inactif, badge
  "Famille : …" si applicable, description, contextes, déclencheurs (libellés
  français pour les non-admins, codes bruts pour l'admin), mode de mise à
  jour ("Temps réel" / "Cron quotidien"), nombre d'utilisations, et la liste
  des visualisations avec leur type et icône.
- **Familles repliables** : ligne violette avec chevron + badge "N
  indicateurs" - cliquer pour déplier/replier (`toggleFamily`,
  `buildIndicatorDisplayRows`). Avec le regroupement "Familles", seule la
  famille "Tentatives avant réussite" (3 membres) doit apparaître.
- **Renommer une famille** (icône crayon sur la ligne de famille, onglet
  Administration) → modale "Renommer la famille" → met à jour le
  `familyName` de tous les membres en parallèle.
- **Sélection de vue active** + **masquage de vues** : applicable dès qu'un
  indicateur a plusieurs visualisations (ex. l'indicateur 5, Admin).

---

## Étape E - Test de la visibilité par rôle

Table de référence (`RoleService.INDICATOR_VISIBILITY`) :

| `contextType` | Rôles qui voient l'indicateur |
|---|---|
| `learner` | `student` |
| `teacher` | `teacher` |
| `admin` | `admin` |
| `group` | `teacher`, `admin` |

Pour chaque rôle, connectez-vous avec un compte correspondant (étape 0.3),
ouvrez `/dashboard/indicators` (sélecteur) et vérifiez :

| Rôle | Indicateurs **visibles** parmi les 5 | Indicateurs **masqués** |
|---|---|---|
| Étudiant | Apprenant | Groupe de TP (×2), Enseignant, Admin |
| Enseignant | Groupe de TP (×2), Enseignant | Apprenant, Admin |
| Admin | Groupe de TP (×2), Admin | Apprenant, Enseignant |

> `AdminIndicatorManagerComponent` (la table de **gestion**, étapes A à C)
> **n'applique pas** ce filtre - il montre toujours les 5 indicateurs, quel
> que soit le rôle courant. C'est volontaire : c'est l'outil d'administration,
> et de toute façon seul l'Admin peut y accéder (voir étape 0.4).

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
  admin). Testez-le sur l'indicateur 4 "Vue d'ensemble plateforme" : désactivez,
  vérifiez sa disparition du tableau de bord enseignant, puis réactivez.
- **Supprimer** (icône corbeille rouge, popconfirm) →
  `DELETE /indicators/:id`.

   Pour exercer cette action sans perdre l'un des 5 indicateurs du guide,
  créez d'abord un **6ᵉ indicateur jetable** (n'importe quel contexte, nom
  `Test suppression`, sans formule particulière), puis supprimez-le
  immédiatement.

- **Schéma PLaTon** (`GET /indicators/schema`) : déjà utilisé implicitement à
  chaque fois que vous avez ouvert un sélecteur "Table" ou "Colonnes de
  filtre" dans le builder - c'est ce endpoint qui peuple ces listes
  (`platonSchema`, avec mise en cache `_colsCache`).
- Les sélections de contexte enseignant ne déclenchent pas de route de
  pré-calcul dédiée : elles sont stockées dans `DashboardSettingsService` et
  les valeurs `group` sont calculées par `computeView()` lorsque les cartes
  ou la page détail sont affichées.

### À propos de `joinContextFields`

Le champ **"Filtrer par contexte"** de l'étape `join` (paramètre
`joinContextFields`) permet de filtrer la **table jointe** par les mêmes
colonnes de contexte que `fetch` (`user_id`, `activity_id`, `course_id`).
Aucun des 5 indicateurs de ce guide n'en a besoin : les jointures utilisées
(`Resources`, `Activities`, `Users`) ne possèdent pas de colonnes de contexte
pertinentes pour ce filtrage côté table jointe.

### Note sur le type de visualisation "Graphique ligne"

La visualisation **ligne** (`line-chart`) affiche `result.metadata.history`,
qui n'est **jamais alimenté** par `computeView` (toujours `[]`, voir
`readme.md`). La courbe s'affichera donc vide même si la formule retourne une
valeur correcte. Ce type de visualisation est disponible dans le builder
(icône, seuils, couleur configurables) mais reste une limite frontend non
résolue.

### Note sur le type de visualisation "Histogramme"

L'histogramme attend un tableau de buckets `[{ bucket, count }]`. Cela
nécessite une étape `js` produisant ce format - la formule ne peut donc pas
aussi retourner un scalaire utilisable par une carte. Pour tester ce type :
créer un **indicateur jetable** (`contextType = group`, 1 viz histogramme),
utiliser le pipeline suivant.

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
