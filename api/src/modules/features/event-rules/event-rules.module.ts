import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndicatorEventRule } from './indicator-event-rule.entity';
import { EventRulesService } from './event-rules.service';
import { EventRulesController } from './event-rules.controller';
import { EventTypesModule } from '../event-types/event-types.module';
import { PlatonModule } from '../../core/platon/platon.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IndicatorEventRule], 'indicators'),
    EventTypesModule,
    PlatonModule,
  ],
  controllers: [EventRulesController],
  providers: [EventRulesService],
  exports: [EventRulesService],
})
export class EventRulesModule {}
