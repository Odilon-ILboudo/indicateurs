import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../../core/database/database.module';
import { OutboxMaintenanceService } from './outbox-maintenance.service';

@Module({
  imports: [
    DatabaseModule,
    ScheduleModule.forRoot(),
  ],
  providers: [OutboxMaintenanceService],
  exports: [OutboxMaintenanceService],
})
export class OutboxMaintenanceModule {}
