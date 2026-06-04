// src/aggregation/aggregation.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AggregationService } from './aggregation.service';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { IndicatorValue } from '../indicators/entities/indicator-value.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature(
      [IndicatorDefinition, IndicatorValue],
      'indicators',  //  Nom de la connexion
    ),
  ],
  providers: [AggregationService],
  exports: [AggregationService],
})
export class AggregationModule {}