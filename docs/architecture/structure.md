# Structure du dépôt

Où se trouve chaque chose dans `api/` (NestJS) et `frontend/` (Angular).

## Backend (`api/src/`)

```
main.ts                : bootstrap NestJS, préfixe /api, CORS, ValidationPipe global
app.module.ts          : module racine, importe tous les modules ci-dessous
modules/
  core/
    core.module.ts              : configuration + connexion TypeORM nommée 'indicators'
    config/configuration.ts     : lecture des variables d'env (port, BDD, JWT, cron, RabbitMQ)
    platon/platon.module.ts     : connexion à la BDD PLaTon (fournisseur PLATON_DATA_SOURCE)
    platon/platon.service.ts    : requêtes SQL brutes vers la BDD PLaTon utilisées par le DSL
    auth/auth.guard.ts          : vérifie le token Authorization: Bearer (voir [securite.md](securite.md))
    guards/admin.guard.ts       : restreint une route au rôle 'admin' (lit request.user.id posé par AuthGuard)
    guards/indicator-visibility.guard.ts : refuse un indicateur que le rôle ne peut pas voir (voir [modele-indicateur.md](../fonctionnement/modele-indicateur.md))
  features/
    indicators/                 : cœur du projet (entités, moteur DSL, CRUD, snapshots)
      entities/                 : 6 entités TypeORM de ce module (voir [donnees.md](donnees.md) pour les 10 au total)
      interpreter/formula-interpreter.service.ts : moteur DSL (voir [moteur-formules.md](../fonctionnement/moteur-formules.md))
      indicators.controller.ts  : toutes les routes /api/indicators*
      indicators.service.ts     : logique métier (computeView, recalculate, snapshots…)
    event-types/                : types d'événements gérés en BDD (CRUD, seed au démarrage)
    event-rules/                : déclencheurs dynamiques, règle → trigger PostgreSQL généré (voir [ingestion-evenements.md](../fonctionnement/ingestion-evenements.md))
      event-classifier.service.ts : interprète un événement générique brut selon les règles actives
    indicator-pins/             : indicateurs figés par un enseignant sur un cours/activité (voir [donnees.md](donnees.md))
    user-preferences/           : préférences d'affichage par utilisateur
    ingestion/                  : consumers RabbitMQ, passerelle WebSocket, service d'ingestion
      ingestion-consumer.service.ts : 2 consumers, routing key '#' (learner + aggregate)
      indicators.gateway.ts     : WebSocket /indicators, émet indicator.updated
      ingestion.service.ts      : aiguille chaque événement vers le calcul des indicateurs concernés
    outbox-maintenance/         : purge quotidienne de platon_outbox_events (> 7 jours) sur la BDD PLaTon
    aggregation/                : recalcul périodique des indicateurs actifs sans déclencheur (TRIGGERLESS_RECALC_CRON, voir [moteur-formules.md](../fonctionnement/moteur-formules.md))
    courses/                    : cours, sections, activités, groupes, résultats ; ajoute, retire et modifie aussi des membres de cours (écriture, voir [donnees.md](donnees.md))
    resources/                  : lecture des ressources PLaTon et de l'arbre de cercles
    users/                      : lecture des utilisateurs PLaTon
```

## Frontend (`frontend/src/app/`)

