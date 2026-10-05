#!/bin/bash -e

# Restaure platon_db et indicators depuis des .dump produits par export.sh - ÉCRASE les bases existantes (DROP puis CREATE).
# Usage : ./bin/platon-db/import.sh [dossier_source]   (défaut : ./dumps)

IN_DIR="${1:-./dumps}"
CONTAINER=platon_postgres
PG_USER=platon

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Erreur : le conteneur $CONTAINER n'est pas démarré." >&2
  exit 1
fi

for db in platon_db indicators; do
  if [[ ! -f "$IN_DIR/${db}.dump" ]]; then
    echo "Erreur : fichier introuvable : $IN_DIR/${db}.dump" >&2
    exit 1
  fi
done

echo "Ceci va supprimer puis recréer platon_db et indicators dans $CONTAINER,"
echo "à partir de $IN_DIR/*.dump. Toute donnée actuelle de ces deux bases sera perdue."
read -r -p "Continuer ? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Annulé."
  exit 0
fi

for db in platon_db indicators; do
  echo "Restauration de $db..."

  docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$db' AND pid <> pg_backend_pid();" \
    >/dev/null
  docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -c "DROP DATABASE IF EXISTS $db;" >/dev/null
  docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -c "CREATE DATABASE $db OWNER $PG_USER;" >/dev/null

  docker cp "$IN_DIR/${db}.dump" "$CONTAINER:/tmp/${db}.dump"
  docker exec "$CONTAINER" pg_restore -U "$PG_USER" -d "$db" --no-owner --no-privileges -j 4 "/tmp/${db}.dump"
  docker exec "$CONTAINER" rm "/tmp/${db}.dump"
done

echo "Terminé."
