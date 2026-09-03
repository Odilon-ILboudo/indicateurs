# ─── Build stage ────────────────────────────────────────────────────────────
FROM node:20-bullseye-slim AS builder

# Outils requis pour compiler les addons natifs (isolated-vm, argon2, bcrypt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY api/package.json api/yarn.lock ./
RUN yarn install --frozen-lockfile

COPY api/ .
RUN yarn build

# ─── Production stage ────────────────────────────────────────────────────────
FROM node:20-bullseye-slim AS production
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
# src/ + tsconfig.json : nécessaires pour lancer les migrations TypeORM via
# ts-node (yarn migration:run, cf. le service "migrate" de docker-compose.prod.yml)
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

EXPOSE 3001
CMD ["node", "dist/main"]
