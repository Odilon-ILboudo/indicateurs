import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndicatorEventRule } from './indicator-event-rule.entity';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { EventRulesService } from './event-rules.service';
import { EventRulesController } from './event-rules.controller';
import { EventClassifierService } from './event-classifier.service';
import { EventTypesModule } from '../event-types/event-types.module';
import { PlatonModule } from '../../core/platon/platon.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IndicatorEventRule, IndicatorDefinition], 'indicators'),
    EventTypesModule,
    PlatonModule,
  ],
  controllers: [EventRulesController],
  providers: [EventRulesService, EventClassifierService],
  exports: [EventRulesService, EventClassifierService],
})
export class EventRulesModule {}
