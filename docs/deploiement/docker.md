# Configuration Docker du microservice Indicateurs

## Principe général

Le microservice Indicateurs s'appuie sur l'infrastructure Docker de PLaTon (PostgreSQL) via le réseau partagé `platon-network`. Il apporte uniquement ce qui lui est propre : RabbitMQ, son API NestJS et son frontend Angular.

**Prérequis** : le projet PLaTon doit tourner (`bin/docker/up.sh` dans le dossier `platon/`).

Sur une nouvelle machine, voir [platon-local-setup.md](./platon-local-setup.md) pour les réglages locaux à refaire dans la copie de `platon/` (non versionnés, propres à chaque environnement).

Pour explorer les bases Postgres via l'interface web pgAdmin, voir [platon-local-setup.md](./platon-local-setup.md) (étape 9).

**Nom réel du réseau partagé** : les fichiers compose de PLaTon ne fixent pas de `name:` explicite sous `networks:`, donc Docker Compose préfixe le nom du réseau qu'il crée avec le nom du projet (dérivé du nom du dossier, par exemple `platon_platon-network` si PLaTon est lancé depuis un dossier `platon/`). Les fichiers de PLaTon ne sont jamais modifiés : les deux `docker-compose.*.yml` d'Indicateurs déclarent `platon-network` comme réseau externe, avec `name: ${PLATON_NETWORK_NAME:-platon_platon-network}`.

