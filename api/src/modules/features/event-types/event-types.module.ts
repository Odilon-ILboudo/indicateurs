import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndicatorEventType } from './event-type.entity';
import { EventTypesService } from './event-types.service';
import { EventTypesController } from './event-types.controller';

@Module({
  imports: [TypeOrmModule.forFeature([IndicatorEventType], 'indicators')],
  controllers: [EventTypesController],
  providers: [EventTypesService],
  exports: [EventTypesService],
})
export class EventTypesModule {}
