#!/bin/bash -e

# Génère api/.env à partir du .env racine - une seule source de vérité pour
# les identifiants partagés entre les deux fichiers (voir
# docs/platon-local-setup.md). api/.env sert au mode natif (yarn start:dev,
# hors Docker) : les noms de conteneurs Docker (platon_postgres,
# indicateurs_rabbitmq...) n'y résolvent à rien, remplacés ici par
# "localhost".
#
# Usage : ./bin/generate-api-env.sh   (écrase api/.env, pas de fusion)

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/.."

if [[ ! -f .env ]]; then
  echo "Erreur : .env introuvable à la racine. Copier .env.example d'abord." >&2
  exit 1
fi

# Charge les variables du .env racine dans ce script (set -a : exportées
# seulement le temps du script, pas de pollution de l'environnement appelant).
set -a
source .env
set +a

OUT=api/.env

cat > "$OUT" <<EOF
# Généré par bin/generate-api-env.sh depuis le .env racine - ne pas éditer à la main.

# BASE DE DONNEES PLATON (lecture seule)
PLATON_DB_HOST=localhost
PLATON_DB_PORT=${PLATON_DB_PORT}
PLATON_DB_USERNAME=${PLATON_DB_USERNAME}
PLATON_DB_PASSWORD=${PLATON_DB_PASSWORD}
PLATON_DB_NAME=${PLATON_DB_NAME}
EOF

if [[ -n "$PLATON_DB_ADMIN_USERNAME" ]]; then
  cat >> "$OUT" <<EOF

# Identifiant à privilèges élevés, pour installer/désinstaller les triggers (Événements & déclencheurs).
PLATON_DB_ADMIN_USERNAME=${PLATON_DB_ADMIN_USERNAME}
PLATON_DB_ADMIN_PASSWORD=${PLATON_DB_ADMIN_PASSWORD}
EOF
fi

cat >> "$OUT" <<EOF

# BASE DE DONNEES INDICATEURS (lecture/écriture)
INDICATORS_DB_HOST=localhost
INDICATORS_DB_PORT=${INDICATORS_DB_PORT}
INDICATORS_DB_USERNAME=${INDICATORS_DB_USERNAME}
INDICATORS_DB_PASSWORD=${INDICATORS_DB_PASSWORD}
INDICATORS_DB_NAME=${INDICATORS_DB_NAME}

# AUTRES VARIABLES
NODE_ENV=${NODE_ENV}
PORT=${PORT}

# Fréquence du recalcul périodique (cron) ; défaut toutes les minutes.
# TRIGGERLESS_RECALC_CRON=*/10 * * * * *

# JWT (même secret que platon/.env SECRET_KEY)
JWT_SECRET=${JWT_SECRET}

# RabbitMQ (host localhost car natif)
RABBITMQ_URI=amqp://${RABBITMQ_USER:-indicateurs}:${RABBITMQ_PASSWORD}@localhost:5672
EOF

echo "api/.env régénéré depuis .env (racine)."
