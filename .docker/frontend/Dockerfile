# Build stage
FROM node:20-alpine AS builder

WORKDIR /app
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile

COPY frontend/ .
# App standalone (admin) et widget embarqué (voir docs/integration-platon.md) : deux cibles
# du même projet Angular, construites l'une après l'autre pour réutiliser ce même node_modules.
RUN yarn ng build indicateurs --configuration production
RUN yarn ng build indicateurs-embed --configuration production

# Nginx stage
FROM nginx:1.25-alpine

# Angular 17+ place les fichiers statiques dans browser/
COPY --from=builder /app/dist/indicateurs/browser /usr/share/nginx/html
COPY --from=builder /app/dist/indicateurs-embed/browser /usr/share/nginx/html/embed
COPY .docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
