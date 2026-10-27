# Données : bases et entités

Les deux bases utilisées par Indicateurs, ce qu'il écrit dans PLaTon, et les entités de sa propre base.

## Deux connexions, un seul serveur

Indicateurs n'a pas son propre serveur Postgres. Il utilise celui de PLaTon,
avec deux bases distinctes :

| Base | Accès | Comment | Fichier |
|---|---|---|---|
| `platon_db` | lecture, et quelques écritures (voir plus bas) | SQL brut, `DataSource` fournie sous le nom `PLATON_DATA_SOURCE` | `api/src/modules/core/platon/platon.module.ts` |
| `indicators` | lecture/écriture | TypeORM, connexion nommée `indicators` | `api/src/modules/core/core.module.ts` |

## Base PLaTon

Toutes les tables du schéma `public` sont accessibles dynamiquement dans le
builder DSL, sans liste blanche de tables. Les noms sont vérifiés
(`information_schema` et une expression régulière contre l'injection SQL dans
`PlatonService.queryTable()`), et les colonnes au nom sensible (mot de passe,
e-mail, jeton, téléphone…) ne sont jamais renvoyées.

Tables principales :

| Table | Rôle |
|---|---|
| `SessionData` | Table dénormalisée : une ligne = une session utilisateur × exercice (`user_id`, `activity_id`, `course_id`, `resource_id`, `grade`, `attempts`, `created_at`, …). Table principale pour les formules. |
| `Sessions` / `Activities` / `Resources` / `Users` / `Courses` | Tables sources |
| `CourseMembers` (`course_id`, `user_id`, `role`) | Membres d'un cours (étudiants, enseignants) |
| `CourseGroups` (`id` UUID, `group_id` varchar, `course_id`, `name`) | Groupes de TP |
| `CourseGroupsMember` (`group_id` varchar, `user_id`) | Appartenance aux groupes |

**Ce qu'Indicateurs écrit dans la base PLaTon.** L'essentiel des accès est en
lecture, mais pas tout :

| Écriture | Où | Quand |
|---|---|---|
| Ajout, retrait et changement de rôle d'un membre de cours (`CourseMembers`) | `courses.service.ts` (`createMember`, `deleteMember`, `updateMemberRole`) | depuis les pages « Cours », par un admin ou un enseignant du cours |
| Suppression des lignes de plus de 7 jours de `platon_outbox_events` | `outbox-maintenance.service.ts` | chaque nuit à minuit |
| Création ou retrait de la fonction `fn_platon_outbox_generic` et d'un déclencheur par table | `event-rules.service.ts` | sur clic dans l'écran « Événements & déclencheurs » (voir [ingestion-evenements.md](../fonctionnement/ingestion-evenements.md)) |
| Création de la table `platon_outbox_events` | `api/scripts/migrations/platon-outbox.sql` | script à exécuter une fois, à la main |
| Ajout des colonnes `status` et `attempts_at_success` sur `SessionData`, et d'un déclencheur sur `Answers` | `api/src/scripts/migrations/` | scripts à exécuter une fois, à la main (voir ci-dessous) |

Une fois installés, les déclencheurs écrivent eux-mêmes dans PLaTon, dans la
transaction de la modification d'origine : une ligne dans `platon_outbox_events`
(voir [ingestion-evenements.md](../fonctionnement/ingestion-evenements.md)), et la colonne `attempts_at_success` (ci-dessous).

**Colonnes ajoutées sur `SessionData` par ce projet** (pas présentes dans
PLaTon d'origine ; scripts dans `api/src/scripts/migrations/`, à exécuter avec un
rôle Postgres propriétaire des tables, voir `PLATON_DB_ADMIN_*`) :
- **`status`** (`add-platon-status-column.sql`) : anticipe une colonne annoncée
  par l'équipe PLaTon. Le script la remplit une fois, à partir de
  `grade`, `attempts` et `started_at`. Valeurs :
  `non commencé | commencé | réussi | échoué | erreur`. Rien ne la tient à jour
  ensuite.
- **`attempts_at_success`** (`add-platon-attempts-at-success-column.sql`) :
  rang de la première réponse notée 100 parmi les réponses de la session
  (calculé depuis `Answers`), `NULL` si la session n'a jamais été réussie. Le
  script la remplit pour les données existantes, puis installe le déclencheur
  `trg_platon_attempts_at_success` sur `Answers`, qui la fixe à la première
  réussite suivante. À utiliser à la place de `attempts` pour tout calcul de
  type « tentatives avant réussite » : `attempts` continue d'augmenter après
  une réussite et donne un résultat faux si l'étudiant retente ensuite.

**Particularités du schéma PLaTon (à connaître pour écrire des requêtes ou des formules)** :
- `Activities` n'a **pas** de colonne `name` : le titre est dans
  `source->'variables'->>'title'`, avec repli sur `Resources.name` via
  `LEFT JOIN "Resources" r ON r.id = (a.source->>'resource')::uuid`.
