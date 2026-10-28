# Indicateurs

Microservice de **suivi de performance e-learning** pour la plateforme PLaTon.
Un administrateur crée des indicateurs (note moyenne, tentatives avant
réussite…) depuis l'interface, sans redéployer l'application. Les valeurs se
mettent à jour à l'écran dès qu'un étudiant agit dans PLaTon.

- **Frontend** : Angular 18 (`frontend/`), application autonome ou Web Component `<indicateurs-app>` à insérer dans PLaTon.
- **Backend** : NestJS (`api/`, port 3001).
- **Données** : la base de PLaTon (surtout en lecture) et une base `indicators` qui lui est propre, sur le même serveur PostgreSQL.
- **Événements** : RabbitMQ et WebSocket (socket.io).

## Comment ça marche

```
   PLaTon (Postgres)                         Indicateurs
 ┌──────────────────────┐
 │ SessionData, Users   │◄──────── lecture (SQL) ─────────────────┐
 │        │             │                                         │
 │  déclencheur généré  │                                         │
 │        ▼             │                                         │
 │ platon_outbox_events │                                         │
 └────────┬─────────────┘                                         │
          │ relais (côté PLaTon, toutes les 2 s)                  │
          ▼                                                       │
     RabbitMQ  ──► file indicators.learner  ─┐                    │
  (exchange       file indicators.aggregate ─┤                    │
   platon.events)                            ▼                    │
                                 classification + calcul ─────────┘
                                             │
                                             ▼
                            base "indicators" (valeurs en cache)
                                             │
                                   WebSocket (socket.io)
                                             ▼
                 navigateur (app autonome ou <indicateurs-app> dans PLaTon)
```

Trois idées tiennent tout le reste :

1. **Un indicateur est une donnée, pas du code.** Sa formule est un pipeline d'étapes en JSON, interprété à la volée.
2. **Indicateurs ne touche pas au code de PLaTon.** Il lit surtout sa base. Ses quelques écritures sont listées dans [donnees.md](docs/architecture/donnees.md). Ce qui doit vivre côté PLaTon (relais, page hôte) est fourni à part, prêt à copier.
3. **Le calcul suit les événements.** Une action d'un étudiant déclenche le recalcul des seuls indicateurs concernés, sans tout recalculer quand c'est possible.

## De l'événement à l'écran

1. Le frontend charge les indicateurs actifs et les préférences de l'utilisateur.
2. Un indicateur personnel (`learner`, `teacher`, `admin`) non lié à un cours ou une activité est calculé d'avance, puis simplement lu.
3. Les autres (`course`, `group`, `activity`, personnels liés à un cours ou une activité) sont calculés à la demande : le backend regarde le cache (`indicator_values`), sinon exécute la formule sur la base PLaTon, enregistre le résultat et le renvoie.
4. Une modification dans PLaTon déclenche un trigger générique qui écrit dans `platon_outbox_events`. Un relais côté PLaTon republie la ligne vers RabbitMQ. Deux consumers la classent puis recalculent les indicateurs concernés, en calcul différentiel quand c'est possible.
5. Chaque valeur recalculée est envoyée par WebSocket : l'écran se met à jour sans rechargement.

## Démarrage

Sur une nouvelle machine, l'installation complète (PLaTon, bases, RabbitMQ,
données de test) est décrite pas à pas dans
[platon-local-setup.md](docs/deploiement/platon-local-setup.md). Ensuite :

```bash
./bin/setup.sh            # démarre PLaTon, les bases et RabbitMQ, génère api/.env
cd api && yarn start      # backend sur http://localhost:3001 (préfixe /api)
cd frontend && ng serve   # frontend sur http://localhost:4200
```

Les variables d'environnement et la configuration Docker sont dans
[docker.md](docs/deploiement/docker.md).

## Où trouver quoi

| Je veux… | Document |
|---|---|
| installer le projet sur une machine | [platon-local-setup.md](docs/deploiement/platon-local-setup.md) |
| comprendre la configuration Docker, les variables, le déploiement | [docker.md](docs/deploiement/docker.md) |
| savoir **pourquoi** le projet est construit ainsi | [choix-techniques.md](docs/architecture/choix-techniques.md) |
| trouver un fichier dans `api/` ou `frontend/` | [structure.md](docs/architecture/structure.md) |
| connaître les bases, ce qui est écrit dans PLaTon, les entités | [donnees.md](docs/architecture/donnees.md) |
| comprendre qui peut appeler quoi, et l'authentification | [securite.md](docs/architecture/securite.md) |
| voir ce qui ne va pas encore, avant une mise en production | [limites-connues.md](docs/architecture/limites-connues.md) |
| voir les choix à faire avec l'équipe PLaTon et l'université | [decisions-a-prendre.md](docs/architecture/decisions-a-prendre.md) |
| comprendre le modèle d'un indicateur, les familles, la visibilité | [modele-indicateur.md](docs/fonctionnement/modele-indicateur.md) |
| comprendre le moteur de formules et le bac à sable JavaScript | [moteur-formules.md](docs/fonctionnement/moteur-formules.md) |
| comprendre le calcul différentiel | [calcul-differentiel.md](docs/fonctionnement/calcul-differentiel.md) |
| suivre un événement de PLaTon jusqu'à l'écran, et le tester | [ingestion-evenements.md](docs/fonctionnement/ingestion-evenements.md) |
| partir d'un écran et trouver les fichiers et les écritures | [parcours-donnees.md](docs/fonctionnement/parcours-donnees.md) |
| créer un indicateur (22 cas prêts à importer) | [guide-creation-indicateur.md](docs/guides/guide-creation-indicateur.md) |
| la liste des routes API et leurs gardes | [api.md](docs/reference/api.md) |
| les écrans et composants Angular | [frontend.md](docs/reference/frontend.md) |
| intégrer `<indicateurs-app>` dans PLaTon | [integration-indicateurs.md](docs/platon-integration/integration-indicateurs.md) (côté Indicateurs) et [integration-platon.md](docs/platon-integration/integration-platon.md) (côté PLaTon) |
| installer le relais d'événements côté PLaTon | [integration-platon-relay.md](docs/platon-integration/integration-platon-relay.md) |

## Limites connues

À corriger avant une vraie mise en production (détail et conséquences dans
[limites-connues.md](docs/architecture/limites-connues.md)) :

- Le WebSocket envoie chaque mise à jour à **tous** les navigateurs connectés, sans contrôle du jeton.
- Les résultats et le CSV d'une activité sont lisibles par tout utilisateur connecté, sans contrôle d'appartenance au cours.
- Hors production, le jeton n'est pas vérifié cryptographiquement, seulement son expiration.
- Pas de file d'erreurs (DLX) ni de limite de tentatives sur RabbitMQ.
- Le script embarqué n'a pas de numéro de version, et rien ne prévient PLaTon d'une mise à jour.
- Installer les déclencheurs demande un compte Postgres propriétaire des tables PLaTon.
