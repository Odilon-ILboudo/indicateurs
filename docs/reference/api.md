# Routes API

Toutes les routes sont préfixées `/api`. Les contrôleurs `courses`,
`resources`, `users` et `user-preferences` exigent un token valide sur toutes
leurs routes (`AuthGuard`, voir [securite.md](../architecture/securite.md)). `event-rules` exige en plus le rôle
`admin` (`AdminGuard`) sur **toutes** ses routes, y compris les `GET`. Dans
`indicators` et `event-types`, chaque route a sa propre protection, indiquée
ci-dessous ; une route sans annotation n'exige **aucun token** (c'est le cas
de la liste des indicateurs, d'un indicateur et des types d'événements : des
définitions, sans donnée personnelle).

Légende : **(admin)** = `AuthGuard` + `AdminGuard` ; **(connecté)** =
`AuthGuard` seul ; **(rôle visible)** = `AuthGuard` + `IndicatorVisibilityGuard`
(règle décrite dans [modele-indicateur.md](../fonctionnement/modele-indicateur.md)).

## Indicateurs (`/api/indicators`, `indicators.controller.ts`)

```
GET  /indicators                       : indicateurs actifs
GET  /indicators/all                   : tous, y compris inactifs (admin)
GET  /indicators/search?q=&excludeId=  : recherche par nom ou description, détection de doublons (admin)
GET  /indicators/schema                : tables et colonnes PLaTon disponibles, colonnes sensibles exclues (admin)
GET  /indicators/schema/full           : schéma complet avec relations, explorateur de schéma (admin)
GET  /indicators/courses/search?q=&offset=   : recherche de cours (tous les cours) pour le panneau « Tester cette formule » (admin)
GET  /indicators/course/:courseId/activities : activités d'un cours (admin)
GET  /indicators/course/:courseId/students   : étudiants d'un cours (id, prénom, nom) (admin)
GET  /indicators/pins?contextType=&contextId= : indicateurs figés sur un cours ou une activité (connecté)
GET  /indicators/pins/counts           : nombre de pins par indicateur, tous cours et activités confondus (connecté)
GET  /indicators/:id
GET  /indicators/:id/values?contextType=&contextId=&period=&limit= (rôle visible)
GET  /indicators/:id/usage            : (admin)
GET  /indicators/:id/logs?limit=       : (admin)

POST /indicators                       : créer (admin)
POST /indicators/preview               : { formula, context } → { result }, exécute le DSL (admin)
POST /indicators/preview-steps         : idem, étape par étape (admin)
POST /indicators/:id/compute-view      : { contextType, contextId, vizId?, activityId?, courseId? } (rôle visible)
POST /indicators/:id/recalculate       : (admin)
POST /indicators/:id/pins              : { contextType, contextId, thresholdsOverride? }, figer (connecté, puis contrôle admin ou enseignant*)
DELETE /indicators/:id/pins?contextType=&contextId= : défiger (connecté, puis contrôle admin ou enseignant*)

PATCH  /indicators/:id                 : (admin)
PATCH  /indicators/:id/status          : (admin)
DELETE /indicators/:id                 : (admin)

GET    /indicators/:id/snapshots?activityId= ou ?courseId= (rôle visible)
POST   /indicators/:id/snapshots       : { contextType, contextId, activityId ou courseId, title }, 409 si doublon (rôle visible)
PATCH  /indicators/:id/snapshots/:snapshotId  : renommer (rôle visible)
DELETE /indicators/:id/snapshots/:snapshotId  : supprimer (rôle visible)

POST   /indicators/:id/notify          : notification liée à l'indicateur (admin)
GET    /indicators/notifications/all   : toutes les notifications (admin)

POST   /indicators/:id/feedback        : { rating, comment? }, crée un retour (connecté ; l'auteur est l'utilisateur du token)
GET    /indicators/:id/feedback        : retours d'un indicateur, avec nom de l'auteur (admin)
DELETE /indicators/:id/feedback/:feedbackId : (admin)
```

> \* Pas d'`AdminGuard` sur ces deux routes : le contrôle fin (admin global,
> ou membre `teacher` du cours dans `CourseMembers`) est fait dans
> `IndicatorPinsService#assertCanManagePins`.

> Dans le contrôleur, les routes `GET` littérales d'un seul segment (`all`,
> `search`, `schema`, `pins`) et leurs sous-routes sont déclarées **avant**
> `GET /:id`, pour qu'Express ne les prenne pas pour un identifiant.

## Préférences utilisateur (`/api/preferences`, `user-preferences.controller.ts`)

```
GET    /preferences                  : préférences de l'utilisateur connecté
GET    /preferences/:indicatorId
POST   /preferences/:indicatorId     : { isVisible?, displayPreferences?, activeVizId?, enabledVizIds? } (rôle visible)
PATCH  /preferences/:indicatorId     : mêmes champs (rôle visible)
DELETE /preferences/:indicatorId
```

Protégé par `AuthGuard` (voir [securite.md](../architecture/securite.md)) : l'utilisateur concerné est
toujours `request.user.id` (identité tirée du token), jamais un `?userId=`
fourni par le client. Accepter un identifiant venu du client permettrait de
lire ou modifier les préférences de n'importe qui en changeant l'URL. Le
frontend envoie encore `?userId=` dans l'URL, mais l'API l'ignore. Le corps
peut contenir `userRole`, que l'API ignore aussi.

Quand un indicateur `learner`, `teacher` ou `admin` est activé, l'API calcule
et enregistre aussitôt sa valeur pour l'utilisateur
(`calculateAndStoreValue`), sauf si la formule filtre par activité ou par
cours. Les autres types sont calculés à leur première consultation.

