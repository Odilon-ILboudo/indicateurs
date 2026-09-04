/*
DataSource utilisé uniquement par le CLI TypeORM (migration:generate/run/revert),
via ts-node - jamais importé par l'application NestJS elle-même (voir core.module.ts
pour la connexion 'indicators' réellement utilisée à l'exécution).
*/
import 'dotenv/config'
import { DataSource } from 'typeorm'

export default new DataSource({
  type: 'postgres',
  host: process.env.INDICATORS_DB_HOST,
  port: parseInt(process.env.INDICATORS_DB_PORT || '5432', 10),
  username: process.env.INDICATORS_DB_USERNAME,
  password: process.env.INDICATORS_DB_PASSWORD,
  database: process.env.INDICATORS_DB_NAME,
  synchronize: false,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',
})
