// src/platon/platon.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { PlatonService } from './platon.service';

@Global()
@Module({
  providers: [
    {
      provide: 'PLATON_DATA_SOURCE',
      useFactory: async (configService: ConfigService) => {
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
        console.log('PLaTon database connected');
        return dataSource;
      },
      inject: [ConfigService],
    },
    PlatonService,
  ],
  exports: ['PLATON_DATA_SOURCE', PlatonService],
})
export class PlatonModule {}