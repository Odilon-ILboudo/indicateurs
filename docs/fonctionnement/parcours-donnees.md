# Parcours de données

Pour chaque écran : la chaîne de fichiers d'une requête, de l'écran à la
base, puis ce qu'elle fait en plus de répondre (effets de bord). Le détail
(requêtes SQL, paramètres) est dans le code ; les routes et leurs gardes
sont dans `readme.md`, section 9.

## 0. Conventions

- Chemins frontend relatifs à `frontend/src/app/`, chemins backend relatifs à
  `api/src/modules/features/`.
- Presque tous les appels frontend passent par `core/services/indicator.service.ts`.
- **PLaTon** = base PLaTon (connexion `PLATON_DATA_SOURCE`, SQL brut) ;
  **indicators** = base propre au projet (connexion TypeORM `'indicators'`).
- **activity-aware / course-aware** : une étape `fetch` ou `join` de la
  formule déclare `activity_id` (ou `course_id`) dans `contextFields`
  (`isActivityAware()`, `isCourseAware()`, `indicators/formula-resolution.util.ts`).
  La valeur dépend alors d'une activité ou d'un cours, et n'est calculée
  qu'à l'affichage sur la page correspondante.

## A. Tableau de bord

`dashboard/pages/overview/overview.page.ts` → `GET /api/indicators` →
`indicators/indicators.controller.ts` → `indicators.service.ts` →
`indicator_definitions` (indicators).
Les préférences viennent de `dashboard-settings.service.ts` →
`GET /api/preferences` → `user-preferences/` → `user_indicator_preferences`.

Seuls les indicateurs personnels globaux du rôle courant s'affichent ici ;
les autres s'affichent sur les pages cours et activité (F, G).

**Effets de bord** : aucun.

## B. Carte indicateur

`shared/ui/indicator-card/indicator-card.component.ts`, deux cas :

1. **Personnel global** : `GET /api/indicators/:id/values` → `getValues`
   → lit `indicator_values`. Aucun calcul : si rien n'est stocké, la carte
   affiche 0.
2. **Cours, groupe, activité, ou personnel lié à un cours ou une activité** :
   `POST /api/indicators/:id/compute-view` → `computeView` → lit
   `indicator_values` (cache) ; s'il n'y a rien, exécute la formule
   (moteur incrémental ou `interpreter/formula-interpreter.service.ts`)
   sur PLaTon.

**Effets de bord** de `compute-view` : écrit la valeur dans
`indicator_values` ; écrit un log dans `indicator_execution_logs` quand le
calcul passe par `interpret()` ; lit les noms dans `Users` (PLaTon) pour
remplacer les identifiants.

Le choix de visualisation (fenêtre de réglages) → `PATCH /api/preferences/:id`
→ voir D. La valeur n'est pas recalculée.

## C. Détail d'un indicateur

`indicator-detail/indicator-detail.component.ts` : lit le contexte dans
les query params (`from` = `activity`, `course`, `group-snapshot`,
`activity-personal`, `course-personal`), puis même chaîne `compute-view`
qu'en B, une fois par onglet de visualisation. Le changement d'onglet
enregistre la préférence (D). Le formulaire de retour →
`POST /api/indicators/:id/feedback` → `indicator_feedback`.

## D. Préférences

`indicator-selector/indicator-selector.component.ts` (interrupteur
« actif », visualisations masquées) → `PATCH /api/preferences/:id` →
`user-preferences/user-preferences.controller.ts` →
`user-preferences.service.ts` → `user_indicator_preferences`.
L'API ignore le `?userId=` envoyé par le frontend et utilise l'utilisateur
du token.

**Effets de bord** quand un indicateur devient visible :
- `usageCount` +1 dans `indicator_definitions` (−1 quand il est masqué) ;
- `calculateAndStoreValue` calcule tout de suite la valeur et l'écrit dans
  `indicator_values`, seulement pour un indicateur personnel global.

## E. Administration

Onglet « Indicateurs », partie admin :
`admin/admin-indicator-manager.component.ts` et
`admin/indicator-builder.component.ts` (wizard) → `indicators.controller.ts`
→ `indicators.service.ts`.

