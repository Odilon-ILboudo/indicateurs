# Configuration Docker - Microservice Indicateurs

## Principe général

Le microservice indicateurs s'appuie sur l'infrastructure Docker de PLaTon (PostgreSQL, Redis) via le réseau partagé `platon-network`. Il apporte uniquement ce qui lui est propre : RabbitMQ, son API NestJS et son frontend Angular.

**Prérequis** : le projet PLaTon doit tourner (`bin/docker/up.sh` dans le dossier `platon/`).

Pour le détail des manipulations qui ont mené à cette configuration (migration des bases natives vers Docker, bugs rencontrés et corrigés), voir [docker-migration.md](docker-migration.md).

Pour explorer les bases Postgres via l'interface web pgAdmin, voir [pgadmin.md](pgadmin.md).

**Nom réel du réseau partagé** : les fichiers compose de PLaTon ne fixent pas de `name:` explicite sous `networks:`, donc Docker Compose préfixe le nom du réseau qu'il crée avec le nom du projet (dérivé du nom du dossier, ex : `platon_platon-network` si PLaTon est lancé depuis un dossier `platon/`). On ne modifie jamais les fichiers PLaTon : les deux `docker-compose.*.yml` d'indicateurs déclarent `platon-network` comme alias externe avec `name: ${PLATON_NETWORK_NAME:-platon_platon-network}`.

- **Source de vérité** : la variable `PLATON_NETWORK_NAME` dans `.env` (voir `.env.example`) - à renseigner une fois par déploiement, comme `JWT_SECRET`/`PLATON_DB_PASSWORD`. Si le dossier PLaTon est un jour renommé, c'est cette ligne qu'il faut ajuster (jamais les fichiers `docker-compose.*.yml`).
- **Filet de sécurité** : si `PLATON_NETWORK_NAME` n'est renseigné ni dans `.env` ni dans le shell, `bin/docker/up.sh`/`down.sh` tentent une détection automatique (`docker network ls` + filtre sur `*_platon-network`). Cette détection n'est **pas infaillible** (ambiguïté possible si plusieurs réseaux correspondent, échoue si PLaTon n'est pas encore démarré) - à ne pas considérer comme une garantie, seulement un dépannage. `.env` reste toujours prioritaire s'il est renseigné.

**Base `indicators`** : le Dockerfile Postgres de PLaTon (`platon/.docker/db/Dockerfile`) ne crée que la base définie par `POSTGRES_DB` (`platon_db`) - rien côté PLaTon ne provisionne la base `indicators` attendue par `INDICATORS_DB_NAME`. Automatisé côté indicateurs (jamais de modification côté PLaTon) : le service `init-db` de `docker-compose.prod.yml` (image `postgres:13-alpine`, éphémère) attend que Postgres réponde puis crée la base si elle n'existe pas encore (idempotent - ne fait rien si elle existe déjà). `api` ne démarre qu'une fois `init-db` terminé avec succès (`depends_on: init-db: condition: service_completed_successfully`).

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

L'UI de gestion RabbitMQ est accessible à : `http://localhost:15672` (identifiants : `guest` / `guest`).

---

## Mode production

```bash
./bin/docker/up.sh -p -d  # démarre la stack complète en arrière-plan
./bin/docker/down.sh      # arrête
```

Docker démarre **trois services** (plus un service éphémère de provisionnement) :

```
Docker lance :
  ├── indicateurs_init_db    (éphémère - crée la base "indicators" si absente, puis s'arrête)
  ├── indicateurs_rabbitmq   (interne, pas exposé)
  ├── indicateurs_api        (interne, pas exposé directement - attend indicateurs_init_db)
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

---

## Structure des fichiers Docker

```
indicateurs/
├── .docker/
│   ├── api/
│   │   └── Dockerfile          ← NestJS multi-stage (compile les addons natifs)
│   └── frontend/
│       ├── Dockerfile          ← Build Angular → image Nginx
│       └── nginx.conf          ← Proxy API + WebSocket + SPA fallback
├── bin/docker/
│   ├── up.sh                   ← Lance dev ou prod (option -p)
│   └── down.sh                 ← Arrête la stack prod
├── docker-compose.dev.yml      ← RabbitMQ uniquement
└── docker-compose.prod.yml     ← Stack complète
```
