// src/modules/features/activity-indicator/activity-indicator.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityIndicatorController } from './activity-indicator.controller';
import { ActivityIndicatorService } from './activity-indicator.service';
import { IndicatorsModule } from '../indicators/indicators.module';
import { PlatonModule } from '../../core/platon/platon.module';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { IndicatorValue } from '../indicators/entities/indicator-value.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([IndicatorDefinition, IndicatorValue], 'indicators'),
    IndicatorsModule,
    PlatonModule,
  ],
  controllers: [ActivityIndicatorController],
  providers: [ActivityIndicatorService],
  exports: [ActivityIndicatorService],
})
export class ActivityIndicatorModule {}