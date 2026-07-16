// src/config/configuration.ts
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

  // Identifiants Postgres à privilèges élevés sur PLaTon (superuser, ou propriétaire des
  // tables concernées), utilisés UNIQUEMENT pour exécuter le DDL d'installation d'un trigger
  // généré depuis l'admin (event-rules) - jamais pour autre chose, jamais de modification
  // d'ownership. Optionnel : si absent, l'installation tente la connexion applicative
  // habituelle (échoue avec le message d'erreur habituel si les droits manquent).
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
    // Toujours false : le schéma est géré par de vraies migrations TypeORM
    // (voir bin/migration/*.sh), jamais par l'auto-sync - y compris en dev,
    // pour ne jamais laisser le schéma dériver sans migration correspondante.
    synchronize: false,
    logging: false,
    entities: [__dirname + '/../indicators/entities/*.entity{.ts,.js}'],
  },

  jwtSecret: process.env.JWT_SECRET || 'secret',

  targetActivityId: process.env.TARGET_ACTIVITY_ID,

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  aggregation: {
    dailyHour: parseInt(process.env.DAILY_AGGREGATION_HOUR || '1', 10),
    weeklyDayOfWeek: parseInt(process.env.WEEKLY_AGGREGATION_DAY || '1', 10),
  },

  rabbitmq: {
    uri: process.env.RABBITMQ_URI || 'amqp://guest:guest@localhost:5672',
  },
});