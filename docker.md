# Configuration Docker - Microservice Indicateurs

## Principe général

Le microservice indicateurs s'appuie sur l'infrastructure Docker de PLaTon (PostgreSQL, Redis) via le réseau partagé `platon-network`. Il apporte uniquement ce qui lui est propre : RabbitMQ, son API NestJS et son frontend Angular.

**Prérequis** : le projet PLaTon doit tourner (`bin/docker/up.sh` dans le dossier `platon/`).

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

Docker démarre **trois services** :

```
Docker lance :
  ├── indicateurs_rabbitmq   (interne, pas exposé)
  ├── indicateurs_api        (interne, pas exposé directement)
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
