export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),

  // Base de données PLaTon (lecture seule)
  platonDatabase: {
    type: 'postgres' as const,
    host: process.env.PLATON_DB_HOST,
    port: parseInt(process.env.PLATON_DB_PORT || '5432', 10),
    username: process.env.PLATON_DB_USERNAME,
    password: process.env.PLATON_DB_PASSWORD,
    database: process.env.PLATON_DB_NAME,
    synchronize: false,
    logging: false,
  },

  /*
  Identifiants Postgres à privilèges élevés sur PLaTon, utilisés uniquement pour le DDL
  d'installation d'un trigger (event-rules) : CREATE/DROP TRIGGER exige d'être propriétaire
  de la table, ce que le compte applicatif habituel (PLATON_DB_USERNAME) n'est pas. Les deux
  variables doivent être renseignées ensemble - sans elles, l'installation retombe sur la
  connexion applicative habituelle et échoue le plus souvent, faute de droits suffisants.
  */
  platonDatabaseAdmin: {
    username: process.env.PLATON_DB_ADMIN_USERNAME || null,
    password: process.env.PLATON_DB_ADMIN_PASSWORD || null,
  },

  // Base de données Indicateurs (lecture/écriture)
  indicatorsDatabase: {
    type: 'postgres' as const,
    host: process.env.INDICATORS_DB_HOST,
    port: parseInt(process.env.INDICATORS_DB_PORT || '5432', 10),
    username: process.env.INDICATORS_DB_USERNAME,
    password: process.env.INDICATORS_DB_PASSWORD,
    database: process.env.INDICATORS_DB_NAME,
    /* Toujours false : le schéma est géré par de vraies migrations TypeORM
    (voir bin/migration/*.sh), jamais par l'auto-sync - y compris en dev,
    pour ne jamais laisser le schéma dériver sans migration correspondante.*/
    synchronize: false,
    logging: false,
    entities: [__dirname + '/../indicators/entities/*.entity{.ts,.js}'],
  },

  jwtSecret: process.env.JWT_SECRET || 'secret',

  aggregation: {
    /*
    Fréquence du recalcul périodique des indicateurs actifs sans déclencheur (voir
    AggregationService.recalculateTriggerlessIndicators) - expression cron standard.
    Défaut : toutes les minutes.
    */
    triggerlessRecalcCron: process.env.TRIGGERLESS_RECALC_CRON || '*/1 * * * *',
  },

  rabbitmq: {
    uri: process.env.RABBITMQ_URI || 'amqp://guest:guest@localhost:5672',
  },
});