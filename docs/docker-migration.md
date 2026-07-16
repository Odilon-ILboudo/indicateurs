# Journal de configuration Docker + migration des bases (2026-07-16)

Ce fichier documente **toutes les manipulations réellement effectuées** pour faire
tourner indicateurs entièrement en Docker (API + frontend + RabbitMQ) contre un
PLaTon lui-même entièrement en Docker, avec les vraies données de test (pas un
jeu de données vide ou périmé). Complète [docker.md](docker.md) (qui décrit la
configuration cible) en expliquant le **cheminement** qui y a mené - utile si un
problème similaire se reproduit, ou pour reproduire la même chose sur une autre
machine.

## Contexte de départ

- PLaTon tournait jusqu'ici en Postgres **natif** (paquet Ubuntu, cluster 16,
  `/var/lib/postgresql/16/main`) sur cette machine, pas via son propre
  docker-compose - seul RabbitMQ tournait en Docker (conteneur `rabbitmq` lancé
  à la main, pas via un compose).
- Un ancien volume Docker `platon_postgresdata` existait déjà (créé le
  2026-05-07, jamais nettoyé) avec un tout petit jeu de données factice/périmé
  (31 utilisateurs synthétiques) - sans rapport avec le vrai dump de test
  (~1688 utilisateurs) utilisé au quotidien sur le Postgres natif.
- Objectif : que `docker-compose.prod.yml` d'indicateurs (le seul qui
  containerise API + frontend + RabbitMQ) tourne correctement contre le
  PLaTon Docker, avec les vraies données.

## Modifications de fichiers (code/config)

Toutes côté **indicateurs uniquement** - aucun fichier PLaTon n'a été modifié à
aucun moment.

