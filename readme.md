# Indicateurs — État actuel du projet

Ce document remplace l’ancienne documentation obsolète et décrit l’état réel du dépôt tel qu’il existe aujourd’hui dans les fichiers sources.

---

## 1. Vue d’ensemble

Le projet est une application full-stack qui combine :

- un frontend Angular 21 dans le dossier frontend
- un backend NestJS dans le dossier api
- une lecture de la base PLaTon (données pédagogiques)
- un stockage des définitions et valeurs d’indicateurs dans une base Indicators distincte

L’objectif principal est d’afficher et de calculer des indicateurs pédagogiques à partir de données existantes, avec une logique de formule DSL et une gestion de préférences utilisateur.

---

## 2. Architecture réelle actuelle

### 2.1 Frontend

Le frontend Angular est démarré depuis la racine du dossier frontend.

Structure principale :

- src/app/app.routes.ts : route racine de l’application
- src/app/features/dashboard : tableau de bord principal
- src/app/features/courses : navigation par cours
- src/app/features/resources : navigation par ressources
- src/app/features/admin : composants de gestion / configuration d’indicateurs
- src/app/features/indicator-detail : affichage détaillé d’un indicateur
- src/app/core/services : appels API, préférences, rôles, contexte dashboard

### 2.2 Backend

Le backend NestJS est démarré depuis le dossier api.

Structure principale :

- src/main.ts : point d’entrée, prefix /api, CORS
- src/app.module.ts : module racine
- src/modules/core : configuration globale, connexion DB, service PLaTon
- src/modules/features : modules métier

### 2.3 Bases de données

Le backend utilise actuellement deux mondes de données :

1. Base PLaTon (lecture seule)
   - tables pédagogiques : Users, Activities, Resources, SessionData, Courses, CourseGroups, CourseGroupsMember, etc.
   - utilisée pour lire les données source

2. Base Indicators (lecture/écriture)
   - tables d’indicateurs et de préférences : indicator_definitions, indicator_values, indicator_formula_versions, indicator_execution_logs, indicator_snapshots, user_indicator_preferences

---

## 3. Modules fonctionnels réellement présents

### Backend

- CoreModule
  - charge la configuration globale
  - initialise la connexion TypeORM sur la base Indicators
  - initialise la connexion directe PLaTon via DataSource

- IndicatorsModule
  - gestion des indicateurs
  - calcul des vues
  - versionnage des formules
  - logs d’exécution
  - snapshots

- ActivityIndicatorModule
  - logique liée aux indicateurs d’activité

- IngestionModule
  - ingestion d’événements bruts
  - calcul et mise à jour des valeurs à partir d’événements

- AggregationModule
  - agrégation périodique via cron NestJS

- UserPreferencesModule
  - stockage des préférences utilisateur : visibilité, visualisation active, paramètres d’affichage

- UsersModule / GroupsModule / CoursesModule / ResourcesModule
  - lecture de données de contexte pour le dashboard et les indicateurs

### Frontend

- dashboard
  - écran principal
  - sidebar de navigation
- indicators
  - consultation et gestion des indicateurs
- courses / resources
  - navigation de contexte pédagogique
- admin
  - composants de gestion et builder d’indicateurs
- indicator-detail
  - affichage détaillé d’un indicateur

---

## 4. Arborescence réelle du dépôt

```text
indicateurs/
├── api/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── modules/
│   │   │   ├── core/
│   │   │   │   ├── config/
│   │   │   │   ├── database/
│   │   │   │   ├── guards/
│   │   │   │   └── platon/
│   │   │   └── features/
│   │   │       ├── activity-indicator/
│   │   │       ├── aggregation/
│   │   │       ├── courses/
│   │   │       ├── groups/
│   │   │       ├── indicators/
│   │   │       │   ├── calculators/
│   │   │       │   ├── entities/
│   │   │       │   ├── interpreter/
│   │   │       │   ├── indicators.controller.ts
│   │   │       │   └── indicators.service.ts
│   │   │       ├── ingestion/
│   │   │       ├── resources/
│   │   │       ├── user-preferences/
│   │   │       └── users/
│   └── package.json
│
└── frontend/
    └── src/
        ├── app/
        │   ├── core/
        │   │   ├── auth/
        │   │   ├── guards/
        │   │   ├── interceptors/
        │   │   ├── models/
        │   │   └── services/
        │   ├── features/
        │   │   ├── activity-indicator/
        │   │   ├── admin/
        │   │   ├── courses/
        │   │   ├── dashboard/
        │   │   ├── indicator-detail/
        │   │   ├── indicator-selector/
        │   │   └── resources/
        │   └── shared/
        │       ├── pipes/
        │       ├── styles/
        │       ├── ui/
        │       └── utils/
        ├── environments/
        └── platon-stubs/
```

