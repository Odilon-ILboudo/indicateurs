#!/bin/bash -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/../.."

# PLATON_NETWORK_NAME : source de vérité = .env (voir .env.example). Ce n'est
# qu'un filet de sécurité si la variable n'y est pas renseignée - on ne l'exporte
# donc que si elle n'est ni dans le shell, ni dans .env (une variable shell
# exportée ici serait sinon prioritaire sur .env pour l'interpolation Compose).
# Détection : PLaTon ne fixe pas de `name:` sous networks: dans son propre
# docker-compose, donc le réseau qu'il crée est préfixé par le nom de son projet
# (ex: "platon_platon-network"). On ne modifie jamais les fichiers PLaTon.
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
