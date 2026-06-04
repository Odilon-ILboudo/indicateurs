// src/modules/features/user-preferences/user-preferences.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UserPreferencesService } from './user-preferences.service';

@Controller('preferences')  // ← Préfixe unique, pas dans /indicators
export class UserPreferencesController {
  constructor(private readonly preferencesService: UserPreferencesService) {}

  @Get()
  async getUserPreferences(@Query('userId') userId: string) {
    return this.preferencesService.getUserPreferences(userId);
  }

  @Get(':indicatorId')
  async getUserPreference(
    @Query('userId') userId: string,
    @Param('indicatorId') indicatorId: string,
  ) {
    return this.preferencesService.getUserPreference(userId, indicatorId);
  }

  @Post(':indicatorId')
  async createPreference(
    @Query('userId') userId: string,
    @Param('indicatorId') indicatorId: string,
    @Body() body: { isVisible?: boolean; displayPreferences?: { icon?: string; color?: string }; userRole?: string },
  ) {
    return this.preferencesService.createPreference(userId, indicatorId, body);
  }

  @Patch(':indicatorId')
  async updatePreference(
    @Query('userId') userId: string,
    @Param('indicatorId') indicatorId: string,
    @Body() body: { isVisible?: boolean; displayPreferences?: { icon?: string; color?: string }; userRole?: string },
  ) {
    return this.preferencesService.updatePreference(userId, indicatorId, body);
  }

  @Delete(':indicatorId')
  async deletePreference(
    @Query('userId') userId: string,
    @Param('indicatorId') indicatorId: string,
  ) {
    await this.preferencesService.deletePreference(userId, indicatorId);
    return { success: true };
  }
}