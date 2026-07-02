import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { IngestionService } from './ingestion.service';
import { IngestionConsumerService, QUEUE_LEARNER, QUEUE_AGGREGATE } from './ingestion-consumer.service';
import { IngestionController } from './ingestion.controller';
import { IndicatorsGateway } from './indicators.gateway';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { IndicatorValue } from '../indicators/entities/indicator-value.entity';
import { IndicatorsModule } from '../indicators/indicators.module';
import { PLATON_EXCHANGE } from '../ingestion-relay/ingestion-relay.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([IndicatorDefinition, IndicatorValue], 'indicators'),
    EventEmitterModule.forRoot(),
    IndicatorsModule,
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('rabbitmq.uri')!,
        exchanges: [
          { name: PLATON_EXCHANGE, type: 'topic' },
        ],
        queues: [
          {
            name: QUEUE_LEARNER,
            options: { durable: true },
            exchange: PLATON_EXCHANGE,
            routingKey: '#',
          },
          {
            name: QUEUE_AGGREGATE,
            options: { durable: true },
            exchange: PLATON_EXCHANGE,
            routingKey: '#',
          },
        ],
        connectionInitOptions: { wait: false, reject: false, timeout: 5000 },
      }),
    }),
  ],
  controllers: [IngestionController],
  providers: [IngestionService, IngestionConsumerService, IndicatorsGateway],
  exports: [IngestionService],
})
export class IngestionModule {}
