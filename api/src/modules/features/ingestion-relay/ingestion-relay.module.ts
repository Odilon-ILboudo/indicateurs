import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { DatabaseModule } from '../../core/database/database.module';
import { IngestionRelayService, PLATON_EXCHANGE } from './ingestion-relay.service';
import { IngestionCursor } from '../ingestion/entities/ingestion-cursor.entity';
import { IndicatorEventRule } from '../event-rules/indicator-event-rule.entity';

@Module({
  imports: [
    DatabaseModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([IngestionCursor, IndicatorEventRule], 'indicators'),
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('rabbitmq.uri')!,
        exchanges: [
          { name: PLATON_EXCHANGE, type: 'topic' },
        ],
        // Le relay n'a pas de queues - il publie seulement
        connectionInitOptions: { wait: false, reject: false, timeout: 5000 },
      }),
    }),
  ],
  providers: [IngestionRelayService],
  exports: [IngestionRelayService],
})
export class IngestionRelayModule {}