- Les clés étrangères de PLaTon ne sont pas toutes visibles dans
  `information_schema` quand les tables appartiennent à un autre utilisateur
  PostgreSQL que celui d'Indicateurs. L'explorateur de schéma du wizard
  (`GET /api/indicators/schema/full`) les lit donc dans `pg_constraint`.

## Base `indicators` (lecture/écriture)

Gérée par TypeORM, `synchronize: false` en toute circonstance (développement
compris) : le schéma n'évolue que par de vraies migrations TypeORM
(`api/src/migrations/`), jamais par synchronisation automatique, pour ne
jamais laisser le schéma dériver. 10 entités, détaillées plus bas. La
migration initiale crée aussi une table `ingestion_cursors`, qu'aucun code
n'utilise.

## `IndicatorDefinition` (table `indicator_definitions`)

La définition d'un indicateur.

| Champ | Type | Rôle |
|---|---|---|
| `id` | uuid | identifiant |
| `name` | string (unique) | nom affiché |
| `description` | text \| null | description |
| `contextType` | `'learner'\|'teacher'\|'admin'\|'course'\|'activity'\|'group'` | contexte unique de cet indicateur (voir [modele-indicateur.md](../fonctionnement/modele-indicateur.md)) ; vide seulement pour une ligne technique de famille |
| `familyName` | string \| null | regroupement nominal de plusieurs indicateurs créés ensemble sous une même famille (voir [modele-indicateur.md](../fonctionnement/modele-indicateur.md)) |
| `baseIndicatorId` | string \| null | indicateur à partir duquel celui-ci a été créé (réutilisation) ; traçabilité uniquement, aucun lien vivant : modifier l'indicateur de base n'a plus aucun effet après la création |
| `requiredEvents` | jsonb (string[]) | noms des événements qui déclenchent un recalcul (voir [ingestion-evenements.md](../fonctionnement/ingestion-evenements.md)) ; vide = recalcul périodique |
| `visualizations` | jsonb (`IndicatorVisualization[]`) | une ou plusieurs visualisations, c'est-à-dire des représentations différentes d'une même formule (voir [modele-indicateur.md](../fonctionnement/modele-indicateur.md)) |
| `isActive` | boolean | actif ou désactivé ; `false` par défaut à la création par l'API |
| `isComplete` | boolean | complétude réelle du formulaire, indépendante de `isActive` : `true` seulement si l'indicateur est enregistré depuis la dernière étape du wizard avec un contexte, au moins une visualisation et une formule ; `false` pour « Sauvegarder le brouillon » |
| `isFamilyPlaceholder` | boolean | ligne technique qui ne représente aucun indicateur réel : elle sert uniquement à faire exister une famille vide (pas de table dédiée, `familyName` est un simple champ partagé). Toujours `isActive=false`, jamais affichée aux utilisateurs finaux ; l'interface d'administration la supprime dès qu'un premier vrai indicateur rejoint la famille |
| `usageCount` | number | nombre d'utilisateurs qui ont activé l'indicateur (incrémenté et décrémenté par les préférences) |
| `formula` | jsonb \| null | **formule unique partagée par toutes les visualisations** (1 indicateur = 1 formule) |
| `thresholds` | jsonb \| null | seuils `{ good?: number; warning?: number; critical?: number }` qui colorent la carte : valeur ≤ `good` en vert, ≤ `warning` en orange, au-delà en rouge (une valeur basse est donc considérée comme bonne). `critical` ne sert qu'à la légende ; optionnel |
| `interpretationHint` | text \| null | aide à l'analyse : texte libre expliquant comment interpréter les résultats, affiché dans la page détail ; optionnel |
| `visibilityRoles` | jsonb (string[]) \| null | restreint la visibilité de cet indicateur à des rôles précis, à la place de la règle par défaut du `contextType`. Utile pour un indicateur course ou activity dont le résultat est nominatif et ne doit donc pas être montré aux étudiants ; optionnel |

## `IndicatorValue` (table `indicator_values`)

La valeur calculée pour un contexte donné.

- Contrainte unique `(indicatorId, contextType, contextId)`.
- `contextId` peut être une **clé composite** `contexte:portée`, construite par
  `resolveCacheContextId` (`indicators.service.ts`) :
  - `learner`, `teacher`, `admin` : `userId`, ou `userId:activityId` si la
    formule filtre par activité, ou `userId:courseId` si elle filtre par cours ;
  - `course` : `courseId`, ou `courseId:activityId` quand une activité est
    précisée ;
  - `group` : `groupId:activityId`, ou `groupId:courseId` ;
  - `activity` : `activityId`.
