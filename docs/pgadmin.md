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

## Pourquoi une manipulation manuelle a été nécessaire

Normalement, PLaTon pré-configure une connexion Postgres dans pgAdmin
automatiquement au démarrage, via le fichier monté
`platon/.docker/db/servers.json:/pgadmin4/servers.json`. En pratique, ce
fichier **n'existe pas** sur le disque à cet endroit - Docker Compose, ne
trouvant rien à monter, a créé un **dossier vide** du même nom à la place (un
comportement classique de Docker quand la source d'un bind-mount est absente).
Résultat : aucune connexion n'était pré-configurée, et le formulaire de
connexion de pgAdmin était vide au premier lancement.

Vérifié également : la base interne de pgAdmin (qui stocke les connexions
enregistrées) était bien vide (table `server` sans aucune ligne) - confirmant
qu'aucune configuration n'existait nulle part, ni via ce fichier, ni
manuellement au préalable.

## Ce qui a été fait exactement

Une ligne a été insérée directement dans la base SQLite interne de pgAdmin
(`/var/lib/pgadmin/pgadmin4.db`, à l'intérieur du conteneur `platon_pgadmin`)
pour y déclarer la connexion vers `platon_postgres` :

```bash
docker exec platon_pgadmin python3 -c "
import sqlite3
conn = sqlite3.connect('/var/lib/pgadmin/pgadmin4.db')
cur = conn.cursor()
cur.execute('''
INSERT INTO server (user_id, servergroup_id, name, host, port, maintenance_db, username, save_password)
VALUES (1, 1, 'PLaTon (Docker)', 'platon_postgres', 5432, 'platon_db', 'platon', 0)
''')
conn.commit()
"
```

Détail des valeurs :
- `user_id=1` / `servergroup_id=1` : l'utilisateur pgAdmin par défaut
  (`test@test.com`) et son groupe de serveurs par défaut ("Servers"), déjà
  créés automatiquement par pgAdmin au premier démarrage - vérifiés avant
  l'insertion (`SELECT id, email FROM "user"` / `SELECT id, name FROM
  servergroup`).
- `host='platon_postgres'` : nom du conteneur Postgres, résoluble depuis
  `platon_pgadmin` car les deux sont sur le même réseau Docker
  (`platon-network`).
- `maintenance_db='platon_db'` : la base par défaut affichée à la connexion
  (voir plus bas pour accéder aussi à `indicators`).
- `save_password=0` : le mot de passe n'est **pas** mémorisé (aucun moyen
  simple d'insérer un mot de passe pré-chiffré sans passer par le mécanisme de
  chiffrement interne de pgAdmin) - il est donc demandé une seule fois à la
  connexion, avec une case à cocher pour le sauvegarder à ce moment-là.

Cette opération ne touche **aucun fichier du dépôt PLaTon** - uniquement une
donnée d'exécution stockée dans le conteneur `platon_pgadmin` (l'équivalent
d'une action faite depuis l'interface web elle-même : "Ajouter un serveur").

## Se connecter une fois dans pgAdmin

1. Dans l'arborescence à gauche, ouvrir **"PLaTon (Docker)"**.
2. Renseigner le mot de passe Postgres : `test` (utilisateur `platon`, défini
   dans `platon/.env` sous `POSTGRES_PASSWORD`). Cocher "Save Password" pour
   ne plus le retaper.
3. La base `platon_db` s'affiche directement. Pour explorer aussi
   `indicators` : dans l'arborescence, sous "PLaTon (Docker)" → Databases,
   toutes les bases du même serveur Postgres sont visibles (`platon_db`,
   `indicators`, `postgres`) - pas besoin d'une deuxième connexion.

## ⚠️ Limite importante : non persistant à la recréation du conteneur

Vérifié : le volume déclaré dans `platon/docker-compose.dev.yml`
(`~/data/pgadmin:/root/.pgadmin`) **ne correspond pas** au vrai chemin de
stockage de cette image pgAdmin (`/var/lib/pgadmin`, confirmé par
inspection du conteneur). Le dossier `~/data/pgadmin` sur l'hôte est resté
vide malgré tout ce qui a été configuré - la donnée de connexion créée
ci-dessus vit uniquement dans la couche d'écriture du conteneur `platon_pgadmin`
actuellement en cours d'exécution.

Conséquence concrète :
- Un simple `docker restart platon_pgadmin` ou un arrêt/relance de la machine
  **conserve** cette configuration (le conteneur n'est pas recréé).
- En revanche, si le conteneur est **recréé** (`docker compose down` puis
  `up`, ou `docker rm platon_pgadmin`), la configuration est perdue et il
  faut refaire l'insertion SQL ci-dessus.

Ce mésalignement de volume est un problème côté fichiers PLaTon
(`platon/docker-compose.dev.yml`) - pas corrigé ici, conformément à la
consigne de ne jamais modifier les fichiers de ce projet. À signaler à
l'équipe PLaTon si une persistance durable de pgAdmin est souhaitée.