```
app.routes.ts           : route racine, redirige vers /dashboard
core/
  auth/                             : AuthProvider (auth.types.ts, current-user.ts, remote-auth.provider.ts)
  guards/
    auth.guard.ts                   : exige un jeton dans localStorage, sinon renvoie vers /authentification
    indicator.guard.ts              : vérifie l'existence d'un indicateur :id (branché sur aucune route)
  interceptors/auth.interceptor.ts : injecte le Bearer token, gère les 401
                                      (déconnexion en standalone, ou événement
                                      indicateurs-token-expired en mode embarqué)
  models/indicator.model.ts        : types partagés (IndicatorDefinition, IndicatorVisualization…)
  tokens/
    embedded-mode.token.ts         : bascule standalone / embarqué
    route-base-path.token.ts       : préfixe des routes ('/dashboard' en standalone, racine en embarqué)
  services/
    indicator.service.ts           : client HTTP + caches (préférences viz, visibilité)
    indicator-list-state.service.ts : mémorise filtres et onglets des listes pendant la session
    indicator-socket.service.ts    : WebSocket (indicator.updated)
    dashboard-settings.service.ts  : indicateurs activés par l'utilisateur courant
    role.service.ts                : rôle courant + règles de visibilité (voir [modele-indicateur.md](../fonctionnement/modele-indicateur.md))
    user.service.ts                : lecture d'un utilisateur par son id
features/
  authentification/       : page de connexion standalone
  dashboard/
    dashboard.page.ts/html         : coquille (sidebar + toolbar + router-outlet)
    pages/
      overview/                    : grille des indicateurs actifs
      indicators/                  : onglet « Indicateurs » : préférences, et gestion pour l'admin
      context-indicators/          : page utilisée uniquement par les routes embarquées (voir [frontend.md](../reference/frontend.md))
      embed-test/                  : page de diagnostic du mode embarqué, jamais liée dans la navigation
      widgets/sidebar/ + toolbar/
  admin/
    admin-indicator-manager.component.ts  : table CRUD admin
    indicator-builder.component.ts        : wizard de création/édition (3 étapes, voir sections 6 et 7)
    event-rule-manager.component.ts       : écran « Événements & déclencheurs » (voir [ingestion-evenements.md](../fonctionnement/ingestion-evenements.md))
    event-rule-builder.component.ts       : wizard guidé de création d'une règle
    event-rule-install-modal.component.ts : aperçu SQL + confirmation d'installation ou de retrait
  indicator-selector/    : l'utilisateur active ou désactive ses indicateurs
  indicator-detail/      : page détail d'un indicateur (un onglet par visualisation)
  pin-indicator-modal/   : figer un indicateur sur un cours ou une activité (enseignant, voir [donnees.md](donnees.md))
  courses/               : pages « Cours » copiées et adaptées depuis PLaTon (voir « Stubs PLaTon » plus bas)
shared/
  ui/indicator-card/ (dont indicator-config-modal.component.ts, réglages rapides d'affichage) + indicator-reuse-card/ + layout-block/
  utils/indicator-family-grouping.ts    : regroupement par famille (voir [modele-indicateur.md](../fonctionnement/modele-indicateur.md))
  utils/indicator-chart-options.util.ts : options de graphique partagées (voir [frontend.md](../reference/frontend.md))
  styles/                 : SCSS, thèmes Material clair et sombre, ng-zorro
```

## Stubs PLaTon (`frontend/src/platon-stubs/`)

Les pages « Cours » viennent de PLaTon et ont été adaptées. Leurs dépendances
`@platon/*` et `@cisstech/nge/*` sont remplacées par des stubs locaux, via des
alias déclarés dans `tsconfig.json` :

| Stub (`src/platon-stubs/`) | Alias tsconfig |
|---|---|
| `core-common.ts` / `core-browser.ts` / `core-server.ts` | `@platon/core/common` / `@platon/core/browser` / `@platon/core/server` |
| `core-browser/user-search-bar/` | composant `UserSearchBarComponent` (ControlValueAccessor) |
| `course-common.ts` / `course-browser.ts` | `@platon/feature/course/{common,browser}` |
| `resource-browser/nge-ui-list/` | `@cisstech/nge/ui/list` (liste générique ; il n'y a pas de page Ressources) |
| `feature-result-common.ts` / `feature-result-browser.ts` | `@platon/feature/result/{common,browser}` |
| `feature-peer-browser.ts`, `shared-ui.ts` | `@platon/feature/peer/browser`, `@platon/shared/ui` |
| `nge-directives.ts`, `nge-pipes.ts` | `@cisstech/nge/{directives,pipes}` |

Points clés de ces stubs :
- `AuthService.ready()` lit l'utilisateur connecté depuis `localStorage.currentUser`
  (rempli à la connexion, voir [securite.md](securite.md)), avec un repli sur un utilisateur anonyme
  (`role: student`) s'il est absent.
- `CourseService` fait de **vrais appels HTTP** vers `/api/v1/courses*`
  (module `courses` du backend) pour la lecture, et pour trois écritures :
  ajouter un membre, le retirer, changer son rôle. Ces trois appels modifient
  réellement la table `CourseMembers` de PLaTon (voir [donnees.md](donnees.md)). Les autres
  opérations d'écriture (créer, déplacer, modifier un cours ou une activité…)
  ne font rien.
- Les composants UI (`UiLayoutTabsComponent`, `UiStatisticCardComponent`,
  `UiSearchBarComponent`, etc.) sont réimplémentés localement, sans dépendre
  du workspace Nx de PLaTon.
