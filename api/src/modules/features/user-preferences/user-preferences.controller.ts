// src/modules/features/user-preferences/user-preferences.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { UserPreferencesService } from './user-preferences.service';
import { AuthGuard, AuthenticatedUser } from '../../core/auth/auth.guard';
import { IndicatorVisibilityGuard } from '../../core/guards/indicator-visibility.guard';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Controller('preferences')  // ← Préfixe unique, pas dans /indicators
@UseGuards(AuthGuard)
export class UserPreferencesController {
  constructor(private readonly preferencesService: UserPreferencesService) {}

  @Get()
  async getUserPreferences(@Req() request: AuthenticatedRequest) {
    return this.preferencesService.getUserPreferences(request.user!.id);
  }

  @Get(':indicatorId')
  async getUserPreference(
    @Req() request: AuthenticatedRequest,
    @Param('indicatorId') indicatorId: string,
  ) {
    return this.preferencesService.getUserPreference(request.user!.id, indicatorId);
  }

  @Post(':indicatorId')
  @UseGuards(IndicatorVisibilityGuard)
  async createPreference(
    @Req() request: AuthenticatedRequest,
    @Param('indicatorId') indicatorId: string,
    @Body() body: { isVisible?: boolean; displayPreferences?: { icon?: string; color?: string }; userRole?: string; activeVizId?: string; enabledVizIds?: string[] | null },
  ) {
    return this.preferencesService.createPreference(request.user!.id, indicatorId, body);
  }

  @Patch(':indicatorId')
  @UseGuards(IndicatorVisibilityGuard)
  async updatePreference(
    @Req() request: AuthenticatedRequest,
    @Param('indicatorId') indicatorId: string,
    @Body() body: { isVisible?: boolean; displayPreferences?: { icon?: string; color?: string }; userRole?: string; activeVizId?: string; enabledVizIds?: string[] | null },
  ) {
    return this.preferencesService.updatePreference(request.user!.id, indicatorId, body);
  }

  @Delete(':indicatorId')
  async deletePreference(
    @Req() request: AuthenticatedRequest,
    @Param('indicatorId') indicatorId: string,
  ) {
    await this.preferencesService.deletePreference(request.user!.id, indicatorId);
    return { success: true };
  }
}
