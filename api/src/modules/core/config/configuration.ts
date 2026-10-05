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

  /* Identifiants Postgres à privilèges élevés, utilisés uniquement pour le DDL d'installation de trigger (event-rules). */
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
    /* Toujours false : schéma géré par de vraies migrations TypeORM, jamais par l'auto-sync, y compris en dev. */
    synchronize: false,
    logging: false,
    entities: [__dirname + '/../indicators/entities/*.entity{.ts,.js}'],
  },

  jwtSecret: process.env.JWT_SECRET || 'secret',

  aggregation: {
    /* Fréquence du recalcul périodique des indicateurs sans déclencheur (expression cron, défaut toutes les minutes). */
    triggerlessRecalcCron: process.env.TRIGGERLESS_RECALC_CRON || '*/1 * * * *',
  },

  rabbitmq: {
    uri: process.env.RABBITMQ_URI || 'amqp://guest:guest@localhost:5672',
  },
});