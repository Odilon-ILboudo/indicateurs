// src/modules/core/core.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatonModule } from './platon/platon.module';
import { AuthModule } from './auth/auth.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';

@Global()
@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    
    // Base de données Indicateurs (connexion nommée)
    TypeOrmModule.forRootAsync({
      name: 'indicators',
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('indicatorsDatabase.host'),
        port: configService.get('indicatorsDatabase.port'),
        username: configService.get('indicatorsDatabase.username'),
        password: configService.get('indicatorsDatabase.password'),
        database: configService.get('indicatorsDatabase.database'),
        synchronize: configService.get('indicatorsDatabase.synchronize'),
        // Les migrations sont lancées par un service Docker dédié (voir
        // docker-compose.prod.yml, service "migrate"), jamais par l'app elle-même.
        migrationsRun: false,
        logging: configService.get('indicatorsDatabase.logging'),
        entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
        autoLoadEntities: true,
        name: 'indicators',
      }),
      inject: [ConfigService],
    }),
    
    DatabaseModule,
    PlatonModule,
    AuthModule,
  ],
  exports: [DatabaseModule, PlatonModule, AuthModule],
})
export class CoreModule {}