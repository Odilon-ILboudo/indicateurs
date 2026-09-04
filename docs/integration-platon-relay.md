# Relais d'événements : ce qu'il faut ajouter côté PLaTon

Ce document décrit ce que l'équipe PLaTon doit ajouter à son propre dépôt pour
relayer les événements pédagogiques vers Indicateurs. Rien de ce qui suit ne
peut être fait depuis le dépôt Indicateurs seul - ce sont des modifications du
code de PLaTon, qui appartiennent à son équipe.

## Principe

```
PostgreSQL (BDD PLaTon)
   │ déclencheur installé depuis l'administration Indicateurs
   ▼
platon_outbox_events                  (table côté PLaTon)
   │ OutboxRelayService.relay(), toutes les 2 secondes
   ▼
RabbitMQ (hébergé par Indicateurs) - exchange "platon.events"
   │
   ▼
Indicateurs (classification + calcul des indicateurs)
```

Le relais republie chaque ligne de `platon_outbox_events` **telle quelle**,
sans l'interpréter - il ne sait pas, et n'a pas besoin de savoir, à quel
indicateur ou quel événement métier ("exercice.completed", etc.) une ligne
correspond. Cette interprétation (classification) se fait côté Indicateurs,
seul à connaître les règles configurées par son administration
(`IndicatorEventRule`) - déplacer le relais ne change rien à cette table,
qui continue de vivre dans la base Indicateurs.

## Ce que PLaTon doit ajouter

### 1. Deux tables sur sa propre base de données

- `platon_outbox_events` : déjà créée par le script
  `api/scripts/migrations/platon-outbox.sql` du dépôt Indicateurs (à exécuter
  une fois sur la BDD PLaTon, sans changement lié à ce document).
- `indicateurs_outbox_cursor` : nouvelle table, à créer via
  [`outbox-cursor.sql`](./platon-integration/outbox-cursor.sql) (ce dossier) -
  une seule ligne, suit la position déjà relayée.

### 2. Le service de relais

[`outbox-relay.service.ts`](./platon-integration/outbox-relay.service.ts) et
[`outbox-relay.module.ts`](./platon-integration/outbox-relay.module.ts) - à
copier dans le dépôt PLaTon (emplacement au choix de l'équipe, ex. un module
`outbox-relay/` à côté des autres modules de `apps/api/src/`), puis adapter :

- L'injection de la base de données (`@InjectDataSource()`) : utiliser la
  connexion réelle du projet PLaTon si elle est nommée autrement.
- La lecture de l'URI RabbitMQ (`INDICATEURS_RABBITMQ_URI` dans l'exemple du
  module) : adapter à la convention de configuration réelle de PLaTon.
- Importer `OutboxRelayModule` dans le module racine (`AppModule` ou
  équivalent).

### 3. Dépendances npm à ajouter

```bash
yarn add @nestjs/schedule @golevelup/nestjs-rabbitmq
```

`@nestjs/schedule` est déjà présent dans `package.json` de PLaTon - seul
`@golevelup/nestjs-rabbitmq` (même librairie que côté Indicateurs, pour
rester cohérent) est réellement nouveau.

### 4. Accès réseau à RabbitMQ

**Point à trancher avec l'équipe Indicateurs avant de déployer en prod** :
RabbitMQ est hébergé par Indicateurs (`indicateurs_rabbitmq`, voir
`docker-compose.*.yml` côté Indicateurs) - PLaTon doit pouvoir l'atteindre en
réseau (host, port, identifiants) depuis son propre serveur. En local (les
deux projets sur le même réseau Docker partagé), ça fonctionne déjà tel
quel ; en production, ça suppose soit un réseau partagé équivalent, soit
d'exposer RabbitMQ publiquement avec des identifiants dédiés au relais - pas
encore décidé (même statut que l'hébergement du widget embarqué, voir
`integration-platon.md`).

## Ce qu'Indicateurs fournit de son côté (pour information, pas à faire par PLaTon)

- L'exchange `platon.events` (topic) et les deux consumers qui y sont
  déjà abonnés (`indicators.learner`, `indicators.aggregate`) - inchangés,
  peu importe qui publie dessus.
- La classification des événements génériques (`IndicatorEventRule`,
  administration Indicateurs) - faite dans les consumers, pour ne jamais
  dépendre d'une lecture de la base Indicateurs depuis PLaTon.
- La purge des événements de plus de 7 jours dans `platon_outbox_events`
  (`OutboxMaintenanceService`, cron quotidien côté Indicateurs, connexion en
  écriture déjà existante pour l'installation des déclencheurs) - PLaTon n'a
  rien à faire pour ça.

## Validé de ce côté (Indicateurs)

Testé en conditions réelles : un événement générique publié manuellement sur
l'exchange `platon.events` (simulant exactement ce que ce relais publierait)
est bien classifié par les deux consumers et déclenche un calcul d'indicateur
réel, valeurs à jour en base. Le relais lui-même, tel que décrit ici,
**n'a pas encore tourné dans le vrai dépôt PLaTon** - à valider par leur
équipe une fois copié et adapté.
