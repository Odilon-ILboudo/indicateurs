# Indicateurs - Microservice PLaTon

Tableau de bord d'indicateurs de performance e-learning, pilotable sans redéploiement.

---

## Table des matières

1. [Présentation et philosophie](#1-présentation-et-philosophie)
2. [Architecture technique](#2-architecture-technique)
3. [Arborescence des fichiers](#3-arborescence-des-fichiers)
4. [Base de données](#4-base-de-données)
5. [Installation et démarrage](#5-installation-et-démarrage)
6. [Configuration (.env)](#6-configuration-env)
7. [Fonctionnalités détaillées](#7-fonctionnalités-détaillées)
8. [Guide - Vue apprenant](#8-guide--vue-apprenant)
9. [Guide - Vue admin](#9-guide--vue-admin)
10. [Créer un indicateur - procédure pas à pas](#10-créer-un-indicateur--procédure-pas-à-pas)
11. [Exemple complet - indicateur multi-vues](#11-exemple-complet--indicateur-multi-vues)
12. [Moteur DSL - référence des étapes](#12-moteur-dsl--référence-des-étapes)
13. [Routes API - référence complète](#13-routes-api--référence-complète)
14. [Flux de données](#14-flux-de-données)
15. [Maintenance et recalcul](#15-maintenance-et-recalcul)
16. [Limitations et points d'attention](#16-limitations-et-points-dattention)

---

## 1. Présentation et philosophie

Le microservice `indicateurs` se greffe sur la plateforme PLaTon.
Il permet à un administrateur de créer et gérer des indicateurs de performance pédagogique
**sans modifier le code source ni redéployer l'application**.

**Principe clé : zéro redéploiement**

Chaque indicateur est entièrement défini en base de données :
- Sa formule de calcul est stockée en JSONB (pipeline DSL)
- Sa configuration visuelle (icône, couleurs, seuils) est stockée en JSONB
- Le moteur interprète et exécute la formule à la volée

Pour créer un nouvel indicateur : interface admin → builder → sauvegarder.
Pas de fichier TypeScript à modifier, pas de redémarrage du serveur.

**Connexion à PLaTon**

Le microservice se connecte en **lecture seule** à la base de données PLaTon
pour interroger les tables pédagogiques. Il possède sa propre base de données
séparée pour stocker les définitions et valeurs calculées.

---

## 2. Architecture technique

```text
Stack
─────────────────────────────────────────────────────────────────────
Backend       NestJS (TypeScript) - port 3001
Frontend      Angular 21          - port 4200
ORM           TypeORM
UI            Ng-Zorro Ant Design + Angular CDK + ECharts
BDD 1         PostgreSQL PLaTon      (lecture seule)  - données pédagogiques
BDD 2         PostgreSQL Indicators  (lecture/écriture) - définitions + valeurs
```

```text
Schéma global
─────────────────────────────────────────────────────────────────────

  ┌─────────────────────┐        ┌────────────────────────────────┐
  │  Angular 21         │        │  NestJS API                    │
  │  :4200              │◀──────▶│  :3001  /api/*                 │
  │                     │  HTTP  │                                │
  │  Dashboard          │        │  IndicatorsModule              │
  │  Interface admin    │        │  IngestionModule               │
  │  Builder DSL        │        │  GroupsModule                  │
  └─────────────────────┘        │  UserPreferencesModule         │
                                 │  AggregationModule (cron)      │
                                 └───────────┬────────────────────┘
                                             │
                        ┌────────────────────┴──────────────────────┐
                        │                                           │
                ┌───────▼──────────┐                    ┌──────────▼─────────┐
                │  PostgreSQL      │                    │  PostgreSQL         │
                │  PLaTon          │                    │  Indicators         │
                │  (READ ONLY)     │                    │  (READ/WRITE)       │
                │                  │                    │                     │
                │  SessionData     │                    │  indicator_         │
                │  Sessions        │                    │    definitions      │
                │  Activities      │                    │  indicator_values   │
                │  Resources       │                    │  indicator_formula_ │
                │  Users           │                    │    versions         │
                │  Courses         │                    │  indicator_         │
                │  CourseGroups    │                    │    execution_logs   │
                │  CourseGroups    │                    │  user_indicator_    │
                │    Member        │                    │    preferences      │
                └──────────────────┘                    └─────────────────────┘
```

---

## 3. Arborescence des fichiers

```text
indicateurs/
├── api/                                    Backend NestJS
│   └── src/
│       ├── main.ts                         Point d'entrée (port, CORS, prefix /api)
│       ├── app.module.ts                   Module racine
│       └── modules/
│           ├── core/
│           │   ├── config/
│           │   │   └── configuration.ts   Variables d'env typées
│           │   ├── database/
│           │   │   ├── database.module.ts  Déclaration des 2 DataSources
│           │   │   ├── platon.datasource.ts
│           │   │   └── indicators.datasource.ts
│           │   ├── guards/
│           │   │   └── admin.guard.ts      STUB - retourne toujours true
│           │   └── platon/
│           │       └── platon.service.ts   Requêtes SQL sur BDD PLaTon
│           │                               getAvailableTables()
│           │                               queryTable()
│           │                               queryTableForGroup()  ← JOIN groupes
│           │                               getUserSessionData()
│           │                               getAllUserIds()
│           └── features/
│               ├── indicators/
│               │   ├── entities/
│               │   │   ├── indicator-definition.entity.ts
│               │   │   ├── indicator-value.entity.ts
│               │   │   ├── indicator-formula-version.entity.ts
│               │   │   └── indicator-execution-log.entity.ts
│               │   ├── interpreter/
│               │   │   └── formula-interpreter.service.ts   MOTEUR DSL
│               │   ├── indicators.controller.ts
│               │   ├── indicators.service.ts
│               │   └── indicators.module.ts
│               ├── groups/
│               │   ├── groups.controller.ts    GET /groups
│               │   ├── groups.service.ts
│               │   └── groups.module.ts
│               ├── ingestion/
│               │   ├── ingestion.controller.ts  POST /ingest
│               │   └── ingestion.service.ts
│               ├── aggregation/
│               │   └── aggregation.service.ts   Cron quotidien 1h AM
│               └── user-preferences/
│                   ├── user-preferences.controller.ts
│                   └── user-preferences.service.ts
│
├── frontend/                               Frontend Angular 21
│   └── src/app/
│       ├── core/
│       │   ├── guards/
│       │   │   └── indicator.guard.ts      Vérifie existence indicateur :id
│       │   ├── interceptors/
│       │   │   └── auth.interceptor.ts     STUB - vide
│       │   ├── models/
│       │   │   └── indicator.model.ts      Interfaces : ContextConfig, ViewConfig...
│       │   └── services/
│       │       ├── indicator.service.ts    HTTP + cache BehaviorSubject
│       │       ├── group.service.ts        Groupes de TP
│       │       ├── dashboard-settings.service.ts
│       │       └── role.service.ts
│       ├── features/
│       │   ├── dashboard/
│       │   │   ├── dashboard.page.ts/html  Shell sidebar + toolbar
│       │   │   └── pages/
│       │   │       ├── overview/           Grille des IndicatorCard actives
│       │   │       └── indicators/         Préférences + onglet admin
│       │   ├── admin/
│       │   │   ├── admin-indicator-manager.component.ts   Table CRUD admin
│       │   │   └── indicator-builder.component.ts         WIZARD 3 ÉTAPES
│       │   ├── indicator-detail/           Vues ECharts par contexte/vue
│       │   └── indicator-selector/         Activer/désactiver
│       └── shared/
│           └── ui/
│               ├── indicator-card/         Carte valeur + seuil couleur
│               └── statistic-card/
│
└── readme.md
```

---

## 4. Base de données

### BDD PLaTon (lecture seule)

```text
Tables principales utilisées par le moteur DSL
─────────────────────────────────────────────────────────────────────

SessionData        Vue dénormalisée (~35 colonnes) - TABLE PRINCIPALE
                   user_id, activity_id, resource_id,
                   grade, attempts, created_at, succeeded_at,
                   course_name, circle_id...

Sessions           Table normalisée
                   grade, attempts, user_id, activity_id,
                   variables, succeeded_at

Activities         Activités pédagogiques
Resources          Ressources (exercices)
Users              Utilisateurs (id, username, email, isActive...)
Courses            Parcours (id, owner_id → enseignant)
CourseGroups       Groupes de TP
                   id UUID, group_id varchar, course_id, name
CourseGroupsMember Membres des groupes
                   group_id varchar, user_id → Users.id
```

### BDD Indicators (lecture/écriture)

```text
indicator_definitions
─────────────────────────────────────────────────────────────────────
id                UUID        PK
name              VARCHAR     Nom affiché ("Tentatives avant réussite")
description       TEXT
supportedContexts JSONB       ["learner", "group", ...]
requiredEvents    JSONB       ["exercise.answered", ...]
contextConfigs    JSONB       Modèle multi-contexte/multi-vue (voir §12)
formula           JSONB       Pipeline DSL legacy (rétro-compatibilité)
visualization     JSONB       Config visuelle legacy
isActive          BOOLEAN
usageCount        INTEGER
createdAt/updatedAt TIMESTAMP

indicator_values
─────────────────────────────────────────────────────────────────────
id                UUID
indicatorId       UUID        FK → indicator_definitions
contextType       VARCHAR     "learner" | "group" | "course" | ...
contextId         VARCHAR     Clé d'identification du contexte :
                                learner : userId
                                group/course : "scopeId:activityId:viewId"
                                  (clé composite garantissant l'unicité
                                   par groupe+activité+vue)
value             FLOAT       Valeur scalaire calculée
metadata          JSONB       { lastUpdate, structuredValue?, history[] }
                                structuredValue présent pour bar-chart/histogram :
                                  bar-chart  : { "label": valeur, ... }
                                  histogram  : [{ bucket, count, users? }]
Contrainte UNIQUE sur (indicatorId, contextType, contextId)

indicator_formula_versions
─────────────────────────────────────────────────────────────────────
indicatorId       UUID
versionNum        INTEGER     Incrémenté à chaque modification
formula           JSONB       Snapshot de la formule

indicator_execution_logs
─────────────────────────────────────────────────────────────────────
indicatorId       UUID
userId            VARCHAR
durationMs        INTEGER
value             FLOAT
executedAt        TIMESTAMP
```

---

## 5. Installation et démarrage

```bash
# Backend
cd indicateurs/api
npm install
cp .env.example .env          # Éditer avec les infos de connexion

# Mode développement (RECOMMANDÉ - recompile automatiquement)
nest start --watch

# Mode production
npm run build && npm run start
```

```bash
# Frontend
cd indicateurs/frontend
npm install
ng serve                       # http://localhost:4200
```

> **Important** : le serveur tourne depuis `dist/`. En mode production,
> toujours relancer `npm run build && npm run start` après modification du code backend.

---

## 6. Configuration (.env)

```bash
# BDD PLaTon (lecture seule)
PLATON_DB_HOST=localhost
PLATON_DB_PORT=5432
PLATON_DB_USERNAME=platon
PLATON_DB_PASSWORD=...
PLATON_DB_NAME=platon

# BDD Indicators (lecture/écriture)
INDICATORS_DB_HOST=localhost
INDICATORS_DB_PORT=5432
INDICATORS_DB_USERNAME=indicators
INDICATORS_DB_PASSWORD=...
INDICATORS_DB_NAME=indicators

# Serveur
PORT=3001
NODE_ENV=development

# Activité cible par défaut (utilisée quand aucune activité n'est fournie)
TARGET_ACTIVITY_ID=055dc07c-3f4a-41d8-8d2d-828b75d441b4
```

```typescript
// frontend/src/environments/environment.ts
export const environment = {
  apiUrl: 'http://localhost:3001/api',
  defaultUserId: '<uuid-user-de-test>',   // Simule la session utilisateur
};
```

---

## 7. Fonctionnalités détaillées

### 7.1 Builder d'indicateurs (admin)

Wizard en 3 étapes accessible via l'onglet "Admin" → "Nouvel indicateur".

```text
Étape 1 - Définition
  Nom, description, contextes supportés (learner / group / course / activity / global),
  événements déclencheurs.

Étape 2 - Contextes & Vues
  Un bloc par contexte sélectionné.
  Dans chaque bloc : N vues configurables (libellé, type de visu, unité, couleur, seuils).
  Types de visualisation : card | gauge | line-chart | bar-chart | histogram

Étape 3 - Formules
  Sélecteur de vue active en haut.
  Pipeline DSL drag-and-drop pour la vue sélectionnée.
  Recettes prédéfinies, mode JSON brut, preview temps réel.
```

### 7.2 Tableau de bord apprenant

Page **Overview** : grille de cartes d'indicateurs activés.
Page **Détail** : onglets par vue, graphiques ECharts (jauge, ligne, barres, histogramme).

### 7.3 Vue enseignant (Chargé de TP)

Le rôle est lu depuis `localStorage` (`userRole = 'teacher'`). Deux composants dédiés :

**TeacherContextSelectorComponent** (page Overview uniquement)
- Sélecteurs en cascade gauche → droite : **Cours → Activité → Voir par**
- "Voir par" propose "Cours entier" (`scope:course`) ou un groupe de TP (`scope:group`)
- À la sélection d'une activité : appel `POST /indicators/precompute-context` en fire-and-forget
  → précalcule toutes les vues de tous les indicateurs actifs pour ce contexte
- Contexte sélectionné **persisté dans `DashboardSettingsService`** (survive à la navigation)

**Page de détail**
- Lit le contexte sauvegardé (cours + activité + scope) sans afficher de sélecteur
- Affiche une bannière lecture seule : `[Cours] > [Activité] > [Scope]` + lien "Modifier le filtre"
- Si aucun contexte sauvegardé : empty state avec lien retour tableau de bord

### 7.4 Gestion admin

```text
Actions disponibles sur chaque indicateur
  Activation / désactivation (toggle)
  Édition (ouvre le builder pré-rempli)
  Recalcul (recalcule pour tous les utilisateurs actifs)
  Historique des versions de formule + rollback
  Logs d'exécution (durée, valeur, date)
  Suppression (cascade complète)
```

### 7.5 Ingestion d'événements (temps réel)

```text
POST /api/ingest
  → Recherche les indicateurs actifs dont requiredEvents contient l'événement
  → Exécute la formule DSL de chaque indicateur concerné
  → Upsert dans indicator_values
  Cache des indicateurs actifs (TTL 60s)
```

---

## 8. Guide - Vue apprenant

```text
1. Ouvrir http://localhost:4200

2. Voir ses indicateurs
   La page "Overview" affiche les cartes des indicateurs activés.
   Couleur de bordure :
     Vert   - valeur dans le seuil "bon"
     Orange - valeur dans le seuil "attention"
     Rouge  - valeur dans le seuil "critique"
     Gris   - aucun seuil configuré

3. Voir le détail
   Cliquer sur une carte → page de détail avec onglets (une vue par onglet)
   et graphiques ECharts.

4. Personnaliser son tableau de bord
   Onglet "Indicateurs" dans la sidebar.
   Activer ou désactiver les indicateurs disponibles.
   La valeur initiale est calculée dès l'activation.
```

---

## 9. Guide - Vue admin

```text
1. Aller dans l'onglet "Admin" (sidebar du dashboard).

2. Créer un indicateur → voir section 10 et 11.

3. Modifier un indicateur
   Bouton "Éditer" → builder pré-rempli.
   La formule précédente est automatiquement sauvegardée en version.

4. Recalculer un indicateur
   Bouton "Recalculer" → met à jour les valeurs de tous les utilisateurs actifs.
   Traitement par batch de 10 utilisateurs.

5. Rollback de formule
   Bouton "Historique" → liste des versions → "Restaurer".
   Suivi d'un recalcul pour appliquer la formule restaurée.

6. Consulter les logs d'exécution
   Bouton "Logs" → liste des exécutions avec durée et valeur produite.

7. Activer / Désactiver
   Toggle dans le tableau. Un indicateur inactif n'est plus visible
   par les apprenants et ne reçoit plus d'événements d'ingestion.

8. Supprimer
   Suppression complète en cascade : préférences, logs, versions, valeurs,
   puis la définition elle-même.
```

---

## 10. Créer un indicateur - procédure pas à pas

Accès : Dashboard → sidebar "Admin" → bouton "Nouvel indicateur"

### Étape 1 - Définition

```text
Champ                   Description / Exemple
──────────────────────────────────────────────────────────────────────
Nom                     Libellé affiché dans le tableau de bord
                        Ex : "Tentatives avant réussite"

Description             Explication pour l'apprenant
                        Ex : "Nombre moyen de tentatives avant la
                              première réussite par exercice"

Contextes supportés     Pour qui l'indicateur est pertinent.
                        Sélection multiple :
                          learner  - par apprenant (valeur individuelle)
                          group    - par groupe de TP (vue enseignant)
                          course   - par cours
                          activity - par activité
                          global   - valeur unique pour tous

                        ⚠ Sélectionner ici TOUS les contextes voulus.
                        Un bloc par contexte apparaîtra à l'étape 2.

Événements déclencheurs Quand recalculer en temps réel :
                          exercise.answered  - réponse à un exercice
                          activity.completed - complétion d'activité
                          activity.started   - démarrage d'activité
                        (laisser vide = calcul uniquement par cron)
```

### Étape 2 - Contextes & Vues

```text
Un bloc apparaît pour chaque contexte sélectionné à l'étape 1.

Dans chaque bloc, cliquer "Ajouter une vue" pour créer autant de vues
que nécessaire. Chaque vue a :

  Libellé             Nom affiché dans l'onglet (ex: "Ma performance")

  Type de visu        card         - valeur scalaire + couleur seuil
                      gauge        - jauge ECharts (0 → seuil max)
                      line-chart   - courbe d'évolution (historique)
                      bar-chart    - barres horizontales {clé: valeur}
                      histogram    - distribution [{bucket, count}]

  Unité               Texte après la valeur (%, tentatives, heures...)

  Couleur             Couleur principale du graphique

  Seuils (card/gauge) Bon (vert) ≤ X, Moyen (orange) ≤ Y, Critique > Y
```

### Étape 3 - Formules

```text
Sélecteur en haut : choisir la vue à éditer.
Le pipeline DSL en dessous s'applique à cette vue uniquement.
Changer de vue sauvegarde automatiquement le pipeline en cours.

OPTION A - Recette prédéfinie
  Cliquer sur une recette pour pré-remplir le pipeline :
    "Tentatives avant réussite"  → fetch + groupBy + findFirst + extract + avg + round
    "Note moyenne"               → fetch + extract + avg + round
    "Exercices réussis"          → fetch + filter + count

OPTION B - Construction manuelle
  Bouton "Ajouter une étape" → sélectionner le type dans le catalogue.
  Glisser-déposer pour réordonner.

OPTION C - Mode JSON brut
  Basculer en "JSON" pour saisir directement le JSON du pipeline.
  Synchronisé en temps réel avec la vue visuelle.

PARAMÈTRES DU STEP "Récupérer données" (fetch)
──────────────────────────────────────────────────────────────────────
  Table                  Choisir parmi toutes les tables PLaTon
                         (chargées dynamiquement depuis information_schema)

  Requête groupe de TP   Toggle ON/OFF
                           OFF → requête standard par utilisateur
                           ON  → requête JOIN CourseGroupsMember
                                 (ramène toutes les lignes des membres
                                  du groupe - group_id injecté automatiquement)

  Filtrer par contexte   Colonnes de filtre réelles de la table.
                         Disponibles selon la table choisie :
                           user_id     → filtre par l'utilisateur courant
                           activity_id → filtre par l'activité cible
                           course_id   → filtre par le cours courant
                         Changer de table réinitialise cette sélection.

PREVIEW - Tester avant de sauvegarder
──────────────────────────────────────────────────────────────────────
  Trois champs disponibles :
    userId      → UUID d'un apprenant ayant des sessions en base
    groupId     → UUID d'un groupe de TP valide
    activityId  → optionnel (utilise TARGET_ACTIVITY_ID si vide)

  Cliquer "Tester" (icône experiment) → exécute sur données réelles.
  Aucune donnée n'est modifiée.
  Le résultat s'affiche : scalaire, JSON (bar-chart), tableau (histogram).

Pour trouver un userId ou groupId valide, requêter la BDD PLaTon :

  -- Utilisateurs avec des sessions sur l'activité cible
  SELECT DISTINCT user_id, COUNT(*) as nb
  FROM "SessionData"
  WHERE activity_id = '<TARGET_ACTIVITY_ID>'
  GROUP BY user_id ORDER BY nb DESC LIMIT 5;

  -- Groupes de TP disponibles
  SELECT cg.id, cg.name, COUNT(cgm.user_id) as nb_membres
  FROM "CourseGroups" cg
  JOIN "CourseGroupsMember" cgm ON cgm.group_id = cg.group_id
  GROUP BY cg.id, cg.name LIMIT 5;
```

---

## 11. Exemple complet - indicateur multi-vues

### Cas : "Tentatives avant réussite"

Indicateur pédagogique mesurant le nombre moyen de tentatives nécessaires
avant la première réussite sur les exercices d'une activité.

```text
ÉTAPE 1 - DÉFINITION
──────────────────────────────────────────────────────────────────────
Nom                  : Tentatives avant réussite
Description          : Nombre moyen de tentatives avant la première
                       réussite par exercice
Contextes supportés  : learner  ET  group
Événements           : exercise.answered
```

```text
ÉTAPE 2 - CONTEXTES & VUES
──────────────────────────────────────────────────────────────────────

Bloc "Apprenant" - 1 vue
┌─────────────────────────────────────────────────────────────────┐
│ Vue 1                                                           │
│   Libellé  : Ma performance                                     │
│   Type     : Carte (valeur scalaire)                            │
│   Unité    : tentatives                                         │
│   Seuils   : Bon ≤ 2 · Moyen ≤ 4 · Critique > 4               │
└─────────────────────────────────────────────────────────────────┘

Bloc "Groupe TP" - 4 vues
┌─────────────────────────────────────────────────────────────────┐
│ Vue 1                                                           │
│   Libellé  : Moyenne globale du groupe                          │
│   Type     : Carte (valeur scalaire)                            │
│   Unité    : tentatives                                         │
│   Seuils   : Bon ≤ 2 · Moyen ≤ 4 · Critique > 4               │
├─────────────────────────────────────────────────────────────────┤
│ Vue 2                                                           │
│   Libellé  : Moyenne par exercice                               │
│   Type     : Barres horizontales                                │
│   Unité    : tentatives                                         │
├─────────────────────────────────────────────────────────────────┤
│ Vue 3                                                           │
│   Libellé  : Distribution par exercice                          │
│   Type     : Histogramme                                        │
│   Unité    : tentatives                                         │
├─────────────────────────────────────────────────────────────────┤
│ Vue 4                                                           │
│   Libellé  : Distribution par étudiant                          │
│   Type     : Histogramme                                        │
│   Unité    : tentatives                                         │
└─────────────────────────────────────────────────────────────────┘
```

```text
ÉTAPE 3 - FORMULES
──────────────────────────────────────────────────────────────────────

VUE : "Ma performance"  (contexte : Apprenant - carte)
───────────────────────────────────────────────────────
Utiliser la recette "Tentatives avant réussite" ou construire :

  [1] Récupérer données
        Table                : SessionData
        Requête groupe de TP : OFF
        Filtrer par contexte : user_id + activity_id

  [2] Grouper par
        Champ : resource_id

  [3] Premier résultat
        Condition  : grade = 100
        Trier par  : created_at

  [4] Extraire champ
        Champ : attempts

  [5] Agréger
        Fonction : avg

  [6] Arrondir
        Décimales : 2

  → Preview : remplir userId · Résultat attendu : nombre (ex: 2.4)
```

```text
VUE : "Moyenne globale du groupe"  (contexte : Groupe - carte)
───────────────────────────────────────────────────────────────
  [1] Récupérer données
        Table                : SessionData
        Requête groupe de TP : ON  ← toggle activé
        Filtrer par contexte : activity_id

  [2] Code JS
        var firstSuccess = {};
        input.forEach(function(row) {
          var key = row.user_id + '|' + row.resource_id;
          if (Number(row.grade) >= 100) {
            if (!firstSuccess[key] || row.created_at < firstSuccess[key].created_at) {
              firstSuccess[key] = row;
            }
          }
        });
        var attempts = Object.values(firstSuccess)
          .map(function(r) { return Number(r.attempts); })
          .filter(function(n) { return !isNaN(n); });
        if (!attempts.length) return 0;
        return Math.round(attempts.reduce(function(a,b){return a+b;},0)
               / attempts.length * 100) / 100;

  → Preview : remplir groupId · Résultat attendu : nombre (ex: 3.1)
```

```text
VUE : "Moyenne par exercice"  (contexte : Groupe - barres horizontales)
────────────────────────────────────────────────────────────────────────
  [1] Récupérer données
        Table                : SessionData
        Requête groupe de TP : ON
        Filtrer par contexte : activity_id

  [2] Code JS
        var firstSuccess = {};
        input.forEach(function(row) {
          var key = row.user_id + '|' + row.resource_id;
          if (Number(row.grade) >= 100) {
            if (!firstSuccess[key] || row.created_at < firstSuccess[key].created_at) {
              firstSuccess[key] = row;
            }
          }
        });
        var byExercise = {};
        Object.values(firstSuccess).forEach(function(row) {
          if (!byExercise[row.resource_name]) byExercise[row.resource_name] = [];
          byExercise[row.resource_name].push(Number(row.attempts));
        });
        var result = {};
        Object.keys(byExercise).forEach(function(k) {
          var arr = byExercise[k];
          result[k] = Math.round(arr.reduce(function(a,b){return a+b;},0)
                      / arr.length * 100) / 100;
        });
        return result;

  → Utiliser resource_name (et non resource_id) pour avoir les noms d'exercices
    comme labels dans le graphique à barres.
  → Preview : remplir groupId · Résultat attendu : objet { "Nom exercice": valeur }
  → Interprété comme barres horizontales dans la page de détail.
```

```text
VUE : "Distribution par exercice"  (contexte : Groupe - histogramme)
──────────────────────────────────────────────────────────────────────
Combien de paires (étudiant, exercice) ont réussi en 1 tentative ?
en 2 ? en 3 ? etc.
Au survol d'une barre, le tooltip affiche les noms des étudiants concernés.

  [1] Récupérer données
        Table                : SessionData
        Requête groupe de TP : ON
        Filtrer par contexte : activity_id

  [2] Code JS
        var firstSuccess = {};
        input.forEach(function(row) {
          var key = row.user_id + '|' + row.resource_id;
          if (Number(row.grade) >= 100) {
            if (!firstSuccess[key] || row.created_at < firstSuccess[key].created_at) {
              firstSuccess[key] = row;
            }
          }
        });
        var dist = {};
        var usersByBucket = {};
        Object.values(firstSuccess).forEach(function(row) {
          var n = Number(row.attempts);
          if (!isNaN(n)) {
            dist[n] = (dist[n] || 0) + 1;
            if (!usersByBucket[n]) usersByBucket[n] = [];
            if (usersByBucket[n].indexOf(row.user_id) === -1)
              usersByBucket[n].push(row.user_id);
          }
        });
        return Object.keys(dist)
          .map(Number)
          .sort(function(a,b){return a-b;})
          .map(function(b){ return { bucket: b, count: dist[b], userIds: usersByBucket[b] || [] }; });

  → Le backend résout automatiquement les userIds en "Prénom Nom" (table Users PLaTon)
    avant de stocker et retourner le résultat.
  → Preview : remplir groupId
  → Résultat brut : [ { bucket: 1, count: 12, userIds: ["uuid",...] }, ... ]
  → Résultat après résolution : [ { bucket: 1, count: 12, users: ["Alice Martin",...] }, ... ]
  → Interprété comme histogramme dans la page de détail.
```

```text
VUE : "Distribution par étudiant"  (contexte : Groupe - histogramme)
──────────────────────────────────────────────────────────────────────
Pour chaque étudiant du groupe : calculer sa moyenne de tentatives
sur tous ses exercices. Puis distribuer ces moyennes.
Au survol d'une barre, le tooltip affiche les noms des étudiants de ce bucket.

  [1] Récupérer données
        Table                : SessionData
        Requête groupe de TP : ON
        Filtrer par contexte : activity_id

  [2] Code JS
        var firstSuccess = {};
        input.forEach(function(row) {
          var key = row.user_id + '|' + row.resource_id;
          if (Number(row.grade) >= 100) {
            if (!firstSuccess[key] || row.created_at < firstSuccess[key].created_at) {
              firstSuccess[key] = row;
            }
          }
        });
        var byStudent = {};
        Object.values(firstSuccess).forEach(function(row) {
          if (!byStudent[row.user_id]) byStudent[row.user_id] = [];
          byStudent[row.user_id].push(Number(row.attempts));
        });
        var dist = {};
        var usersByBucket = {};
        Object.entries(byStudent).forEach(function(entry) {
          var userId = entry[0];
          var arr = entry[1];
          var avg = Math.round(arr.reduce(function(a,b){return a+b;},0) / arr.length);
          dist[avg] = (dist[avg] || 0) + 1;
          if (!usersByBucket[avg]) usersByBucket[avg] = [];
          usersByBucket[avg].push(userId);
        });
        return Object.keys(dist)
          .map(Number)
          .sort(function(a,b){return a-b;})
          .map(function(b){ return { bucket: b, count: dist[b], userIds: usersByBucket[b] || [] }; });

  → Le backend résout automatiquement les userIds en "Prénom Nom" (table Users PLaTon).
  → Preview : remplir groupId
  → Résultat après résolution : [ { bucket: 3, count: 1, users: ["Alice Martin"] }, ... ]
  → Interprété comme histogramme dans la page de détail.
```

---

## 12. Moteur DSL - référence des étapes

La formule est un JSON stocké dans `indicator_definitions.contextConfigs[].views[].formula` :

```json
{
  "version": "1.0",
  "pipeline": [
    { "id": "<uuid>", "type": "<étape>", "label": "...", "params": { ... } }
  ]
}
```

Chaque étape reçoit en entrée la sortie de l'étape précédente (`input`).

```text
fetch - Charge les données depuis une table PLaTon
──────────────────────────────────────────────────────────────────────
  params:
    table         : Nom de la table (ex: "SessionData")
    contextFields : ["user_id", "activity_id", "group_id", ...]

  Comportement selon contextFields :
    user_id       → WHERE user_id = :userId
    activity_id   → WHERE activity_id = :activityId (ou TARGET_ACTIVITY_ID)
    course_id     → WHERE course_id = :courseId
    group_id      → DÉCLENCHE queryTableForGroup() :
                    JOIN CourseGroupsMember ON user_id
                    → retourne les lignes de TOUS les membres du groupe

  ⚠ group_id n'est pas une colonne de SessionData.
    C'est un mot-clé DSL qui active la requête groupe.
    Dans le builder, utiliser le toggle "Requête groupe de TP" (ON)
    plutôt que de le taper manuellement.

  Sortie : tableau de lignes (objets)
```

```text
filter - Filtre les lignes selon une condition
──────────────────────────────────────────────────────────────────────
  params:
    field    : Colonne à tester (ex: "grade")
    operator : "==" | "!=" | ">" | "<" | ">=" | "<="
    value    : Valeur de comparaison (ex: 100)
  Sortie : tableau filtré
```

```text
groupBy - Groupe les lignes par valeur d'une colonne
──────────────────────────────────────────────────────────────────────
  params:
    groupField : Colonne de groupement (ex: "resource_id")
  Sortie : tableau de groupes (any[][])
```

```text
findFirst - Dans chaque groupe, trouve la première ligne correspondante
──────────────────────────────────────────────────────────────────────
  params:
    whereField  : Colonne à filtrer (ex: "grade")
    whereValue  : Valeur attendue (ex: 100)
    sortField   : Colonne de tri croissant (ex: "created_at")
  Sortie : tableau plat - une ligne par groupe
```

```text
extract - Extrait les valeurs numériques d'une colonne
──────────────────────────────────────────────────────────────────────
  params:
    extractField : Colonne à extraire (ex: "attempts")
  Sortie : tableau de nombres
```

```text
aggregate - Calcule une agrégation sur un tableau de nombres
──────────────────────────────────────────────────────────────────────
  params:
    aggregateFn : "avg" | "sum" | "min" | "max" | "count"
  Sortie : nombre unique
```

```text
round - Arrondit un nombre
──────────────────────────────────────────────────────────────────────
  params:
    decimals : Nombre de décimales (ex: 2)
  Sortie : nombre arrondi
```

```text
divide - Divise le résultat par une constante
──────────────────────────────────────────────────────────────────────
  params:
    divideBy : Diviseur (ex: 100 pour convertir en pourcentage)
  Sortie : nombre
```

```text
js - Exécute du code JavaScript arbitraire (sandbox Node.js vm, timeout 2s)
──────────────────────────────────────────────────────────────────────
  params:
    code : Code JS. La variable "input" contient la sortie de l'étape
           précédente. Utiliser "return <valeur>;" pour retourner.

  Types de retour :
    number          → valeur scalaire (card / gauge / line-chart)
    object          → { clé: valeur } (bar-chart horizontal)
    array           → [{ bucket, count }] (histogram)

  Exemple - taux de réussite :
    var total = input.length;
    var ok = input.filter(function(s){ return s.grade >= 100; }).length;
    return total > 0 ? Math.round((ok / total) * 100) : 0;

  ⚠ Utiliser la syntaxe ES5 (function, var) pour la compatibilité
    avec le module vm de Node.js.
```

---

## 13. Routes API - référence complète

Toutes les routes sont préfixées par `/api`. Toutes sont publiques (pas d'auth active).

```text
INDICATEURS
──────────────────────────────────────────────────────────────────────
GET    /indicators                         Indicateurs actifs
GET    /indicators/all                     Tous les indicateurs (admin)
GET    /indicators/schema                  Tables PLaTon + colonnes (builder)
GET    /indicators/teacher/:id/context     Cours + groupes d'un enseignant
GET    /indicators/course/:id/activities   Activités d'un cours
GET    /indicators/:id                     Détail d'un indicateur
GET    /indicators/:id/context-configs     ContextConfig[] effectifs
                                           (avec rétro-compatibilité legacy)
GET    /indicators/:id/values              Valeurs historiques
                                           ?contextType=&contextId=&period=&limit=
GET    /indicators/:id/usage               Nombre d'utilisateurs
GET    /indicators/:id/formula-history     Versions de formule
GET    /indicators/:id/logs                Logs d'exécution (?limit=50)

POST   /indicators                         Créer un indicateur
POST   /indicators/preview                 Tester une formule sans persister
                                           Body: { formula, context: { userId?, groupId?, activityId? } }
                                           Retourne: { result: any }
POST   /indicators/dashboard               Valeurs batch pour le dashboard
                                           Body: { indicators[], context }
POST   /indicators/precompute-context      Précalcule toutes les vues actives
                                           pour un contexte donné (fire-and-forget)
                                           Body: { contextType, contextId, activityId }
POST   /indicators/:id/compute-view        Calculer une vue spécifique
                                           Body: { contextType, contextId, viewId, activityId? }
                                           Retourne: { value, structuredValue?, metadata }
                                           ⚠ activityId requis pour scope course/group
POST   /indicators/:id/recalculate         Recalculer pour tous les users actifs
POST   /indicators/:id/rollback/:versionId Restaurer une version de formule

PATCH  /indicators/:id               Modifier un indicateur
PATCH  /indicators/:id/status        Activer/désactiver { isActive: boolean }
DELETE /indicators/:id               Supprimer (cascade complète)

GROUPES DE TP
──────────────────────────────────────────────────────────────────────
GET    /groups?teacherId=            Groupes d'un enseignant
GET    /groups/members?groupId=      Membres d'un groupe

PRÉFÉRENCES UTILISATEUR
──────────────────────────────────────────────────────────────────────
GET    /preferences?userId=
PATCH  /preferences/:indicatorId?userId=
       Body: { isVisible: boolean, userRole?: 'teacher' | 'admin' }
       ⚠ Si userRole = 'teacher' ou 'admin' : le pré-calcul learner est sauté
         (pas de valeur pré-calculée pour un enseignant)

INGESTION D'ÉVÉNEMENTS
──────────────────────────────────────────────────────────────────────
POST   /ingest                       Un événement
       Body: { type, userId, activityId, courseId, payload }
POST   /ingest/batch                 Tableau d'événements
```

---

## 14. Flux de données

```text
CRÉATION D'UN INDICATEUR
──────────────────────────────────────────────────────────────────────
Builder (frontend)
  → POST /api/indicators  (payload inclut contextConfigs + formula legacy)
  → indicators.service.create()
  → INSERT indicator_definitions
  → INSERT indicator_formula_versions (version 1 si formula présente)

AFFICHAGE DU DÉTAIL (page indicator-detail)
──────────────────────────────────────────────────────────────────────
ngOnInit()
  → Lit le contexte sauvegardé dans DashboardSettingsService (scope teacher)
  → GET /api/indicators/:id/context-configs
      → retourne ContextConfig[] (avec rétro-compat legacy si besoin)
  → Pour chaque vue du contextType actif :
      POST /api/indicators/:id/compute-view
        { contextType, contextId, viewId, activityId? }
      → resolveViewConfig() → FormulaInterpreterService.interpret()
      → Si résultat = tableau avec userIds : résolution en noms via getUserNameMap()
      → Clé de cache composite pour course/group : "contextId:activityId:viewId"
        (retourné directement depuis indicator_values si déjà calculé)
      → UPSERT indicator_values
      → Retourne { value, structuredValue?, metadata }
  → Rendu selon visualization.type (card / gauge / line-chart / bar-chart / histogram)
  → Histogram : tooltip affiche le nombre d'étudiants + leurs noms (Prénom Nom)

INGESTION D'UN ÉVÉNEMENT
──────────────────────────────────────────────────────────────────────
POST /api/ingest
  → ingestion.service.ingestEvent(event)
  → Indicateurs actifs (cache TTL 60s)
  → Pour chaque indicateur dont requiredEvents ∋ event.type :
      FormulaInterpreterService.interpret(formula, context)
      UPSERT indicator_values
      INSERT indicator_execution_logs

RECALCUL MANUEL
──────────────────────────────────────────────────────────────────────
POST /api/indicators/:id/recalculate
  → Charge tous les Users.isActive=true (BDD PLaTon)
  → Par batch de 10 :
      getUserSessionData(userId) → dérive latestActivityId
      FormulaInterpreterService.interpret(formula, { userId, activityId })
      UPSERT indicator_values
```

---

## 15. Maintenance et recalcul

```text
APPLIQUER LA MIGRATION contextConfigs (à faire une seule fois)
──────────────────────────────────────────────────────────────────────
psql -d indicators -f api/src/scripts/migrations/add-context-configs.sql

Ce script :
  1. Ajoute la colonne context_configs JSONB sur indicator_definitions
  2. Convertit les indicateurs existants (formula + visualization)
     en un contextConfig learner par défaut (rétro-compatibilité)

RECALCULER APRÈS MODIFICATION DE FORMULE
──────────────────────────────────────────────────────────────────────
Interface admin → bouton "Recalculer"
Ou : POST /api/indicators/:id/recalculate

NETTOYER LES LOGS SANS indicatorId (si présents)
──────────────────────────────────────────────────────────────────────
DELETE FROM indicator_execution_logs WHERE "indicatorId" IS NULL;

ROLLBACK DE FORMULE
──────────────────────────────────────────────────────────────────────
Interface admin → "Historique" → version cible → "Restaurer"
Puis recalcul pour appliquer la formule restaurée.
```

---

## 16. Limitations et points d'attention

```text
AUTHENTIFICATION
  AdminGuard    : stub, retourne toujours true.
  AuthInterceptor : vide, aucun token injecté.
  defaultUserId dans environment.ts est codé en dur.
  → À implémenter avant mise en production.

SANDBOX JS
  L'étape "js" utilise le module vm de Node.js (timeout 2s).
  Pour production avec code admin non vérifié, remplacer par
  isolated-vm pour une isolation plus robuste.

REDIS
  Configuré dans configuration.ts mais non utilisé dans le code.

BUG CONNU - activity-indicator
  ActivityIndicatorService.getIndicatorValue() appelle toujours
  AttemptsCalculatorService (hardcodé), quel que soit l'indicateur.
  N'affecte que l'endpoint /indicators/activity-attempts/*.

DÉMARRAGE BACKEND
  Toujours utiliser "nest start --watch" en développement.
  Sans --watch, le serveur tourne depuis dist/ (ancien build).

COLONNES camelCase EN BASE
  Les tables de la BDD indicators ont des colonnes en camelCase
  (indicatorId, executedAt, durationMs) car créées par TypeORM
  synchronize avant les migrations SQL. Ne pas ré-exécuter les
  migrations SQL existantes.
```
