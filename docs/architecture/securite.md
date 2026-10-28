# Sécurité et authentification

Qui peut appeler quoi, et comment le jeton PLaTon est contrôlé.

## Contexte : pourquoi pas un simple `JwtStrategy` classique

Le frontend attache un `Authorization: Bearer <accessToken>` à chaque requête
(`auth.interceptor.ts`). Ce token est obtenu en redirigeant l'utilisateur vers
le **PLaTon de production** (`https://platon.univ-eiffel.fr/login`), pas vers
une instance locale dont on connaîtrait le `.env`. Le secret de signature réel
(`SECRET_KEY` de production) est donc **inconnu** en développement : impossible
de vérifier la signature du token comme le fait PLaTon lui-même
(`platon/libs/core/server/.../jwt.strategy.ts`). Hors production, la page de
connexion propose aussi un formulaire de connexion locale, qui demande le
token à un PLaTon lancé en local (`platonLocalApiUrl`, `POST /api/v1/auth/signin`).

## `AuthGuard` (`api/src/modules/core/auth/auth.guard.ts`)

Comportement choisi par `NODE_ENV` (`api/.env`) :

- **toute valeur autre que `production`** (par exemple `development`) : décode
  le contenu du token (`sub`, `username`, `exp`) **sans vérifier la
  signature**, et ne rejette (401) que si `exp` est dépassé ou absent. Cela
  suffit à écarter une session expirée, mais n'empêche pas un client de
  fabriquer un `sub` arbitraire.
- **`production`** : vérification cryptographique complète
  (`jsonwebtoken.verify` avec `JWT_SECRET`). À utiliser quand Indicateurs est
  déployé à côté de **son propre** PLaTon, avec un secret réellement partagé,
  et non avec le PLaTon universitaire externe.

Dans les deux cas, `request.user = { id, username }` est rempli pour les
gardes et contrôleurs suivants.

## `AdminGuard` (`api/src/modules/core/guards/admin.guard.ts`)

Doit toujours être posé **après** `AuthGuard` (`@UseGuards(AuthGuard, AdminGuard)`) :
lit `request.user.id`, vérifie `Users.role === 'admin'` dans la base PLaTon,
sinon 403.

## `IndicatorVisibilityGuard` (`api/src/modules/core/guards/indicator-visibility.guard.ts`)

Doit toujours être posé **après** `AuthGuard`
(`@UseGuards(AuthGuard, IndicatorVisibilityGuard)`) : lit le rôle réel de
`request.user.id` dans la base PLaTon (jamais un rôle envoyé par le client) et
applique la règle de visibilité décrite dans [modele-indicateur.md](../fonctionnement/modele-indicateur.md) (avec la table du backend), pour que la
restriction tienne aussi face à un appel direct à l'API. Un indicateur
introuvable n'est pas refusé ici : le contrôleur renvoie alors 404. Posé sur
`getIndicatorValues`, `computeView`, `getSnapshots` et `createSnapshot`
(`indicators.controller.ts`), et sur `createPreference` et `updatePreference`
(`user-preferences.controller.ts`).

## Ce que ça protège concrètement

| Zone | Protection actuelle |
|---|---|
| Permissions cours et activités | calculées (propriétaire, admin, membre `teacher`), voir [api.md](../reference/api.md) ; l'ajout et le retrait de membres sont refusés aux autres |
| Permissions ressources | calculées en lecture (propriétaire, admin, membre de cercle), voir [api.md](../reference/api.md) |
| Écritures sur les indicateurs, les types d'événements et les règles | rôle `admin` vérifié (`AdminGuard`) ; les snapshots exigent en plus de pouvoir voir l'indicateur, et l'auteur d'un retour est toujours l'utilisateur du token |
| Visibilité des indicateurs par rôle et contexte | rôle réel vérifié (`IndicatorVisibilityGuard`), voir [modele-indicateur.md](../fonctionnement/modele-indicateur.md) |
| Préférences utilisateur | utilisateur toujours tiré de `request.user.id`, jamais accepté depuis le client |
| Session expirée | 401 → `auth.interceptor.ts` vide le `localStorage`, puis renvoie vers `/authentification` (ou prévient la page hôte en mode embarqué) |

Seules restent ouvertes sans token la liste des indicateurs, un indicateur et
les types d'événements (des définitions, sans donnée personnelle) : voir
[api.md](../reference/api.md). Les résultats et le CSV d'une activité sont
lisibles par tout utilisateur connecté, sans contrôle d'appartenance au cours :
voir [limites-connues.md](limites-connues.md).

## Limite connue

En développement, un appel direct à l'API (hors navigateur) avec un `sub`
inventé et un `exp` dans le futur passe le contrôle : hors production,
`AuthGuard` ne garantit pas l'authenticité du token, seulement qu'il n'est pas
expiré. Fermer complètement ce trou demanderait soit de connaître le secret de
production (qu'il n'est pas souhaitable de dupliquer), soit de valider chaque
token par un appel à l'API PLaTon de production (`GET /api/v1/users/:username`
avec le même Bearer, comme le fait `authentification.page.ts` à la connexion).
Ce n'est pas implémenté, faute de besoin de sécurité renforcée en développement.
