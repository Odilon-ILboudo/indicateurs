import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { OutboxRelayService, PLATON_EXCHANGE } from './outbox-relay.service';

// À importer dans le module racine de l'application (ex. AppModule), une seule fois.
// Adapter la lecture de l'URI RabbitMQ (INDICATEURS_RABBITMQ_URI) à la convention de
// configuration réelle de ce projet (ConfigService ici, à titre d'exemple).
@Module({
  imports: [
    ScheduleModule.forRoot(),
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('INDICATEURS_RABBITMQ_URI')!,
        exchanges: [
          { name: PLATON_EXCHANGE, type: 'topic' },
        ],
        // Ce relais ne fait que publier - pas de queue à déclarer ici.
        connectionInitOptions: { wait: false, reject: false, timeout: 5000 },
      }),
    }),
  ],
  providers: [OutboxRelayService],
})
export class OutboxRelayModule {}
