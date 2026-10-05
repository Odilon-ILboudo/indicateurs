#!/bin/bash
cd "$(dirname "$0")"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use
export NX_DAEMON=false
export NODE_OPTIONS="--max-old-space-size=4048"
yarn serve:web