| Fichier | Changement |
|---|---|
| `docker-compose.dev.yml` / `docker-compose.prod.yml` | Réseau externe `platon-network` référencé via `name: ${PLATON_NETWORK_NAME:-platon_platon-network}` (au lieu d'un nom figé) |
| `bin/docker/up.sh` / `down.sh` | Détection automatique du nom réel du réseau PLaTon (`docker network ls` + filtre), seulement si `PLATON_NETWORK_NAME` absent du shell **et** de `.env` |
| `.env.example` | Ajout de `PLATON_NETWORK_NAME` documenté |
| `.env` (racine, **nouveau fichier**, n'existait pas) | Créé à partir de `.env.example` avec les vraies valeurs (mots de passe, secrets) - nécessaire car `docker-compose.prod.yml` est à la racine et attend son `.env` au même niveau, différent de `api/.env` |
| `docker-compose.prod.yml` | Nouveau service `init-db` (éphémère, image `postgres:13-alpine`) : crée la base `indicators` sur `platon_postgres` si absente. Bug corrigé en cours de route : les appels `psql` ne précisaient pas `-d postgres`, donc se connectaient par défaut à une base nommée comme l'utilisateur (`platon`), qui n'existe pas - corrigé en ajoutant `-d postgres` partout |
| `docker-compose.prod.yml` | `api` attend désormais `init-db: condition: service_completed_successfully` avant de démarrer |
| `api/.env` | `PLATON_DB_NAME`/`INDICATORS_DB_NAME` mis à jour (`platon` → `platon_db`, pour correspondre à la base réellement créée côté PLaTon Docker). `PLATON_DB_HOST`/`INDICATORS_DB_HOST` restent `localhost` (ce fichier sert au process **natif** `nest start --watch` ; `platon_postgres` n'est résoluble que depuis l'intérieur du réseau Docker, pas depuis l'hôte - erreur `EAI_AGAIN` sinon) |
| `api/yarn.lock` | Régénéré (`yarn install`) : `package.json` déclarait `jsonwebtoken@^9.0.3`/`@types/jsonwebtoken@^9.0.10` mais le lockfile n'avait que d'anciens intitulés de plage (`^9.0.0`/`^9.0.4`) sans entrée correspondante - `--frozen-lockfile` (utilisé par le Dockerfile) refusait de builder. Vérifié : **aucune version résolue n'a changé** (diff des URLs `resolved` avant/après : 0 ligne), uniquement du reformatage + les 2 entrées manquantes |
| `environment.ts` / `environment.prod.ts` | Ajout de `platonBaseUrl` (au lieu d'une constante codée en dur dans un composant) |
| `authentification.page.ts` | Lit désormais `environment.platonBaseUrl` au lieu de `https://platon.univ-eiffel.fr` en dur |

## Chronologie des manipulations manuelles

### 1. Démarrage de PLaTon en Docker
```bash
cd platon && ./bin/docker/up.sh
```
→ Conteneurs `platon_postgres`, `platon_redis`, `platon_pgadmin` démarrés.
Réseau réellement créé : `platon_platon-network` (confirmé via `docker network ls`,
comme prévu par la détection).

### 2. Diagnostic des écarts de données
- `platon_postgres` (Docker) : 31 utilisateurs seulement, aucune base `indicators`.
- Conteneur `rabbitmq` manuel déjà présent sur les ports `5672`/`15672` (conflit
  avec le futur `indicateurs_rabbitmq`).
- Décision : migrer le vrai dump natif plutôt que repartir de données vides/périmées.

### 3. Migration de la base `platon` (native → Docker)
```bash
docker stop platon_postgres                    # libère le port 5432
sudo pg_ctlcluster 16 main start                # démarre le Postgres natif
pg_dump -h localhost -p 5432 -U platon -d platon -Fc -f platon_test_dump.dump
sudo pg_ctlcluster 16 main stop                 # libère le port 5432 à nouveau
docker start platon_postgres

# Recréation propre de platon_db côté Docker
docker exec platon_postgres psql -U platon -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='platon_db' AND pid <> pg_backend_pid();"
docker exec platon_postgres psql -U platon -d postgres -c "DROP DATABASE IF EXISTS platon_db;"
docker exec platon_postgres psql -U platon -d postgres -c "CREATE DATABASE platon_db OWNER platon;"

pg_restore -h localhost -p 5432 -U platon -d platon_db --no-owner --no-privileges -j 4 platon_test_dump.dump
```
Vérifié après coup : 1688 utilisateurs, les 4 cours passés en `teacher` pour le
compte de test sont bien présents. Extensions utilisées par le dump (`unaccent`,
`uuid-ossp`) confirmées compatibles avec l'image `postgres:13` de PLaTon (pas de
dépendance à `pgvector`).

### 4. Libération des ports RabbitMQ
```bash
docker stop rabbitmq   # conteneur manuel, pas géré par un compose
```

### 5. Premier lancement de la stack indicateurs (échec)
```bash
./bin/docker/up.sh -p -d
```
Échec au build : `api/yarn.lock` désynchronisé (`--frozen-lockfile`). Corrigé
(voir tableau ci-dessus), puis rebuild réussi.

### 6. Deuxième échec : base `indicators` vide
`indicateurs_api` en crash-loop : `relation "indicator_event_types" does not
exist`. Cause : `init-db` avait créé une base `indicators` neuve et vide, et
`synchronize` (TypeORM) est désactivé en production (`NODE_ENV=production`) -
comportement voulu pour ne jamais auto-modifier un schéma de prod, mais aucune
migration formelle n'existe dans ce projet pour construire le schéma from
scratch (seulement des scripts SQL manuels dans `api/src/scripts/migrations/`).

### 7. Migration de la base `indicators` (native → Docker)
Même séquence que pour `platon`, appliquée cette fois à la base `indicators` :
```bash
docker stop platon_postgres
sudo pg_ctlcluster 16 main start
pg_dump -h localhost -p 5432 -U platon -d indicators -Fc -f indicators_dump.dump
sudo pg_ctlcluster 16 main stop
docker start platon_postgres

docker exec platon_postgres psql -U platon -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='indicators' AND pid <> pg_backend_pid();"
docker exec platon_postgres psql -U platon -d postgres -c "DROP DATABASE IF EXISTS indicators;"
docker exec platon_postgres psql -U platon -d postgres -c "CREATE DATABASE indicators OWNER platon;"

pg_restore -h localhost -p 5432 -U platon -d indicators --no-owner --no-privileges -j 4 indicators_dump.dump
```
11 tables restaurées (dont `indicator_pins`, créée par `synchronize` lors des
tests natifs de cette session), 9 indicateurs.

### 8. Redémarrage et vérification finale
```bash
docker restart indicateurs_api
curl http://localhost:4300/                 # 200 - frontend servi
curl http://localhost:4300/api/indicators   # 200 - vraies données retournées
```

### 9. Résolution définitive du trou de migration (session suivante)

Le contournement du point 6 (restaurer un dump qui avait déjà le schéma)
n'aurait pas fonctionné sur un vrai premier déploiement sans dump de secours.
Résolu en adoptant de vraies migrations TypeORM, calquées sur le
fonctionnement de PLaTon (`platon/migrations/`) : voir la section
[Schéma de la base `indicators` (migrations TypeORM)](docker.md#schéma-de-la-base-indicators-migrations-typeorm)
dans `docker.md`. Le service Docker `migrate` construit désormais tout le
schéma automatiquement sur une base neuve - plus besoin de dump de secours
pour ça (la donnée de test, elle, reste un besoin séparé).

## État final

- Postgres **natif** : arrêté, plus utilisé (tout tourne désormais dans
  `platon_postgres`).
- `platon_postgres` (Docker) : bases `platon_db` (1688 utilisateurs, test data
  intact) et `indicators` (schéma + 9 indicateurs) - copies fidèles du natif.
- Stack indicateurs (`indicateurs_rabbitmq`, `indicateurs_api`,
  `indicateurs_nginx`) : up et stable, testée de bout en bout via
  `http://localhost:4300`.
- Conteneur `rabbitmq` manuel : arrêté (remplacé par `indicateurs_rabbitmq`).

## Pour reproduire sur une autre machine

1. Démarrer PLaTon (`platon/bin/docker/up.sh`, avec ou sans `-p`).
2. Si une vraie base de test PLaTon existe ailleurs (dump natif, autre
   serveur...), la restaurer dans `platon_postgres` (base `platon_db`) avant
   de lancer indicateurs. **Pas nécessaire pour `indicators`** : le service
   `migrate` construit désormais tout son schéma automatiquement sur une base
   neuve (voir point 9 ci-dessus) - seules les données de test (indicateurs
   déjà créés, etc.) resteraient à restaurer séparément si besoin.
3. Créer `indicateurs/.env` à partir de `.env.example` (racine, différent de
   `api/.env`).
4. `indicateurs/bin/docker/up.sh -p -d`.
