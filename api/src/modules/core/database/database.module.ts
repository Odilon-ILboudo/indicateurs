// src/modules/core/database/database.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { platonDataSource } from './platon.datasource';

@Global()
@Module({
  providers: [
    {
      provide: 'PLATON_DATA_SOURCE',
      useFactory: async (configService: ConfigService) => {
        return platonDataSource(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: ['PLATON_DATA_SOURCE'],
})
export class DatabaseModule {}