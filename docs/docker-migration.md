# Migration Postgres : natif → Docker, ou Docker → Docker (guide de reproduction)

Ce guide sert chaque fois qu'il faut transférer `platon_db`/`indicators` sans
perdre les données, dans deux situations différentes :
- **Natif → Docker** (ci-dessous) : une base qui tourne en natif (paquet
  système, hors Docker) sur la même machine, à faire passer dans le conteneur
  `platon_postgres`.
- **Docker → Docker, entre deux machines** (voir plus bas) : récupérer sur une
  nouvelle machine exactement les mêmes données que celles d'une machine où
  `platon_postgres` tourne déjà en Docker - le cas le plus courant pour
  reproduire un environnement de dev avec de vraies données.

Complète [docker.md](docker.md) et [platon-local-setup.md](platon-local-setup.md), qui décrivent la configuration cible.

## Natif → Docker

### Prérequis

- PLaTon démarré en Docker (`platon/bin/docker/up.sh`).
- Le Postgres natif contenant les données à récupérer, installé et
  démarrable (`pg_ctlcluster` ou équivalent selon la distribution).
- Le port 5432 ne peut être occupé que par un seul Postgres à la fois (natif
  **ou** Docker) - il faut arrêter l'un pour démarrer l'autre pendant le dump.

### Étapes

#### 1. Démarrer PLaTon en Docker

```bash
cd platon && ./bin/docker/up.sh
```

#### 2. Dumper la base depuis le Postgres natif

```bash
docker stop platon_postgres         # libère le port 5432
sudo pg_ctlcluster 16 main start    # démarre le Postgres natif (adapter la version du cluster)

pg_dump -h localhost -p 5432 -U platon -d <nom_base> -Fc -f <nom_base>_dump.dump

sudo pg_ctlcluster 16 main stop     # libère le port 5432 à nouveau
docker start platon_postgres
```

#### 3. Recréer la base côté Docker et restaurer

```bash
docker exec platon_postgres psql -U platon -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='<nom_base>' AND pid <> pg_backend_pid();"
docker exec platon_postgres psql -U platon -d postgres -c "DROP DATABASE IF EXISTS <nom_base>;"
docker exec platon_postgres psql -U platon -d postgres -c "CREATE DATABASE <nom_base> OWNER platon;"

pg_restore -h localhost -p 5432 -U platon -d <nom_base> --no-owner --no-privileges -j 4 <nom_base>_dump.dump
```

Répéter les étapes 2 et 3 pour chaque base à migrer (typiquement `platon_db`,
et `indicators` si besoin de vraies données de test - voir point suivant).

#### 4. Cas particulier de la base `indicators`

Le schéma se construit automatiquement via les migrations TypeORM
(service Docker `migrate`, voir [docker.md](docker.md#schéma-de-la-base-indicators-migrations-typeorm)) -
inutile de dumper/restaurer `indicators` juste pour obtenir le schéma. Cette
procédure ne reste utile que pour récupérer de **vraies données** de test déjà
existantes (indicateurs déjà créés, valeurs calculées...).

#### 5. Libérer les ports si un RabbitMQ manuel tourne déjà

```bash
docker stop rabbitmq   # si un conteneur RabbitMQ lancé à la main occupe déjà 5672/15672
```

#### 6. Démarrer indicateurs et vérifier

```bash
cp .env.example .env   # si pas déjà fait - renseigner les vraies valeurs
./bin/docker/up.sh -p -d

curl http://localhost:4300/                 # 200 attendu (frontend)
curl http://localhost:4300/api/indicators   # 200 + données réelles attendues
```

## Docker → Docker, entre deux machines

Un volume Docker ne voyage jamais d'une machine à l'autre tout seul - `docker
compose up` sur une nouvelle machine recrée toujours un volume **vide**. Pour
obtenir exactement les mêmes données que sur une machine où `platon_postgres`
tourne déjà, il faut transférer les données elles-mêmes, pas juste relancer
Docker. Deux scripts font ça : `bin/platon-db/export.sh` et
`bin/platon-db/import.sh` (ce dépôt, pas `platon/`).

### Sur la machine source : exporter

```bash
cd indicateurs
./bin/platon-db/export.sh
# → ./dumps/platon_db.dump et ./dumps/indicators.dump
```

### Transférer les deux fichiers vers la nouvelle machine

Clé USB, `scp`, peu importe - ce sont deux fichiers autonomes
(`platon_db.dump`, `indicators.dump`). **Où les placer** : dans
`indicateurs/dumps/` sur la nouvelle machine - même dossier que celui où
`export.sh` les a produits sur la machine source, et celui qu'`import.sh` lit
par défaut (pas besoin de lui passer un chemin si c'est bien là). Ce dossier
est gitignored, jamais versionné - à recréer (`mkdir dumps`) s'il n'existe pas
encore sur la nouvelle machine.

### Sur la nouvelle machine : préparer puis importer

```bash
# 1. Setup PLaTon (génère .env, certs, init.json - voir platon-local-setup.md)
cd platon && ./bin/install.sh
./bin/docker/up.sh -d
cd ..

# 2. Importer les deux bases (écrase platon_db/indicators si elles existent déjà)
cd indicateurs
./bin/platon-db/import.sh   # lit ./dumps par défaut
```

`import.sh` demande une confirmation avant d'écraser quoi que ce soit (`DROP
DATABASE` sur les deux bases). Pas besoin de relancer les migrations
TypeORM après coup : le dump de `indicators` contient déjà la table
`typeorm_migrations` avec l'historique complet - les relancer ne ferait rien
de plus (idempotent), ce n'est utile que pour une base neuve sans dump (voir
section précédente, point 4).

### Ce qui ne change pas d'une machine à l'autre

`.env`/`POSTGRES_PASSWORD` peuvent différer entre les deux machines sans
conséquence - ce sont des identifiants Postgres, indépendants du contenu
restauré par `pg_restore`.
