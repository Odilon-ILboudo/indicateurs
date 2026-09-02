import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { IndicatorValue } from '../indicators/entities/indicator-value.entity';
import { IndicatorExecutionLog } from '../indicators/entities/indicator-execution-log.entity';
import { UserPreferencesService } from './user-preferences.service';
import { UserPreferencesController } from './user-preferences.controller';
import { UserIndicatorPreference } from './entities/user-indicator-preference.entity';
import { FormulaInterpreterService } from '../indicators/interpreter/formula-interpreter.service';
import { PlatonModule } from '../../core/platon/platon.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [UserIndicatorPreference, IndicatorDefinition, IndicatorValue, IndicatorExecutionLog],
      'indicators',
    ),
    PlatonModule,
  ],
  controllers: [UserPreferencesController],
  providers: [UserPreferencesService, FormulaInterpreterService],
  exports: [UserPreferencesService],
})
export class UserPreferencesModule {}
