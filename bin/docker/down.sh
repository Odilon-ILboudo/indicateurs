#!/bin/bash -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/../.."

# Voir up.sh pour l'explication (source de vérité = .env, ceci n'est qu'un filet).
if [ -z "$PLATON_NETWORK_NAME" ] && ! grep -qE '^PLATON_NETWORK_NAME=.+' .env 2>/dev/null; then
  detected="$(docker network ls --format '{{.Name}}' | grep -E '(^|_)platon-network$' | head -n 1)"
  [ -n "$detected" ] && export PLATON_NETWORK_NAME="$detected"
fi

docker compose -f docker-compose.prod.yml down
