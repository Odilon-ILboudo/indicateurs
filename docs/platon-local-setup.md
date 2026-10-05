# Reproduire l'environnement de dev sur une nouvelle machine

Tout ce qu'il faut pour repartir de zéro sur une nouvelle
machine est ici, dans l'ordre. Les réglages des étapes 3 et 4 sont à refaire à la main.

## 0. Prérequis système

- **Docker** (+ Docker Compose v2, `docker compose`, pas `docker-compose`)
- **Node** à la bonne version par projet - `nvm use` lit `.nvmrc` dans chaque
  dossier (`v22` pour `platon/`, `v20` pour `indicateurs/`)
- **`yarn`**
- **Outils de compilation natifs**, nécessaires pour que `yarn install` compile
  `isolated-vm` (utilisé par `indicateurs/api`) : `python3`, `make`, `g++` sur
  Linux (`build-essential`), Xcode Command Line Tools sur Mac
  (`xcode-select --install`). Sans ça, `yarn install` échoue sur `isolated-vm`
  avec une erreur de compilation, ou au pire, réussit mais produit un binaire qui
  plante au runtime (`Cannot find module './out/isolated_vm'`) si un ancien
  binaire d'une autre machine a été copié au lieu d'être recompilé ici.

Si `isolated-vm` plante malgré les outils installés (binaire manquant ou
copié d'une autre machine) :

```bash
cd api
rm -rf node_modules/isolated-vm   # ou node_modules entier en cas de doute
yarn install
ls node_modules/isolated-vm/out/isolated_vm.node   # doit exister après coup
```

Si le fichier reste absent, voir l'erreur réelle de compilation :

```bash
cd node_modules/isolated-vm && npx node-gyp rebuild --release -j max
```

## 1. Cloner les deux dépôts, en dossiers frères

```
un-dossier-parent/
├── platon/
└── indicateurs/
```

Les scripts d'Indicateurs (`bin/setup.sh`, etc.) supposent `platon/` au même
niveau qu'`indicateurs/` par défaut.

## 2. PLaTon : `bin/install.sh` - une fois

```bash
cd platon && ./bin/install.sh
```

Génère `.env`, `tools/database/init.json` (copié depuis
`templates/init.example.json`) et un certificat SSL auto-signé pour
`localhost` (`.docker/nginx/ssl/`). Documenté dans `platon/README.md` -
normal que ces fichiers soient absents d'un clone frais, ce script les crée.
Rien à adapter ici, la commande suffit.

## 3. PLaTon : `.docker/db/servers.json` - connexion pgAdmin pré-configurée

Nécessaire pour que pgAdmin trouve le bon conteneur Postgres :

```json
"Host": "platon_postgres"
```

Le nom du conteneur réel est `platon_postgres` (`container_name` dans
`docker-compose.dev.yml`) - une valeur différente (`postgres`, ou toute autre)
ne résout à rien sur le réseau Docker et la connexion échoue systématiquement,
peu importe le mot de passe.

## 4. PLaTon : `docker-compose.dev.yml` - deux réglages sur le service `pgadmin`

```yaml
pgadmin:
  ports:
    - "5050:80"
  volumes:
    - pgadmindata:/var/lib/pgadmin
    - .docker/db/servers.json:/pgadmin4/servers.json
```

- `ports: - "5050:80"` : sans cette ligne, rien n'écoute sur `localhost:5050`
  depuis la machine hôte - le conteneur tourne, mais reste injoignable
  jusqu'à ce qu'un port soit publié.
- `pgadmindata:/var/lib/pgadmin` plutôt qu'un bind-mount vers
  `/root/.pgadmin` : `/var/lib/pgadmin` est le vrai chemin de stockage de
  l'image `dpage/pgadmin4` - monter un volume ailleurs ne fait rien planter,
  mais la configuration ne survit à aucune recréation du conteneur (perte
  silencieuse, sans erreur visible).
- Ajouter la déclaration du volume en bas du fichier :
  ```yaml
  volumes:
    pgadmindata:
  ```

Le service `nginx` du même fichier peut être laissé actif ou commenté : sans
effet sur l'usage d'Indicateurs (frontend/API PLaTon tournent nativement via
`start-web.sh`/`nx serve`, pas derrière ce reverse proxy en dev).

## 5. Indicateurs : `.env`

```bash
cd indicateurs
cp .env.example .env
```

Variables importantes à renseigner :

| Variable | Description |
|---|---|
| `PLATON_DB_PASSWORD` | Mot de passe PostgreSQL (même que dans `platon/.env`) |
| `JWT_SECRET` | Identique au `SECRET_KEY` du PLaTon déployé aux côtés de cette instance (utilisé seulement en `NODE_ENV=production`, sans effet en dev, où l'authentification se fait sur le vrai PLaTon universitaire) |
| `INDICATEURS_PORT` | Port exposé pour le frontend en prod (défaut : `4300`) |
| `PLATON_DB_ADMIN_USERNAME`/`PASSWORD` | Optionnel - identifiant Postgres à privilèges élevés pour l'installation des déclencheurs dynamiques. Commenté dans `.env.example` : décommenter si besoin. |

`api/.env` (utilisé par l'API en mode natif, `yarn start:dev`) ne se modifie
jamais à la main. Il se régénère depuis ce `.env` racine :

```bash
./bin/generate-api-env.sh
```

À relancer après toute modification du `.env` racine (mot de passe RabbitMQ,
etc.) - sinon `api/.env` reste désynchronisé silencieusement.

## 6. Tout démarrer

```bash
./bin/setup.sh
```

Depuis `indicateurs/` : démarre PLaTon (`platon/bin/docker/up.sh`), attend que
`platon_postgres` réponde, régénère `api/.env`, puis démarre Indicateurs
(`init-db` crée la base `indicators` si absente, `migrate` applique les
migrations TypeORM, `rabbitmq`/`rabbitmq-init` démarrent et corrigent le
compte RabbitMQ même sur un volume déjà initialisé avec un autre compte).
S'arrête avec une erreur claire à la première étape qui échoue, plutôt que de
continuer en silence.

Au quotidien, une fois `platon/` déjà configuré (étapes 2 à 4 déjà faites),
la commande plus légère suffit : `./bin/docker/up.sh` (depuis `indicateurs/`),
qui ne relance que les services Docker, sans réappliquer les réglages.

## 7. Restaurer de vraies données

Par défaut, `init-db`/`migrate` créent une base `indicators` **vide**
(schéma seul, aucune donnée), et `platon_db` reste celle du dump restauré via
`platon/bin/install.sh` (aucune, sauf si un dump a déjà été restauré à la
main).

Pour récupérer les vraies données d'une machine qui les a déjà : cette étape
se fait à deux endroits différents, pas le même ordinateur. La partie "sur
la machine source" ne te concerne **que si c'est toi qui envoies tes
données** (sur l'ancienne machine, avant de la supprimer, par exemple) - si
tu es seulement en train de préparer la nouvelle machine et que quelqu'un
d'autre t'envoie les fichiers, saute directement à "sur la nouvelle machine"
ci-dessous, une fois les deux fichiers reçus.

**Sur la machine source** (celle qui a déjà les données - à ignorer si ce
n'est pas celle-ci) :
```bash
cd indicateurs
./bin/platon-db/export.sh
# → ./dumps/platon_db.dump et ./dumps/indicators.dump
```

**Transférer les deux fichiers** vers la nouvelle machine (clé USB, `scp`,
peu importe - deux fichiers autonomes), à placer dans `indicateurs/dumps/`
sur la nouvelle machine (créer le dossier s'il n'existe pas : `mkdir dumps`
- il est gitignored, jamais versionné).

**Sur la nouvelle machine** (celle que tu prépares - commence ici si les
fichiers t'ont été envoyés), une fois l'étape 6 terminée et les deux
fichiers bien présents dans `indicateurs/dumps/` :
```bash
cd indicateurs
./bin/platon-db/import.sh   # lit ./dumps par défaut
```

Demande confirmation avant d'écraser quoi que ce soit (`DROP DATABASE` sur
les deux bases). Pas besoin de relancer les migrations après coup : le dump
d'`indicators` contient déjà la table `typeorm_migrations` à jour.

**Ce qui ne change pas d'une machine à l'autre** : les mots de passe Postgres
(`POSTGRES_PASSWORD`/`DB_PASSWORD`) peuvent différer entre la machine source
et la nouvelle sans conséquence. Ce sont des identifiants de connexion,
indépendants du contenu restauré par `pg_restore`.

## 8. Installer les dépendances et lancer

```bash
cd api && yarn install && yarn start:dev     # NestJS sur localhost:3001
cd frontend && yarn install && yarn start    # Angular sur localhost:4200
```

Si `yarn install` échoue sur `isolated-vm`, revoir l'étape 0.

## 9. Accéder à pgAdmin (optionnel, pour explorer les bases)

```
http://localhost:5050
```

Identifiants : définis dans `platon/.env` (`PGADMIN_DEFAULT_EMAIL`/`PASSWORD`,
par défaut `test@test.com`/`test`). La connexion **"PLaTon (Docker)"** est
pré-configurée automatiquement dès le premier démarrage (grâce aux étapes 3 et
4). Aucune manipulation manuelle. Au premier clic dessus, renseigner le mot
de passe Postgres (`POSTGRES_PASSWORD` dans `platon/.env`, pas celui de
pgAdmin) ; cocher "Save Password" pour ne plus le retaper. Toutes les bases du
serveur (`platon_db`, `indicators`, `postgres`) apparaissent sous cette même
connexion, pas besoin d'en créer une seconde.

## Ajustements facultatifs (confort, pas obligatoires)

- **`platon/package.json`**, script `serve:web` : ajouter
  `cross-env NODE_OPTIONS=--max-old-space-size=4096` devant la commande
  existante, si `nx serve web` crashe par manque de mémoire sur la machine.
- **`platon/start-web.sh`** (pas fourni par PLaTon) : regroupe `nvm use` +
  `NX_DAEMON=false` + la même limite mémoire, pour ne pas les taper à chaque
  lancement. Fichier prêt à copier :
  ```bash
  cp docs/platon-integration/start-web.sh ../platon/start-web.sh
  ```
- **`platon/bin/docker/down.sh`** : commenter `docker volume rm platon_dist`
  pour éviter de perdre ce volume à chaque arrêt - sans impact sur les
  données réelles (artefacts de build uniquement), juste un rebuild en moins
  à refaire.

## À ne jamais reproduire

**`docker start` sur un conteneur `platon_postgres` existant plutôt que
`docker compose up`** : peut le laisser détaché de `platon-network` sans
message d'erreur (observé en conditions réelles) - le conteneur tourne, mais
`init-db`/`migrate`/pgAdmin échouent ensuite à le joindre. Toujours repasser
par `./bin/docker/up.sh` côté `platon/` pour (re)démarrer ce conteneur. En cas
de doute sur l'état du réseau : `docker ps --filter name=platon_postgres
--format "{{.Networks}}"` doit afficher `platon_platon-network`, pas une
valeur vide - sinon `docker network connect platon_platon-network
platon_postgres` corrige sans perte de données.