---

## 5. Routes API réellement implémentées

Le backend expose actuellement les routes suivantes via le contrôleur des indicateurs et les modules associés.

### Indicateurs

- GET /api/indicators
- GET /api/indicators/all
- GET /api/indicators/schema
- GET /api/indicators/teacher/:teacherId/context
- GET /api/indicators/course/:courseId/activities
- GET /api/indicators/course/:courseId/students
- GET /api/indicators/:id/context-configs
- GET /api/indicators/:id
- GET /api/indicators/:id/values
- GET /api/indicators/:id/usage
- GET /api/indicators/:id/formula-history
- GET /api/indicators/:id/logs
- GET /api/indicators/:id/snapshots
- POST /api/indicators
- POST /api/indicators/dashboard
- POST /api/indicators/:id/compute-view
- POST /api/indicators/preview
- POST /api/indicators/precompute-context
- POST /api/indicators/:id/recalculate
- POST /api/indicators/:id/rollback/:versionId
- PATCH /api/indicators/:id
- PATCH /api/indicators/:id/status
- DELETE /api/indicators/:id
- POST /api/indicators/:id/snapshots
- PATCH /api/indicators/:id/snapshots/:snapshotId
- DELETE /api/indicators/:id/snapshots/:snapshotId

### Préférences utilisateur

- GET /api/preferences?userId=
- GET /api/preferences/:indicatorId?userId=
- POST /api/preferences/:indicatorId?userId=
- PATCH /api/preferences/:indicatorId?userId=
- DELETE /api/preferences/:indicatorId?userId=

### Ingestion

- POST /api/ingest
- POST /api/ingest/batch

---

## 6. Ce qui est réellement utilisé côté interface

La navigation réelle du frontend est composée de pages et composants suivants :

- Tableau de bord
- Indicateurs
- Cours
- Espace de travail
- Détail d’un indicateur
- Gestion / builder d’indicateurs (composants admin présents dans le code, mais non exposés dans la sidebar principale actuelle)

Important : la sidebar actuelle ne rend pas un onglet Admin dédié dans la navigation principale. Les composants admin existent bien dans le code, mais leur intégration dans le flux utilisateur courant est partielle.

---

## 7. Données et entités importantes

### Entités indicators

- IndicatorDefinition
  - nom, description, contexte, famille, événements requis, visualisations, formule, activation
  - la `unit` et les `thresholds` de performance sont des métadonnées d’affichage attachées à chaque visualisation, pas à la formule elle-même

- IndicatorValue
  - résultat calculé pour un contexte donné
  - metadata avec historique, dernière mise à jour, valeurs structurées

- IndicatorFormulaVersion
  - historique des versions de formule

- IndicatorExecutionLog
  - logs d’exécution

- IndicatorSnapshot
  - sauvegardes de vue / comparaison par groupe et activité

### Entité préférences

- UserIndicatorPreference
  - visibilité d’indicateur
  - visualisation active
  - visualisations activées

---

## 8. Flux métier réel

1. Le frontend charge les indicateurs et les préférences utilisateur.
2. L’API récupère les données source depuis PLaTon.
3. Le service d’indicateurs calcule les valeurs à partir d’une formule DSL.
4. Les résultats sont stockés dans la base Indicators.
5. Le frontend affiche les indicateurs et leurs visualisations.
6. Les préférences utilisateur influencent l’affichage et les visualisations actives.

---

## 9. Points à retenir

- Ce projet n’est pas “juste un dashboard statique” : il contient une logique de calcul d’indicateurs et un moteur DSL.
- La base PLaTon est utilisée en lecture seule.
- Les résultats calculés sont stockés dans la base Indicators.
- L’architecture actuelle est modulaire et évolutive, mais certaines parties de l’interface (notamment l’admin) sont encore partiellement intégrées.

---

## 10. Conclusion

Le README précédent était obsolète sur plusieurs points :

- arborescence trop détaillée et non alignée avec les dossiers actuels
- description de l’interface admin trop optimiste par rapport à la navigation réelle
- omission de certaines tables réelles utilisées par l’API
- confusion entre `visualization` et `visualizations`

Ce document reflète désormais l’état réel du dépôt tel qu’il est implémenté dans les sources actuelles.
