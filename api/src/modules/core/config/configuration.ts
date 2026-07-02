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

  // Base de données Indicateurs (lecture/écriture)
  indicatorsDatabase: {
    type: 'postgres' as const,
    host: process.env.INDICATORS_DB_HOST,
    port: parseInt(process.env.INDICATORS_DB_PORT || '5432', 10),
    username: process.env.INDICATORS_DB_USERNAME,
    password: process.env.INDICATORS_DB_PASSWORD,
    database: process.env.INDICATORS_DB_NAME,
    synchronize: process.env.NODE_ENV !== 'production',
    //logging: process.env.NODE_ENV !== 'production',
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