# Configuration Docker - Microservice Indicateurs

## Principe général

Le microservice indicateurs s'appuie sur l'infrastructure Docker de PLaTon (PostgreSQL, Redis) via le réseau partagé `platon-network`. Il apporte uniquement ce qui lui est propre : RabbitMQ, son API NestJS et son frontend Angular.

**Prérequis** : le projet PLaTon doit tourner (`bin/docker/up.sh` dans le dossier `platon/`).

Pour migrer une base Postgres native (hors Docker) vers `platon_postgres`, voir le guide de reproduction [docker-migration.md](docker-migration.md).

Pour explorer les bases Postgres via l'interface web pgAdmin, voir [pgadmin.md](pgadmin.md).

**Nom réel du réseau partagé** : les fichiers compose de PLaTon ne fixent pas de `name:` explicite sous `networks:`, donc Docker Compose préfixe le nom du réseau qu'il crée avec le nom du projet (dérivé du nom du dossier, ex : `platon_platon-network` si PLaTon est lancé depuis un dossier `platon/`). On ne modifie jamais les fichiers PLaTon : les deux `docker-compose.*.yml` d'indicateurs déclarent `platon-network` comme alias externe avec `name: ${PLATON_NETWORK_NAME:-platon_platon-network}`.

- **Source de vérité** : la variable `PLATON_NETWORK_NAME` dans `.env` (voir `.env.example`) - à renseigner une fois par déploiement, comme `JWT_SECRET`/`PLATON_DB_PASSWORD`. Si le dossier PLaTon est un jour renommé, c'est cette ligne qu'il faut ajuster (jamais les fichiers `docker-compose.*.yml`).
- **Filet de sécurité** : si `PLATON_NETWORK_NAME` n'est renseigné ni dans `.env` ni dans le shell, `bin/docker/up.sh`/`down.sh` tentent une détection automatique (`docker network ls` + filtre sur `*_platon-network`). Cette détection n'est **pas infaillible** (ambiguïté possible si plusieurs réseaux correspondent, échoue si PLaTon n'est pas encore démarré) - à ne pas considérer comme une garantie, seulement un dépannage. `.env` reste toujours prioritaire s'il est renseigné.

**Base `indicators`** : le Dockerfile Postgres de PLaTon (`platon/.docker/db/Dockerfile`) ne crée que la base définie par `POSTGRES_DB` (`platon_db`) - rien côté PLaTon ne provisionne la base `indicators` attendue par `INDICATORS_DB_NAME`. Automatisé côté indicateurs (jamais de modification côté PLaTon) en deux étapes :
1. `init-db` (image `postgres:13-alpine`, éphémère) crée la base `indicators` si elle n'existe pas (idempotent).
2. `migrate` (réutilise l'image `indicateurs-api`) applique les migrations TypeORM en attente pour construire tout le schéma (tables/index/contraintes) - voir la section [Schéma de la base `indicators` (migrations TypeORM)](#schéma-de-la-base-indicators-migrations-typeorm) plus bas.

`api` ne démarre qu'une fois les deux terminés avec succès et RabbitMQ en bonne santé (`depends_on: init-db, migrate: condition: service_completed_successfully`, `rabbitmq: condition: service_healthy`).

---

## Mode développement

```bash
./bin/docker/up.sh        # démarre l'infrastructure locale
```

Docker démarre **un seul service** :

```
Docker lance :
  └── indicateurs_rabbitmq  (port 5672 + UI de gestion port 15672)

Tu lances manuellement :
  ├── cd api && yarn start:dev     → NestJS sur localhost:3001
  └── cd frontend && yarn start   → Angular sur localhost:4200
```

RabbitMQ est le seul service qu'on ne peut pas lancer avec une commande npm - il a besoin d'un daemon. Le reste tourne en local pour avoir le **hot-reload** (modification du code → rechargement immédiat).

PostgreSQL et Redis ne sont pas dans ce compose car ils appartiennent à PLaTon. On se branche dessus via `platon-network`.

L'UI de gestion RabbitMQ est accessible à : `http://localhost:15672` (identifiants : voir `RABBITMQ_USER`/`RABBITMQ_PASSWORD` dans `.env` - jamais `guest`/`guest`, supprimé de la configuration).

---

## Mode production

```bash
./bin/docker/up.sh -p -d  # démarre la stack complète en arrière-plan
./bin/docker/down.sh      # arrête
```

Docker démarre **trois services** (plus deux services éphémères de provisionnement) :

```
Docker lance :
  ├── indicateurs_init_db    (éphémère - crée la base "indicators" si absente, puis s'arrête)
  ├── indicateurs_migrate    (éphémère - applique les migrations TypeORM en attente, puis s'arrête)
  ├── indicateurs_rabbitmq   (interne, pas exposé)
  ├── indicateurs_api        (interne, pas exposé directement - attend init_db + migrate)
  └── indicateurs_nginx      (exposé sur le port 4300 de la machine)
        ├── sert les fichiers Angular compilés (dist/)
        ├── proxie /api/*      → indicateurs_api:3001
        └── proxie /socket.io/ → indicateurs_api:3001 (WebSocket)
```

Nginx est le **seul point d'entrée** : le navigateur ne communique qu'avec lui.

| URL | Ce que Nginx fait |
|---|---|
| `http://monserveur:4300/` | Renvoie `index.html` (Angular SPA) |
| `http://monserveur:4300/api/...` | Proxie vers le NestJS (port 3001) |
| `ws://monserveur:4300/socket.io/` | Proxie WebSocket vers le NestJS |

PostgreSQL et Redis restent ceux de PLaTon, accessibles via `platon-network`.

---

## Différences dev / prod

| | Dev | Prod |
|---|---|---|
| Code source | Modifiable en direct | Compilé au `docker build` |
| Hot-reload | Oui | Non |
| Frontend | `ng serve` (localhost:4200) | Nginx (port 4300) |
| API | `nest start --watch` | `node dist/main` |
| URL de l'API (Angular) | `http://localhost:3001/api` | `/api` (relatif, proxié par Nginx) |

---

## Logs

`docker-compose.prod.yml` configure une rotation (`x-logging`, driver `json-file`, 5 fichiers de 10 Mo max par service) - sans ça, les logs s'accumulent indéfiniment sur le disque du serveur. Ne couvre pas la centralisation/recherche après coup (Loki/ELK) ni les alertes automatiques (Sentry) - volontairement hors scope tant qu'un seul microservice à faible charge ne le justifie pas.

---

## Configuration requise

Copier `.env.example` en `.env` et renseigner les valeurs manquantes :

```bash
cp .env.example .env
```

Variables importantes à adapter :

| Variable | Description |
|---|---|
| `PLATON_DB_PASSWORD` | Mot de passe PostgreSQL (même que dans `platon/.env`) |
| `JWT_SECRET` | Doit être identique au `SECRET_KEY` du PLaTon déployé aux côtés de cette instance (utilisé uniquement en `NODE_ENV=production`, voir readme.md §12 - sans effet en dev, où les utilisateurs s'authentifient sur le PLaTon universitaire) |
| `INDICATEURS_PORT` | Port exposé pour le frontend (défaut : `4300`) |
| `PLATON_DB_ADMIN_USERNAME`/`PASSWORD` | Optionnel - identifiant Postgres à privilèges élevés pour l'installation des déclencheurs dynamiques (readme.md §6bis). Laisser vide si non utilisé. |

**Pas une variable d'environnement, un fichier à éditer avant de builder** :
`frontend/src/environments/environment.embed.prod.ts` contient un placeholder
`<domaine-indicateurs-a-remplacer>` (adresse de l'API appelée par le widget
embarqué, voir `docs/integration-indicateurs.md` §5bis) - à remplacer par le
vrai domaine de production avant tout déploiement réel du widget. Le build
réussit même si l'oubli persiste ; l'erreur n'apparaît qu'au runtime, dans le
navigateur de l'utilisateur final.

---

## Schéma de la base `indicators` (migrations TypeORM)

Calqué sur le fonctionnement de PLaTon (`platon/migrations/`, `platon/bin/migration/*.sh`) :
`synchronize` est **toujours désactivé** (`api/src/modules/core/config/configuration.ts`)
- y compris en dev - le schéma évolue uniquement via de vraies migrations
TypeORM, jamais par auto-sync.

- `api/src/typeorm-cli.datasource.ts` : `DataSource` dédié au CLI (`ts-node`),
  séparé de la connexion runtime de l'app (`core.module.ts`).
- `api/src/migrations/` : fichiers de migration horodatés, compilés
  automatiquement dans `dist/migrations/` par `nest build` (aucun changement
  de Dockerfile nécessaire pour ça).
- `bin/migration/{create,generate,run,revert}.sh` : wrappers à la racine du
  dépôt, miroir direct des scripts PLaTon.

**Différence assumée avec PLaTon** : chez PLaTon, `bin/migration/run.sh` est
une étape manuelle du runbook de déploiement (jamais automatisée). Pour
indicateurs, le service Docker `migrate` (`docker-compose.prod.yml`) lance
`yarn migration:run` automatiquement avant que l'API démarre - décision
volontaire pour ne jamais reproduire l'oubli qui causait un crash au premier
démarrage sur une base neuve (`relation "..." does not exist`).

Workflow pour toute future évolution du schéma :
```bash
# 1. Modifier l'entité TypeScript concernée
# 2. Générer la migration (diffe les entités contre la base connectée dans .env)
./bin/migration/generate.sh NomDeLaMigration
# 3. Relire le fichier généré dans api/src/migrations/, committer
# 4. Appliquer localement pour tester
./bin/migration/run.sh
```

---

## Déploiement via GitHub Actions (manuel)

Le déploiement se fait par SSH vers le serveur qui héberge déjà PLaTon et indicateurs - **aucun registre d'images** (le build a lieu sur le serveur lui-même via `bin/docker/up.sh --prod -d`, exactement comme un déploiement manuel). Le workflow (`.github/workflows/deploy.yml`) ne fait qu'exécuter à distance ce qu'on lancerait à la main.

**Déclenchement manuel uniquement** (onglet *Actions* du repo GitHub → *Run workflow*) - pas d'automatisation sur push tant que le pipeline n'a pas fait ses preuves.

Étapes exécutées sur le serveur :
1. `git fetch` + `git reset --hard origin/<ref>` sur le dossier de déploiement (jamais édité à la main, donc sans risque - évite un conflit de merge si le working tree a dérivé).
2. `bin/docker/up.sh --prod -d` (build + migrations + redémarrage, voir plus haut).
3. Vérification : `curl` sur le port `INDICATEURS_PORT` (lu depuis le `.env` du serveur) jusqu'à 6 tentatives espacées de 5s ; si ça échoue, le job affiche les 50 dernières lignes de logs de chaque service avant d'échouer.

**Secrets à créer** dans *Settings → Secrets and variables → Actions* du repo GitHub :

| Secret | Contenu |
|---|---|
| `DEPLOY_HOST` | IP ou nom de domaine du serveur |
| `DEPLOY_USER` | Utilisateur SSH (doit pouvoir lancer `docker compose` sans sudo - membre du groupe `docker`) |
| `DEPLOY_SSH_KEY` | Clé privée SSH (format PEM) dédiée au déploiement - jamais votre clé personnelle |
| `DEPLOY_PORT` | Port SSH (optionnel, défaut `22`) |
| `DEPLOY_PATH` | Chemin absolu du dossier `indicateurs/` sur le serveur (ex : `/opt/indicateurs`) |

Le workflow contient une ligne `environment: production` commentée - la
décommenter active un environnement GitHub nommé `production` (à configurer
dans *Settings → Environments*), ce qui permet d'ajouter un reviewer
obligatoire avant chaque déploiement si souhaité, sans autre modification du
workflow.

**Prérequis serveur** : le dossier `DEPLOY_PATH` doit déjà être un clone du repo (`git clone git@github.com:Odilon-ILboudo/indicateurs.git`) avec un `.env` complet (voir *Configuration requise* plus haut) et une clé de déploiement GitHub (deploy key) autorisée en lecture sur le repo pour que le `git fetch` fonctionne sans intervention manuelle.

---

## Structure des fichiers Docker

```
indicateurs/
├── .docker/
│   ├── api/
│   │   └── Dockerfile          ← NestJS multi-stage (compile les addons natifs)
│   └── frontend/
│       ├── Dockerfile          ← Build Angular (app standalone + widget embarqué) → image Nginx
│       └── nginx.conf          ← Proxy API + WebSocket + SPA fallback + widget embarqué (/embed/)
├── bin/docker/
│   ├── up.sh                   ← Lance dev ou prod (option -p)
│   └── down.sh                 ← Arrête la stack prod
├── bin/migration/
│   ├── create.sh / generate.sh ← Créer/générer une migration TypeORM
│   ├── run.sh / revert.sh      ← Appliquer/annuler les migrations
├── api/src/typeorm-cli.datasource.ts  ← DataSource dédié au CLI (ts-node)
├── api/src/migrations/         ← Fichiers de migration horodatés
├── docker-compose.dev.yml      ← RabbitMQ uniquement
└── docker-compose.prod.yml     ← Stack complète (+ init-db, migrate)
```
