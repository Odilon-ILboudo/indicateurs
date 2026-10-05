#!/bin/bash -e

# Point d'entrée unique pour préparer une nouvelle machine, dev ou prod : démarre PLaTon,
# régénère api/.env (dev uniquement, inutile en prod qui lit .env directement), lance
# Indicateurs (base/migrations/RabbitMQ, + api/nginx en prod), importe un dump si fourni.
# Les réglages ponctuels de platon/ restent manuels (voir docs/platon-local-setup.md), à faire
# une seule fois avant ce script.
#
# Usage : ./bin/setup.sh [-p|--prod] [chemin/vers/platon] [chemin/vers/dumps]
#   -p, --prod   : mode production (docker-compose.prod.yml des deux côtés) - dev par défaut
#   1er argument : dossier platon/ (défaut : ../platon)
#   2e argument  : dossier contenant platon_db.dump/indicators.dump à importer (optionnel)

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/.."

prod=false
args=()
for arg in "$@"; do
  case "$arg" in
    -p|--prod) prod=true ;;
    *) args+=("$arg") ;;
  esac
done

PLATON_DIR="${args[0]:-../platon}"
DUMP_DIR="${args[1]:-}"
mode_label() { [ "$prod" = true ] && echo prod || echo dev; }

if [[ ! -d "$PLATON_DIR" ]]; then
  echo "Erreur : dossier PLaTon introuvable ($PLATON_DIR)." >&2
  exit 1
fi

if [[ ! -f "$PLATON_DIR/.env" ]]; then
  echo "Erreur : $PLATON_DIR/.env absent." >&2
  echo "Lancer d'abord (cd $PLATON_DIR && ./bin/install.sh), puis appliquer les réglages" >&2
  echo "manuels de docs/platon-local-setup.md (servers.json, docker-compose.dev.yml)." >&2
  exit 1
fi

echo "==> Démarrage de PLaTon ($PLATON_DIR, mode $(mode_label))"
if [ "$prod" = true ]; then
  ( cd "$PLATON_DIR" && ./bin/docker/up.sh -p -d )
else
  ( cd "$PLATON_DIR" && ./bin/docker/up.sh -d )
fi

echo "==> Attente de platon_postgres..."
i=0
until docker exec platon_postgres pg_isready -U platon >/dev/null 2>&1; do
  i=$((i+1))
  if [ "$i" -ge 30 ]; then
    echo "Erreur : platon_postgres injoignable après 60s." >&2
    exit 1
  fi
  sleep 2
done

if [[ ! -f .env ]]; then
  echo "Erreur : .env absent - copier .env.example en .env, le renseigner, puis relancer ce script." >&2
  exit 1
fi

if [ "$prod" = true ]; then
  compose_file="docker-compose.prod.yml"
else
  echo "==> Génération de api/.env depuis .env"
  ./bin/generate-api-env.sh
  compose_file="docker-compose.dev.yml"
fi

echo "==> Démarrage d'Indicateurs (mode $(mode_label))"
docker compose -f "$compose_file" up -d --build

for svc in init-db migrate rabbitmq-init; do
  container="indicateurs_${svc//-/_}"
  echo "==> Vérification de $container..."
  i=0
  while [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" = "true" ]; do
    i=$((i+1))
    if [ "$i" -ge 30 ]; then
      echo "Erreur : $container ne s'est pas terminé après 60s." >&2
      exit 1
    fi
    sleep 2
  done
  code=$(docker inspect -f '{{.State.ExitCode}}' "$container" 2>/dev/null || echo "?")
  if [ "$code" != "0" ]; then
    echo "Erreur : $container a échoué (exit $code) - voir 'docker logs $container'." >&2
    exit 1
  fi
done

if [[ -n "$DUMP_DIR" ]]; then
  echo "==> Import des données depuis $DUMP_DIR"
  ./bin/platon-db/import.sh "$DUMP_DIR"
fi

if [ "$prod" = true ]; then
  cat <<EOF

==> Terminé. API/frontend démarrés en conteneurs - accessible sur le port INDICATEURS_PORT (voir .env, défaut 4300).
EOF
else
  cat <<EOF

==> Terminé. Prochaines étapes :
  cd api && yarn install && yarn start:dev
  cd frontend && yarn install && yarn start
EOF
fi
