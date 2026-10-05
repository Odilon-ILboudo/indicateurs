#!/bin/bash -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/../.."

# PLATON_NETWORK_NAME : source de vérité = .env - filet de sécurité seulement si absente du shell/.env (détection auto sinon).
if [ -z "$PLATON_NETWORK_NAME" ] && ! grep -qE '^PLATON_NETWORK_NAME=.+' .env 2>/dev/null; then
  detected="$(docker network ls --format '{{.Name}}' | grep -E '(^|_)platon-network$' | head -n 1)"
  if [ -n "$detected" ]; then
    export PLATON_NETWORK_NAME="$detected"
  else
    echo "Attention : réseau Docker partagé avec PLaTon introuvable (aucun réseau ne correspond à *_platon-network)." >&2
    echo "Vérifie que PLaTon tourne, ou renseigne PLATON_NETWORK_NAME dans .env. Repli sur 'platon_platon-network'." >&2
  fi
fi

prod=false
detach=''

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--prod) prod=true ;;
    -d)        detach='-d' ;;
  esac
  shift
done

if [ "$prod" = true ]; then
  docker compose -f docker-compose.prod.yml build
  docker compose -f docker-compose.prod.yml up $detach
else
  docker compose -f docker-compose.dev.yml build --pull=false
  docker compose -f docker-compose.dev.yml up $detach
fi
