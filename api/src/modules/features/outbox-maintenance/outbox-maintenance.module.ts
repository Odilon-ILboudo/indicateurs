import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PlatonModule } from '../../core/platon/platon.module';
import { OutboxMaintenanceService } from './outbox-maintenance.service';

@Module({
  imports: [
    PlatonModule,
    ScheduleModule.forRoot(),
  ],
  providers: [OutboxMaintenanceService],
  exports: [OutboxMaintenanceService],
})
export class OutboxMaintenanceModule {}