- `value: float` : toujours présent (0 si le résultat n'est pas un nombre).
- `metadata: jsonb` : `{ lastUpdate, history, structuredValue?, incremental? }`.
  `structuredValue` porte les résultats non scalaires (bar-chart, histogram),
  `incremental` les valeurs intermédiaires du calcul différentiel (voir
  [calcul-differentiel.md](../fonctionnement/calcul-differentiel.md)). `history` reçoit une entrée à chaque calcul, sans limite de taille.

## `IndicatorExecutionLog` (table `indicator_execution_logs`)

Une ligne par exécution complète d'une formule par `interpret()` (formule
non éligible au calcul différentiel, ou calcul fait à l'activation d'un
indicateur personnel) : `indicatorId`, `userId` (ou
`groupId`), `value`, `durationMs`, `error`, `executedAt`. Les calculs
différentiels et les calculs complets des formules éligibles n'y écrivent pas.

## `IndicatorFeedback` (table `indicator_feedback`)

Retour d'un utilisateur sur un indicateur : `indicatorId`, `userId`, `rating` (entier de 1 à 5), `comment`, `createdAt`. Chaque envoi crée une nouvelle ligne.

## `IndicatorNotification` (table `indicator_notifications`)

Notification liée à un indicateur (pas ciblée par utilisateur) : `indicatorId`, `title`, `message`, `createdAt`.

## `IndicatorEventType` (table `indicator_event_types`)

Types d'événements déclarés en BDD : `id`, `name`, `label`, `description`, `isActive`.
Gérés via `GET/POST/PATCH/DELETE /api/event-types`. Au démarrage, si la table est vide, l'API crée `exercise.answered`. `GET /api/event-types?configured=true` ne renvoie que les types associés à une `IndicatorEventRule` active **et** installée (voir [ingestion-evenements.md](../fonctionnement/ingestion-evenements.md)) : c'est ce filtre qui alimente le sélecteur du wizard d'indicateur. Un type encore utilisé par une règle ne peut pas être supprimé.

## `IndicatorEventRule` (table `indicator_event_rules`)

Une règle de classification : transforme un changement brut sur une table PLaTon en un `IndicatorEventType`. Voir [ingestion-evenements.md](../fonctionnement/ingestion-evenements.md) pour le détail complet.

| Champ | Rôle |
|---|---|
| `eventTypeId` | type d'événement produit si la règle matche |
| `sourceTable` / `watchedColumn` | table et colonne PLaTon surveillées ; sans `watchedColumn`, le déclencheur généré ne réagit qu'aux `INSERT` |
| `operation` | `INSERT` \| `UPDATE` \| `INSERT_OR_UPDATE` |
| `condition` | `{ kind: 'always'\|'changed'\|'equals'\|'not_equals'\|'threshold_crossed', value?, operator?, threshold? }` |
| `contextMapping` | colonnes source → `userId` (obligatoire) / `courseId` / `activityId` / `sessionId` |
| `triggerInstalled` / `installedAt` / `lastAppliedSql` / `lastInstallError` | suivi de l'installation réelle du trigger PostgreSQL |

## `IndicatorSnapshot` (table `indicator_snapshots`)

« Carte épinglée » d'un indicateur `group` pour une activité ou un cours donné
(panneau « Par groupe » de la page activité ou cours). Les doublons sont
empêchés par deux index uniques partiels en base (et non par une contrainte
`@Unique()`) : `activityId` et `courseId` sont mutuellement exclusifs, un seul
des deux est renseigné à la fois (contrainte `CHECK`). Champs : `contextId`
(= `groupId`), `activityId`, `courseId`, `title`.

## `IndicatorPin` (table `indicator_pins`)

Permet à un enseignant du cours (membre `teacher` dans `CourseMembers`) ou à
un admin de figer un indicateur existant sur un cours ou une activité précis :
la page de ce cours ou de cette activité l'affiche alors à tous ses membres,
quel que soit leur réglage personnel, avec des seuils propres à ce contexte.
Seuls les indicateurs de contexte `course` (page cours) ou `activity` (page
activité) sont concernés. Contrainte unique `(indicatorId, contextType, contextId)`.

| Champ | Rôle |
|---|---|
| `indicatorId` | indicateur figé |
| `contextType` | `'course'` \| `'activity'` |
| `contextId` | identifiant du cours ou de l'activité |
| `thresholdsOverride` | seuils propres à ce contexte `{ good?, warning?, critical? }`, remplacent ceux de l'indicateur ; optionnel |
| `pinnedByUserId` | enseignant à l'origine de l'épinglage |

Totalement indépendant de `UserIndicatorPreference` : aucune écriture croisée
entre les deux, pour ne jamais faire fuiter un indicateur épinglé sur les
autres cours/activités d'un membre, ni laisser une désactivation personnelle
effacer un indicateur figé par l'enseignant.

## `UserIndicatorPreference` (table `user_indicator_preferences`)

Préférences par utilisateur, contrainte unique `(userId, indicatorId)` :

| Champ | Rôle |
|---|---|
| `isVisible` | l'indicateur est-il activé dans le tableau de bord de cet utilisateur |
| `displayPreferences` | `{ icon?, color? }` |
| `activeVizId` | quelle visualisation est affichée par défaut |
| `enabledVizIds` | sous-ensemble des visualisations que l'utilisateur veut voir (`null` = toutes) |
