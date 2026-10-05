#!/bin/bash -e

# Exporte platon_db et indicators depuis platon_postgres en .dump, pour transférer vers une autre machine - voir docs/docker-migration.md.
# Usage : ./bin/platon-db/export.sh [dossier_de_sortie]   (défaut : ./dumps)

OUT_DIR="${1:-./dumps}"
CONTAINER=platon_postgres
PG_USER=platon

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Erreur : le conteneur $CONTAINER n'est pas démarré." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

for db in platon_db indicators; do
  echo "Export de $db..."
  docker exec "$CONTAINER" pg_dump -U "$PG_USER" -d "$db" -Fc -f "/tmp/${db}.dump"
  docker cp "$CONTAINER:/tmp/${db}.dump" "$OUT_DIR/${db}.dump"
  docker exec "$CONTAINER" rm "/tmp/${db}.dump"
done

echo "Terminé : $OUT_DIR/platon_db.dump et $OUT_DIR/indicators.dump"
