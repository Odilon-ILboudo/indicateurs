// src/indicators/indicators.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { IndicatorsController } from './indicators.controller';
import { IndicatorsService } from './indicators.service';
import { FormulaInterpreterService } from './interpreter/formula-interpreter.service';
import { IndicatorDefinition } from './entities/indicator-definition.entity';
import { IndicatorValue } from './entities/indicator-value.entity';
import { IndicatorExecutionLog } from './entities/indicator-execution-log.entity';
import { IndicatorSnapshot } from './entities/indicator-snapshot.entity';
import { IndicatorFeedback } from './entities/indicator-feedback.entity';
import { IndicatorNotification } from './entities/indicator-notification.entity';
import { UserIndicatorPreference } from '../user-preferences/entities/user-indicator-preference.entity';
import { IndicatorPin } from '../indicator-pins/indicator-pin.entity';
import { IndicatorPinsService } from '../indicator-pins/indicator-pins.service';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [IndicatorDefinition, IndicatorValue, IndicatorExecutionLog, IndicatorSnapshot, IndicatorFeedback, IndicatorNotification, UserIndicatorPreference, IndicatorPin],
      'indicators',
    ),
    EventEmitterModule.forRoot(),
  ],
  controllers: [IndicatorsController],
  providers: [
    IndicatorsService,
    FormulaInterpreterService,
    IndicatorPinsService,
  ],
  exports: [
    IndicatorsService,
    FormulaInterpreterService,
  ],
})
export class IndicatorsModule {}
