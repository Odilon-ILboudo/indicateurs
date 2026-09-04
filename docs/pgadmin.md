# Accéder à pgAdmin (explorer la base PLaTon en Docker)

## Procédure complète, de zéro jusqu'à pgAdmin ouvert

```bash
# 1. Démarrer PLaTon (Postgres + Redis + pgAdmin)
cd ~/Documents/full_platon/platon
./bin/docker/up.sh

# 2. Vérifier que le Postgres natif est bien arrêté (sinon conflit de port 5432)
pg_lsclusters   # doit afficher "down"
# si "online" :
sudo pg_ctlcluster 16 main stop
```

Une fois `platon_postgres`, `platon_redis`, `platon_pgadmin` à `Up` (vérifiable avec
`docker ps --filter "name=platon_"`), ouvre dans le navigateur :

```
http://localhost:5050
```

Connecte-toi à pgAdmin avec les identifiants définis dans `platon/.env` :
- Email : `test@test.com`
- Mot de passe : `test`

## Connexion pré-configurée automatiquement

`platon/docker-compose.dev.yml` (utilisé par `up.sh` sans `-p`/`--prod`) monte
`platon/.docker/db/servers.json:/pgadmin4/servers.json` et déclare le volume
nommé `pgadmindata:/var/lib/pgadmin` (chemin de stockage réel de l'image
pgAdmin) - les deux sont corrects. Au premier démarrage, pgAdmin lit
`servers.json` et pré-crée automatiquement la connexion **"PLaTon (Docker)"**
(host `platon_postgres`, port 5432) dans sa base interne. Aucune manipulation
manuelle n'est nécessaire.

`pgadmindata` étant un volume Docker nommé (pas un bind-mount vers un chemin
hôte), la configuration survit à un `docker restart` comme à une recréation
du conteneur (`docker compose down` puis `up`) - elle n'est perdue que si le
volume lui-même est supprimé explicitement (`docker compose down -v`, ou
`docker volume rm`).

**Note** : `platon/docker-compose.prod.yml` déclare, lui, un volume différent
et incorrect pour pgAdmin (`~/data/pgadmin:/root/.pgadmin`, qui ne correspond
pas à `/var/lib/pgadmin`) - un problème côté fichiers PLaTon, hors périmètre
de ce projet (jamais modifié), et qui ne concerne que `up.sh --prod`, pas la
procédure ci-dessus.

## Se connecter une fois dans pgAdmin

1. Dans l'arborescence à gauche, ouvrir **"PLaTon (Docker)"**.
2. Renseigner le mot de passe Postgres : `test` (utilisateur `platon`, défini
   dans `platon/.env` sous `POSTGRES_PASSWORD`). Cocher "Save Password" pour
   ne plus le retaper.
3. La base affichée par défaut est `postgres` (`MaintenanceDB` de
   `servers.json`), pas `platon_db`. Dans l'arborescence, sous "PLaTon
   (Docker)" → Databases, toutes les bases du même serveur Postgres sont
   visibles (`platon_db`, `indicators`, `postgres`) - pas besoin d'une
   deuxième connexion.
