// src/app.module.ts
import { Module } from '@nestjs/common';
import { CoreModule } from './modules/core/core.module';
import { IndicatorsModule } from './modules/features/indicators/indicators.module';
import { IngestionModule } from './modules/features/ingestion/ingestion.module';
import { AggregationModule } from './modules/features/aggregation/aggregation.module';
import { UsersModule } from './modules/features/users/users.module';
import { UserPreferencesModule } from './modules/features/user-preferences/user-preferences.module';
import { CoursesModule } from './modules/features/courses/courses.module';
import { ResourcesModule } from './modules/features/resources/resources.module';


@Module({
  imports: [
    CoreModule,
    IndicatorsModule,
    UserPreferencesModule,
    IngestionModule,
    AggregationModule,
    UsersModule,
    CoursesModule,
    ResourcesModule,
  ],
})
export class AppModule {}