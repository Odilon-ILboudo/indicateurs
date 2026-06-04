// api/src/modules/core/database/indicators.datasource.ts
import { ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';

export const indicatorsDataSource = (configService: ConfigService): DataSourceOptions => ({
  type: 'postgres',
  name: 'indicators',
  host: configService.get('indicatorsDatabase.host'),
  port: configService.get('indicatorsDatabase.port'),
  username: configService.get('indicatorsDatabase.username'),
  password: configService.get('indicatorsDatabase.password'),
  database: configService.get('indicatorsDatabase.database'),
  synchronize: configService.get('indicatorsDatabase.synchronize'),
  logging: configService.get('indicatorsDatabase.logging'),
  entities: [__dirname + '/../../../**/*.entity{.ts,.js}'],
});