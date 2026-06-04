// src/ingestion/ingestion.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { IndicatorValue } from '../indicators/entities/indicator-value.entity';
import { IndicatorsModule } from '../indicators/indicators.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [IndicatorDefinition, IndicatorValue],
      'indicators',
    ),
    EventEmitterModule.forRoot(),
    IndicatorsModule,
  ],
  controllers: [IngestionController],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}