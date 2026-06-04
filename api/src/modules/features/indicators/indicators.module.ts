// src/indicators/indicators.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { IndicatorsController } from './indicators.controller';
import { IndicatorsService } from './indicators.service';
import { AttemptsCalculatorService } from './calculators/attempts-calculator.service';
import { FormulaInterpreterService } from './interpreter/formula-interpreter.service';
import { IndicatorDefinition } from './entities/indicator-definition.entity';
import { IndicatorValue } from './entities/indicator-value.entity';
import { IndicatorFormulaVersion } from './entities/indicator-formula-version.entity';
import { IndicatorExecutionLog } from './entities/indicator-execution-log.entity';
import { UserIndicatorPreference } from '../user-preferences/entities/user-indicator-preference.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [IndicatorDefinition, IndicatorValue, IndicatorFormulaVersion, IndicatorExecutionLog, UserIndicatorPreference],
      'indicators',
    ),
    EventEmitterModule.forRoot(),
  ],
  controllers: [IndicatorsController],
  providers: [
    IndicatorsService,
    AttemptsCalculatorService,
    FormulaInterpreterService,
  ],
  exports: [
    IndicatorsService,
    AttemptsCalculatorService,
    FormulaInterpreterService,
  ],
})
export class IndicatorsModule {}