| Action | Route | Effets de bord |
|---|---|---|
| Liste | `GET /api/indicators/all` | aucun |
| Créer, modifier | `POST`, `PATCH /api/indicators/:id` | refus si un événement requis n'a pas de déclencheur installé (indicateur actif) |
| Activer, désactiver | `PATCH /api/indicators/:id/status` | aucun |
| Supprimer | `DELETE /api/indicators/:id` | supprime aussi préférences, logs et valeurs ; garde snapshots, pins, retours, notifications |
| Tester, déboguer | `POST /api/indicators/preview`, `preview-steps` | aucun : ni cache ni log |
| Recalculer | `POST /api/indicators/:id/recalculate` | `compute-view` forcé pour chaque utilisateur ayant une préférence ; écrit `indicator_values` |
| Logs | `GET /api/indicators/:id/logs` | aucun |
| Catalogue des tables | `GET /api/indicators/schema` | aucun ; colonnes sensibles filtrées (`SENSITIVE_COLUMN_PATTERN`, `core/platon/platon.service.ts`) |
| Notifier | `POST /api/indicators/:id/notify` | écrit `indicator_notifications` |
| Retours | `GET`, `DELETE /api/indicators/:id/feedback` | supprime dans `indicator_feedback` |

**Événements et déclencheurs** : `admin/event-rule-manager.component.ts`,
ouvert depuis le wizard (option « Autres… ») → `/api/event-rules*` →
`event-rules/event-rules.service.ts` → `indicator_event_rules`.
**Effet de bord important** : l'installation et la suppression définitive
exécutent du DDL dans PLaTon (`CREATE`/`DROP TRIGGER`), avec les identifiants
admin s'ils sont configurés.

## F. Page activité et snapshots de groupe

`courses/course/activity/activity.page.ts` charge les indicateurs
(`GET /api/indicators`) et les pins (`GET /api/indicators/pins`), puis
chaque carte suit B.

`courses/course/activity/group-snapshots-panel.component.ts` :
`GET /api/v1/courses/:id/groups` (PLaTon), puis
`GET`, `POST`, `PATCH`, `DELETE /api/indicators/:id/snapshots` →
`indicator_snapshots`.

**Pins** (pages cours et activité, « Figer ») : `POST`, `DELETE
/api/indicators/:id/pins` → `indicator-pins/indicator-pins.service.ts` →
`indicator_pins`.

**Effet de bord indirect** : chaque événement reçu recalcule les snapshots
concernés (`refreshSnapshots`, aucune route) et les envoie par WebSocket (I).

## G. Cours

`courses/` → `frontend/src/platon-stubs/course-browser/course.service.ts` →
`/api/v1/courses*` → `courses/courses.controller.ts` →
`courses/courses.service.ts` → SQL brut sur PLaTon (`Courses`,
`CourseMembers`, `CourseGroups`, `Activities`, `Sessions`, `SessionData`,
`Users`, `Resources`). Couvre la liste des cours, le détail, les sections,
les activités, les membres, les groupes, les résultats d'une activité et le
CSV.

**Effet de bord important** : ajouter, retirer un membre ou changer son rôle
(`POST`, `DELETE`, `PATCH /api/v1/courses/:id/members`) **écrit dans la table
PLaTon `CourseMembers`**. Les autres actions d'écriture de ces pages
(sections, groupes, activités) ne font rien : le service frontend renvoie un
résultat vide sans appel HTTP.

## H. Ressources

`resources/` → `/api/v1/resources*`, lecture seule sur PLaTon. Aucune page
du frontend ne l'appelle.

## I. Événements PLaTon (sans écran)

Trigger générique dans PLaTon → `platon_outbox_events` → relais côté PLaTon
→ RabbitMQ → `ingestion/ingestion-consumer.service.ts` (classement par
`event-rules/event-classifier.service.ts`) → `ingestion/ingestion.service.ts`
→ `computeViewIncremental` → `indicator_values` → WebSocket
(`ingestion/indicators.gateway.ts`, envoi à tous les clients) →
`core/services/indicator-socket.service.ts` met la carte à jour.
Détail : [`ingestion-evenements.md`](./ingestion-evenements.md) et
[`calcul-differentiel.md`](./calcul-differentiel.md).

`outbox-maintenance/outbox-maintenance.service.ts` supprime dans PLaTon les
lignes de `platon_outbox_events` de plus de 7 jours.

## Ce que le projet écrit dans PLaTon

1. `CourseMembers` (G) ;
2. purge de `platon_outbox_events` (I) ;
3. DDL des déclencheurs (E).

Tout le reste est écrit dans la base `indicators`.