- **Source de vérité** : la variable `PLATON_NETWORK_NAME` dans `.env` (voir `.env.example`), à renseigner une fois par déploiement, comme `JWT_SECRET` ou `PLATON_DB_PASSWORD`. Si le dossier PLaTon est un jour renommé, c'est cette ligne qu'il faut ajuster (jamais les fichiers `docker-compose.*.yml`).
- **Filet de sécurité** : si `PLATON_NETWORK_NAME` n'est renseigné ni dans `.env` ni dans le shell, `bin/docker/up.sh` et `down.sh` tentent une détection automatique (`docker network ls`, filtré sur `*_platon-network`). Cette détection n'est **pas infaillible** (ambiguïté possible si plusieurs réseaux correspondent, échec si PLaTon n'est pas encore démarré) : c'est un dépannage, pas une garantie. `.env` reste toujours prioritaire s'il est renseigné.

**Base `indicators`** : le Postgres de PLaTon ne crée que la base définie par `POSTGRES_DB` (`platon_db`) ; rien côté PLaTon ne crée la base `indicators` attendue par `INDICATORS_DB_NAME`. Indicateurs s'en charge lui-même (sans modifier PLaTon), en deux étapes :
1. `init-db` (image `postgres:13-alpine`, éphémère) crée la base `indicators` si elle n'existe pas (sans effet si elle existe déjà).
2. `migrate` (réutilise l'image `indicateurs-api`) applique les migrations TypeORM en attente pour construire tout le schéma (tables, index, contraintes) ; voir la section [Schéma de la base `indicators` (migrations TypeORM)](#schéma-de-la-base-indicators-migrations-typeorm) plus bas.

En production, `api` ne démarre qu'une fois `init-db`, `migrate` et `rabbitmq-init` terminés avec succès, et RabbitMQ en bonne santé (`depends_on` avec `service_completed_successfully` et `service_healthy`).

---

## Mode développement

**Point d'entrée recommandé, sur une nouvelle machine** : `./bin/setup.sh`
(depuis `indicateurs/`). Il démarre PLaTon, attend Postgres, génère `api/.env`,
lance tout ce qui suit, et s'arrête avec une erreur claire si une étape échoue
au lieu de continuer en silence. Il accepte en option le dossier `platon/`
(défaut `../platon`) et un dossier de dumps à restaurer
(voir [platon-local-setup.md](./platon-local-setup.md), étape 7).

Au quotidien (la copie `platon/` est déjà configurée), la commande plus
légère suffit :

```bash
./bin/docker/up.sh        # démarre l'infrastructure locale
```

Docker démarre :

```
  ├ indicateurs_init_db       (éphémère : crée la base "indicators" si absente)
  ├ indicateurs_migrate       (éphémère : applique les migrations TypeORM en attente)
  ├ indicateurs_rabbitmq      (port 5672 + interface de gestion sur le port 15672)
  └ indicateurs_rabbitmq_init (éphémère : crée ou corrige le compte RabbitMQ)

À lancer à la main :
  ├ cd api && yarn start:dev     → NestJS sur localhost:3001
  └ cd frontend && yarn start    → Angular sur localhost:4200
```

`api` et `frontend` tournent hors conteneur, pour le **rechargement à chaud**
(une modification du code est prise en compte tout de suite). À cette étape,
`yarn install` installe `isolated-vm` pour cette machine (binaire téléchargé,
ou compilé sur place s'il n'en existe pas) : voir
[platon-local-setup.md](./platon-local-setup.md#0-prérequis-système) en cas
d'échec.

PostgreSQL n'est pas dans ce compose, car il appartient à PLaTon : on s'y
branche via `platon-network`. L'API n'utilise pas Redis.

L'interface de gestion de RabbitMQ est accessible sur `http://localhost:15672`
(identifiants : `RABBITMQ_USER` et `RABBITMQ_PASSWORD` dans `.env`). Le compte
`guest` n'est pas utilisé ; il ne sert que de valeur par défaut dans le code si
`RABBITMQ_URI` est absent.

---

## Mode production

```bash
./bin/docker/up.sh -p -d  # démarre la stack complète en arrière-plan
./bin/docker/down.sh      # arrête
```

Docker démarre **trois services**, plus **trois services éphémères** de préparation :

```
Docker lance :
  ├ indicateurs_init_db       (éphémère : crée la base "indicators" si absente, puis s'arrête)
  ├ indicateurs_migrate       (éphémère : applique les migrations TypeORM en attente, puis s'arrête)
  ├ indicateurs_rabbitmq      (interne, non exposé)
  ├ indicateurs_rabbitmq_init (éphémère : crée ou corrige le compte RabbitMQ, puis s'arrête)
  ├ indicateurs_api           (interne, non exposé directement ; attend les trois services éphémères et RabbitMQ)
  └ indicateurs_nginx         (exposé sur le port INDICATEURS_PORT de la machine, 4300 par défaut)
        ├ sert l'application Angular compilée
        ├ sert le widget embarqué sous /embed/
        ├ relaie /api/*      → indicateurs_api:3001
        └ relaie /socket.io/ → indicateurs_api:3001 (WebSocket)
```

Nginx est le **seul point d'entrée** : le navigateur ne communique qu'avec lui.

| URL | Ce que Nginx fait |
|---|---|
| `http://monserveur:4300/` | Renvoie `index.html` (application Angular) |
| `http://monserveur:4300/embed/main.js` | Sert les fichiers du widget embarqué |
| `http://monserveur:4300/api/...` | Relaie vers NestJS (port 3001) |
| `ws://monserveur:4300/socket.io/` | Relaie le WebSocket vers NestJS |

PostgreSQL reste celui de PLaTon, accessible via `platon-network`.

---

## Différences dev / prod

| | Dev | Prod |
|---|---|---|
| Code source | Modifiable en direct | Compilé au `docker build` |
| Rechargement à chaud | Oui | Non |
| Frontend | `ng serve` (localhost:4200) | Nginx (port 4300) |
| API | `nest start --watch` | `node dist/main` |
| URL de l'API (Angular) | `http://localhost:3001/api` | `/api` (relatif, relayé par Nginx) |

---

## Logs

`docker-compose.prod.yml` configure une rotation (`x-logging`, pilote `json-file`, 5 fichiers de 10 Mo au maximum par service) ; sans elle, les logs s'accumuleraient indéfiniment sur le disque du serveur. Elle ne couvre ni la centralisation et la recherche après coup (Loki, ELK) ni les alertes automatiques (Sentry), volontairement laissées de côté tant qu'un seul microservice à faible charge ne le justifie pas.

---

## Configuration requise

Copier `.env.example` en `.env` et renseigner les valeurs manquantes :

```bash
cp .env.example .env
```

Variables importantes à adapter :

| Variable | Description |
|---|---|
| `PLATON_DB_PASSWORD` | Mot de passe PostgreSQL (le même que dans `platon/.env`) |
| `INDICATORS_DB_PASSWORD` | Même serveur et même utilisateur que la base PLaTon, donc en général la même valeur |
| `RABBITMQ_PASSWORD` | Mot de passe du compte RabbitMQ d'Indicateurs |
| `NODE_ENV` | `production` active la vérification complète des tokens ; en local, mettre `development` (voir [securite.md](../architecture/securite.md)) |
| `JWT_SECRET` | Identique au `SECRET_KEY` du PLaTon déployé à côté de cette instance (utilisé seulement avec `NODE_ENV=production`, voir [securite.md](../architecture/securite.md)) |
| `INDICATEURS_PORT` | Port exposé pour le frontend (défaut : `4300`) |
| `PLATON_DB_ADMIN_USERNAME`/`PASSWORD` | Optionnel : identifiant Postgres à privilèges élevés pour l'installation des déclencheurs dynamiques (voir [ingestion-evenements.md](../fonctionnement/ingestion-evenements.md)). Commenté dans `.env.example` : le décommenter dans `.env` si besoin. `env_file: .env` sur le service `api` transmet toute variable ajoutée là, et `bin/generate-api-env.sh` le reprend dans `api/.env` s'il est renseigné (voir plus bas). |

### `api/.env` : généré, jamais édité à la main

En mode dev, l'API tourne hors Docker (`yarn start:dev`) et lit `api/.env`,
pas le `.env` racine. Les deux fichiers diffèrent sur certains points
(`platon_postgres` et `indicateurs_rabbitmq` ne désignent rien hors du réseau
Docker, et sont remplacés par `localhost`). Les tenir à jour à la main en
double ferait vite diverger un mot de passe d'un côté et pas de l'autre.

```bash
./bin/generate-api-env.sh
```

Ce script régénère entièrement `api/.env` à partir du `.env` racine. Il est à
relancer après toute modification du `.env` racine (mot de passe RabbitMQ,
etc.). Le fichier généré porte un en-tête qui le rappelle ; ne pas l'éditer
directement, les changements seraient écrasés au prochain lancement du script.

**Un fichier à modifier avant le build, pas une variable d'environnement** :
`frontend/src/environments/environment.embed.prod.ts` contient l'adresse
`<domaine-indicateurs-a-remplacer>` (adresse de l'API appelée par le widget
embarqué, voir `docs/platon-integration/integration-indicateurs.md`, section
« environment.embed.prod.ts »). Elle est à remplacer par le vrai domaine de
production avant tout déploiement réel du widget. Le build réussit même si on
l'oublie ; l'erreur n'apparaît qu'à l'exécution, dans le navigateur de
l'utilisateur.

---

## Schéma de la base `indicators` (migrations TypeORM)

Le fonctionnement reprend celui de PLaTon (`platon/migrations/`,
`platon/bin/migration/*.sh`) : `synchronize` est **toujours désactivé**
(`api/src/modules/core/config/configuration.ts`), y compris en dev. Le schéma
n'évolue que par de vraies migrations TypeORM, jamais par synchronisation
automatique.

- `api/src/typeorm-cli.datasource.ts` : `DataSource` dédiée au CLI TypeORM
  (`ts-node`), séparée de la connexion de l'application (`core.module.ts`).
- `api/src/migrations/` : fichiers de migration horodatés. `yarn migration:run`
  les exécute avec `ts-node` depuis `src/` ; c'est pour cela que l'image de
  l'API contient aussi `src/` et `tsconfig.json`.
- `bin/migration/{create,generate,run,revert}.sh` : raccourcis à la racine du
  dépôt, sur le modèle des scripts de PLaTon.

**Différence assumée avec PLaTon** : chez PLaTon, `bin/migration/run.sh` est
une étape manuelle du déploiement. Pour Indicateurs, le service Docker
`migrate` lance `yarn migration:run` automatiquement avant que l'API démarre,
pour qu'une base neuve sans migrations ne fasse jamais planter l'API au
démarrage (`relation "..." does not exist`).

Démarche pour toute évolution du schéma :
```bash
# 1. Modifier l'entité TypeScript concernée
# 2. Générer la migration (compare les entités à la base indiquée dans .env)
./bin/migration/generate.sh NomDeLaMigration
# 3. Relire le fichier généré dans api/src/migrations/, puis le committer
# 4. L'appliquer en local pour tester
./bin/migration/run.sh
```

---

## Déploiement via GitHub Actions (manuel)

Le déploiement se fait par SSH vers le serveur qui héberge déjà PLaTon et Indicateurs, **sans registre d'images** : le build a lieu sur le serveur lui-même via `bin/docker/up.sh --prod -d`, exactement comme un déploiement manuel. Le workflow (`.github/workflows/deploy.yml`) ne fait qu'exécuter à distance ce qu'on lancerait à la main.

**Déclenchement manuel uniquement** (onglet *Actions* du dépôt GitHub, puis *Run workflow*) : pas d'automatisation à chaque push tant que le pipeline n'a pas fait ses preuves.

Étapes exécutées sur le serveur :
1. `git fetch`, `git checkout`, puis `git reset --hard origin/<ref>` sur le dossier de déploiement. Ce dossier n'est jamais modifié à la main, donc le `reset` est sans risque, et il évite un conflit si les fichiers ont changé.
2. `bin/docker/up.sh --prod -d` (build, migrations, redémarrage, voir plus haut).
3. Vérification : `curl` sur le port `INDICATEURS_PORT` (lu dans le `.env` du serveur), jusqu'à 6 tentatives espacées de 5 s ; en cas d'échec, le job affiche les 50 dernières lignes de logs des services avant d'échouer.

**Secrets à créer** dans *Settings → Secrets and variables → Actions* du dépôt GitHub :

| Secret | Contenu |
|---|---|
| `DEPLOY_HOST` | Adresse IP ou nom de domaine du serveur |
| `DEPLOY_USER` | Utilisateur SSH (doit pouvoir lancer `docker compose` sans sudo, donc être membre du groupe `docker`) |
| `DEPLOY_SSH_KEY` | Clé privée SSH (format PEM) dédiée au déploiement, jamais une clé personnelle |
| `DEPLOY_PORT` | Port SSH (optionnel, défaut `22`) |
| `DEPLOY_PATH` | Chemin absolu du dossier `indicateurs/` sur le serveur (par exemple `/opt/indicateurs`) |

Le workflow contient une ligne `environment: production` en commentaire. La
décommenter active un environnement GitHub nommé `production` (à configurer
dans *Settings → Environments*), ce qui permet d'exiger une validation avant
chaque déploiement, sans autre modification du workflow.

**Prérequis serveur** : le dossier `DEPLOY_PATH` doit déjà être un clone du dépôt (`git clone <adresse-du-dépôt>`), avec un `.env` complet (voir *Configuration requise* plus haut) et une clé de déploiement GitHub (*deploy key*) autorisée en lecture sur le dépôt, pour que le `git fetch` fonctionne sans intervention manuelle.

---

## Structure des fichiers Docker et des scripts

```
indicateurs/
├ .docker/
│   ├ api/
│   │   └ Dockerfile          ← NestJS en deux étapes (compile les modules natifs)
│   └ frontend/
│       ├ Dockerfile          ← build Angular (application autonome + widget embarqué) → image Nginx
│       └ nginx.conf          ← relais API + WebSocket + application + widget embarqué (/embed/)
├ bin/
│   ├ setup.sh                ← point d'entrée sur une nouvelle machine (dev, ou prod avec -p)
│   ├ generate-api-env.sh     ← génère api/.env depuis le .env racine
│   ├ docker/
│   │   ├ up.sh               ← lance dev, ou prod avec -p
│   │   └ down.sh             ← arrête la stack de production
│   ├ migration/
│   │   ├ create.sh / generate.sh ← créer ou générer une migration TypeORM
│   │   └ run.sh / revert.sh      ← appliquer ou annuler les migrations
│   └ platon-db/
│       ├ export.sh           ← exporte platon_db et indicators en fichiers .dump
│       └ import.sh           ← restaure ces deux bases (écrase les existantes)
├ api/src/typeorm-cli.datasource.ts  ← DataSource dédiée au CLI (ts-node)
├ api/src/migrations/         ← fichiers de migration horodatés
├ docker-compose.dev.yml      ← init-db, migrate, RabbitMQ, rabbitmq-init
└ docker-compose.prod.yml     ← stack complète : les mêmes, plus api et nginx
```
