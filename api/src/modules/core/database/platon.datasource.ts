import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

export const platonDataSource = async (configService: ConfigService): Promise<DataSource> => {
  const dataSource = new DataSource({
    type: 'postgres',
    host: configService.get('platonDatabase.host'),
    port: configService.get('platonDatabase.port'),
    username: configService.get('platonDatabase.username'),
    password: configService.get('platonDatabase.password'),
    database: configService.get('platonDatabase.database'),
    synchronize: false,
    logging: false,
  });
  await dataSource.initialize();
  console.log(' PLaTon database connected');
  return dataSource;
};