#!/bin/bash -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/../.."

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
