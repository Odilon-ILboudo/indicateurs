// src/modules/features/activity-indicator/activity-indicator.controller.ts
import { Controller, Get, Query, Post, Param, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ActivityIndicatorService } from './activity-indicator.service';
import { IndicatorsService } from '../indicators/indicators.service';

@Controller('indicators/activity-attempts')
export class ActivityIndicatorController {
  //  Utilisation du name unique (pas d'ID en dur)
  private readonly INDICATOR_NAME = 'attempts_before_first_success_activity';
  private readonly logger = new Logger(ActivityIndicatorService.name);

  constructor(
    private readonly activityIndicatorService: ActivityIndicatorService,
    private readonly indicatorsService: IndicatorsService,
  ) {}

  /**
   * Récupère la valeur de l'indicateur pour un utilisateur sur une activité
   * GET /indicators/activity-attempts/value?userId=xxx&activityId=xxx
   */
  @Get('value')
  async getIndicatorValue(
    @Query('userId') userId: string,
    @Query('activityId') activityId: string,
    @Query('indicatorId') indicatorId: string, 
  ) {
    
    if (!userId || !activityId || !indicatorId) {
      return {
        success: false,
        message: 'Les paramètres userId, activityId et indicatorId sont requis',
      };
    }

    //  Vérifier que l'indicateur existe
    const indicator = await this.indicatorsService.findById(indicatorId);
    
    if (!indicator) {
      return {
        success: false,
        message: 'Indicateur non trouvé',
      };
    }

    const result = await this.activityIndicatorService.getIndicatorWithDetails(
      userId,
      activityId,
      indicator.id,
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Récupère uniquement la valeur numérique
   * GET /indicators/activity-attempts/raw?userId=xxx&activityId=xxx
   */
  @Get('raw')
  async getRawValue(
    @Query('userId') userId: string,
    @Query('activityId') activityId: string,
  ) {
    const indicator = await this.indicatorsService.findByName(this.INDICATOR_NAME);
    
    if (!indicator) {
      return { error: 'Indicateur non trouvé' };
    }

    const value = await this.activityIndicatorService.getIndicatorValue(userId, activityId, indicator.id);
    return { value };
  }

  /**
   * Récupère l'historique des valeurs pour un utilisateur sur une activité
   * GET /indicators/activity-attempts/history?userId=xxx&activityId=xxx&limit=30
   */
  @Get('history')
  async getHistory(
    @Query('userId') userId: string,
    @Query('activityId') activityId: string,
    @Query('limit') limit: number = 30,
  ) {
    if (!userId || !activityId) {
      return {
        success: false,
        message: 'Les paramètres userId et activityId sont requis',
      };
    }

    //  Récupération par name
    const indicator = await this.indicatorsService.findByName(this.INDICATOR_NAME);
    
    if (!indicator) {
      return {
        success: false,
        message: 'Indicateur non trouvé',
      };
    }

    const values = await this.indicatorsService.getValues(
      indicator.id,
      'learner',
      userId,
      'day',
      limit,
    );

    // Filtrer par activité via les métadonnées
    const filteredValues = {
      ...values,
      values: values.values.filter(v => v.metadata?.activityId === activityId),
    };

    return {
      success: true,
      data: filteredValues,
    };
  }

  /**
   * Recalcule les valeurs pour tous les utilisateurs d'une activité
   * POST /indicators/activity-attempts/recalc/:activityId
   */
  @Post('recalc/:activityId')
  @HttpCode(HttpStatus.ACCEPTED)
  async recalcForActivity(@Param('activityId') activityId: string) {
    if (!activityId) {
      return {
        success: false,
        message: 'Le paramètre activityId est requis',
      };
    }

    const indicator = await this.indicatorsService.findByName(this.INDICATOR_NAME);
    
    if (!indicator) {
      return {
        success: false,
        message: 'Indicateur non trouvé',
      };
    }

    // Déclencher le recalcul en arrière-plan
    this.activityIndicatorService.recalculateForActivity(activityId, indicator.id).catch(error => {
      console.error('Erreur lors du recalcul:', error);
    });

    return {
      success: true,
      message: `Recalcul déclenché pour l'activité ${activityId}`,
    };
  }

  /**
   * Récupère la liste de toutes les activités disponibles
   * GET /indicators/activity-attempts/activities
   */
  @Get('activities')
  async getActivities() {
    const activities = await this.activityIndicatorService.getAllActivities();
    return {
      success: true,
      data: activities,
    };
  }

  /**
   * Récupère le classement des utilisateurs pour une activité
   * GET /indicators/activity-attempts/ranking/:activityId
   */
  @Get('ranking/:activityId')
  async getRanking(@Param('activityId') activityId: string) {
    if (!activityId) {
      return {
        success: false,
        message: 'Le paramètre activityId est requis',
      };
    }

    const indicator = await this.indicatorsService.findByName(this.INDICATOR_NAME);
    
    if (!indicator) {
      return {
        success: false,
        message: 'Indicateur non trouvé',
      };
    }

    const ranking = await this.activityIndicatorService.getRankingForActivity(activityId, indicator.id);
    return {
      success: true,
      data: ranking,
    };
  }
}