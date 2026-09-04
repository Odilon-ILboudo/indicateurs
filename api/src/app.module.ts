import { Module } from '@nestjs/common';
import { CoreModule } from './modules/core/core.module';
import { IndicatorsModule } from './modules/features/indicators/indicators.module';
import { IngestionModule } from './modules/features/ingestion/ingestion.module';
import { OutboxMaintenanceModule } from './modules/features/outbox-maintenance/outbox-maintenance.module';
import { AggregationModule } from './modules/features/aggregation/aggregation.module';
import { UsersModule } from './modules/features/users/users.module';
import { UserPreferencesModule } from './modules/features/user-preferences/user-preferences.module';
import { CoursesModule } from './modules/features/courses/courses.module';
import { ResourcesModule } from './modules/features/resources/resources.module';
import { EventTypesModule } from './modules/features/event-types/event-types.module';
import { EventRulesModule } from './modules/features/event-rules/event-rules.module';

@Module({
  imports: [
    CoreModule,
    IndicatorsModule,
    UserPreferencesModule,
    IngestionModule,
    OutboxMaintenanceModule,
    AggregationModule,
    UsersModule,
    CoursesModule,
    ResourcesModule,
    EventTypesModule,
    EventRulesModule,
  ],
})
export class AppModule {}