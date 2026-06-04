// src/app.module.ts
import { Module } from '@nestjs/common';
import { CoreModule } from './modules/core/core.module';
import { IndicatorsModule } from './modules/features/indicators/indicators.module';
import { ActivityIndicatorModule } from './modules/features/activity-indicator/activity-indicator.module';
import { IngestionModule } from './modules/features/ingestion/ingestion.module';
import { AggregationModule } from './modules/features/aggregation/aggregation.module';
import { UsersModule } from './modules/features/users/users.module';
import { UserPreferencesModule } from './modules/features/user-preferences/user-preferences.module';
import { GroupsModule } from './modules/features/groups/groups.module';


@Module({
  imports: [
    CoreModule,
    IndicatorsModule,
    UserPreferencesModule,
    ActivityIndicatorModule,
    IngestionModule,
    AggregationModule,
    UsersModule,
    GroupsModule,
  ],
})
export class AppModule {}