## Cours (`/api/v1/courses`, `courses.controller.ts`)

```
GET /v1/courses                              : recherche (filtres : search, members, period, offset, limit, order, direction)
GET /v1/courses/:id                          : détail (+ statistic : studentCount, teacherCount, activityCount, progression, timeSpent)
GET /v1/courses/:id/sections
GET /v1/courses/:id/activities               : filtres sectionId, challenge ; titre, état, progression et exerciseCount calculés
GET /v1/courses/:id/groups                   : groupes de TP du cours
GET /v1/courses/:id/groups/:groupId/members
GET /v1/courses/:id/members
POST /v1/courses/:id/members                 : ajoute un membre (CreateCourseMemberDto), écrit dans PLaTon
PATCH /v1/courses/:id/members/:memberId      : change le rôle d'un membre (UpdateCourseMemberRoleDto), écrit dans PLaTon
DELETE /v1/courses/:id/members/:memberId     : retire un membre, écrit dans PLaTon
GET /v1/courses/:courseId/activities/:activityId
GET /v1/courses/:courseId/activities/:activityId/results   : résultats par exercice et par étudiant (avec e-mail)
GET /v1/courses/:courseId/activities/:activityId/results/date?start=&end=
GET /v1/courses/:courseId/activities/:activityId/csv       : téléchargement CSV
```

> `:courseId` est ignoré par les routes `results`, `results/date` et `csv` :
> seul `:activityId` compte (le frontend envoie souvent `_`). Il est en
> revanche utilisé par `GET /:courseId/activities/:activityId`.

Protégé par `AuthGuard` seulement : tout utilisateur connecté peut lire ces
routes, quel que soit son lien avec le cours. `GET /:id`, `GET /:id/activities`
et `GET /:courseId/activities/:activityId` utilisent `request.user.id` pour
calculer les permissions renvoyées, selon la règle de PLaTon :
- pour un cours, `update` = propriétaire, admin global ou membre `teacher` du
  cours ; `delete` = propriétaire ou admin global ;
- pour une activité, `update` et `viewResource` = admin global ou membre
  `teacher` du cours ; `viewStats` est toujours vrai.

Les trois routes d'écriture sur les membres exigent la même condition que
l'`update` d'une activité (admin global ou membre `teacher` du cours).

## Ressources (`/api/v1/resources`, `resources.controller.ts`)

```
GET /v1/resources                : recherche (filtres multiples)
GET /v1/resources/tree           : arbre de cercles (type=CIRCLE, personal=false)
GET /v1/resources/completion     : autocomplétion des noms
GET /v1/resources/owners         : propriétaires distincts
GET /v1/resources/user-circle    : cercle personnel de l'utilisateur courant
GET /v1/resources/:id
```

Protégé par `AuthGuard`. `user-circle` et `GET /:id` utilisent
`request.user.id`. `GET /:id` calcule les permissions
(`write`, `member`, `watcher`, `waiting`) selon la règle de PLaTon :
propriétaire du cercle, admin global sur un cercle non personnel, membre
accepté du cercle ou d'un cercle ancêtre ; `read` est toujours `true`. Ce
module ne fait que lire.

## Types d'événements (`/api/event-types`, `event-types.controller.ts`)

```
GET    /event-types?configured=true   : sans le filtre, tous les types ; avec, seulement ceux qui ont une règle active et installée
GET    /event-types/:id
POST   /event-types          : (admin)
PATCH  /event-types/:id      : (admin)
DELETE /event-types/:id      : (admin), refusé si une règle utilise encore ce type
```

## Déclencheurs dynamiques (`/api/event-rules`, `event-rules.controller.ts`)

Fonctionnement détaillé dans [ingestion-evenements.md](../fonctionnement/ingestion-evenements.md).
Toutes les routes sont protégées par `AuthGuard` + `AdminGuard`, y compris
les `GET`, car elles exposent des noms de tables et de colonnes PLaTon et du
SQL généré.

```
GET    /event-rules
GET    /event-rules/:id
POST   /event-rules
PATCH  /event-rules/:id
DELETE /event-rules/:id                    : simple désactivation (isActive = false), ne touche pas au trigger
POST   /event-rules/:id/reactivate         : réactive une règle désactivée (isActive = true)

GET    /event-rules/:id/preview-sql        : aperçu du DDL d'installation, sans effet
POST   /event-rules/:id/install            : exécute réellement le DDL

GET    /event-rules/:id/preview-uninstall-sql  : aperçu du DDL de retrait, sans effet
POST   /event-rules/:id/uninstall          : exécute le retrait (ou la réduction), puis désactive la règle

GET    /event-rules/:id/preview-hard-delete-sql  : aperçu du DDL de suppression définitive, sans effet
POST   /event-rules/:id/hard-delete        : retire le trigger puis supprime la règle en base (irréversible)
```

## Utilisateurs (`/api/users`, `users.controller.ts`)

```
GET /users?search=&roles=&limit= : recherche d'utilisateurs actifs (id, nom d'utilisateur, prénom, nom, rôle, e-mail)
GET /users/:id                   : un utilisateur (mêmes champs)
```

Protégé par `AuthGuard` : un token valide suffit, quel que soit le rôle.

## Ingestion

Le module `ingestion` (`api/src/modules/features/ingestion/`) n'expose
aucune route HTTP : c'est uniquement un consommateur RabbitMQ
(`IngestionConsumerService`, voir [ingestion-evenements.md](../fonctionnement/ingestion-evenements.md)).
Aucun point d'entrée HTTP ne permet d'injecter un événement.
