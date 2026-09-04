# Migration Postgres natif → Docker (guide de reproduction)

Ce guide sert chaque fois qu'il faut faire passer une base Postgres qui tourne
en **natif** (paquet système, hors Docker) vers le conteneur `platon_postgres`,
sans perdre les données - typiquement pour récupérer un jeu de données de test
existant sur une nouvelle machine, ou après une bascule native → Docker.
Complète [docker.md](docker.md), qui décrit la configuration cible.

## Prérequis

- PLaTon démarré en Docker (`platon/bin/docker/up.sh`).
- Le Postgres natif contenant les données à récupérer, installé et
  démarrable (`pg_ctlcluster` ou équivalent selon la distribution).
- Le port 5432 ne peut être occupé que par un seul Postgres à la fois (natif
  **ou** Docker) - il faut arrêter l'un pour démarrer l'autre pendant le dump.

## Étapes

### 1. Démarrer PLaTon en Docker

```bash
cd platon && ./bin/docker/up.sh
```

### 2. Dumper la base depuis le Postgres natif

```bash
docker stop platon_postgres         # libère le port 5432
sudo pg_ctlcluster 16 main start    # démarre le Postgres natif (adapter la version du cluster)

pg_dump -h localhost -p 5432 -U platon -d <nom_base> -Fc -f <nom_base>_dump.dump

sudo pg_ctlcluster 16 main stop     # libère le port 5432 à nouveau
docker start platon_postgres
```

### 3. Recréer la base côté Docker et restaurer

```bash
docker exec platon_postgres psql -U platon -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='<nom_base>' AND pid <> pg_backend_pid();"
docker exec platon_postgres psql -U platon -d postgres -c "DROP DATABASE IF EXISTS <nom_base>;"
docker exec platon_postgres psql -U platon -d postgres -c "CREATE DATABASE <nom_base> OWNER platon;"

pg_restore -h localhost -p 5432 -U platon -d <nom_base> --no-owner --no-privileges -j 4 <nom_base>_dump.dump
```

Répéter les étapes 2 et 3 pour chaque base à migrer (typiquement `platon_db`,
et `indicators` si besoin de vraies données de test - voir point suivant).

### 4. Cas particulier de la base `indicators`

Le schéma se construit automatiquement via les migrations TypeORM
(service Docker `migrate`, voir [docker.md](docker.md#schéma-de-la-base-indicators-migrations-typeorm)) -
inutile de dumper/restaurer `indicators` juste pour obtenir le schéma. Cette
procédure ne reste utile que pour récupérer de **vraies données** de test déjà
existantes (indicateurs déjà créés, valeurs calculées...).

### 5. Libérer les ports si un RabbitMQ manuel tourne déjà

```bash
docker stop rabbitmq   # si un conteneur RabbitMQ lancé à la main occupe déjà 5672/15672
```

### 6. Démarrer indicateurs et vérifier

```bash
cp .env.example .env   # si pas déjà fait - renseigner les vraies valeurs
./bin/docker/up.sh -p -d

curl http://localhost:4300/                 # 200 attendu (frontend)
curl http://localhost:4300/api/indicators   # 200 + données réelles attendues
```
