// src/modules/features/activity-indicator/activity-indicator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { IndicatorValue } from '../indicators/entities/indicator-value.entity';
import { PlatonService } from '../../core/platon/platon.service';
import { AttemptsCalculatorService } from '../indicators/calculators/attempts-calculator.service';

@Injectable()
export class ActivityIndicatorService {
  private readonly logger = new Logger(ActivityIndicatorService.name);

  constructor(
    @InjectRepository(IndicatorDefinition, 'indicators')
    private indicatorDefinitionModel: Repository<IndicatorDefinition>,
    @InjectRepository(IndicatorValue, 'indicators')
    private indicatorValueModel: Repository<IndicatorValue>,
    private platonService: PlatonService,
    private attemptsCalculator: AttemptsCalculatorService,
  ) {}

  async getIndicatorValue(userId: string, activityId: string, indicatorId: string): Promise<number> {
    return this.attemptsCalculator.calculateForActivity(userId, activityId);
  }

  async getIndicatorWithDetails(userId: string, activityId: string, indicatorId: string) {
    const value = await this.getIndicatorValue(userId, activityId, indicatorId);
    const activity = await this.platonService.getActivityDetails(activityId);
    const indicator = await this.indicatorDefinitionModel.findOne({ where: { id: indicatorId } });
    
    return {
      userId,
      activityId,
      activityName: activity?.name,
      value,
      interpretation: this.getInterpretation(value),
      thresholds: indicator?.visualization?.thresholds,
    };
  }

  async recalculateForActivity(activityId: string, indicatorId: string): Promise<void> {
    const users = await this.platonService.getUsersByActivity(activityId);
    
    for (const user of users) {
      const value = await this.attemptsCalculator.calculateForActivity(user.id, activityId);
      await this.saveIndicatorValue(indicatorId, user.id, activityId, value);
    }
    
    this.logger.log(`Recalcul terminé pour ${users.length} utilisateurs sur l'activité ${activityId}`);
  }

  async getAllActivities(): Promise<any[]> {
    return this.platonService.getAllActivities();
  }

  async getRankingForActivity(activityId: string, indicatorId: string): Promise<any[]> {
    const users = await this.platonService.getUsersByActivity(activityId);
    const rankings: Array<{ userId: string; email: string; value: number }> = [];
    
    for (const user of users) {
      const value = await this.getIndicatorValue(user.id, activityId, indicatorId);
      rankings.push({
        userId: user.id,
        email: user.email,
        value,
      });
    }
    
    return rankings.sort((a, b) => a.value - b.value);
  }

  private async saveIndicatorValue(
    indicatorId: string,
    userId: string,
    activityId: string,
    value: number,
  ): Promise<void> {
    const contextId = `${userId}:${activityId}`;
    const existing = await this.indicatorValueModel.findOne({
      where: {
        indicatorId: indicatorId,
        contextType: 'learner',
        contextId,
      },
    });

    if (existing) {
      existing.value = value;
      existing.metadata = {
        ...existing.metadata,
        lastUpdate: new Date(),
        activityId,
      };
      await this.indicatorValueModel.save(existing);
    } else {
      const newValue = this.indicatorValueModel.create({
        indicatorId: indicatorId,
        contextType: 'learner',
        contextId,
        value,
        metadata: {
          lastUpdate: new Date(),
          activityId,
          history: [],
        },
      });
      await this.indicatorValueModel.save(newValue);
    }
  }

  private getInterpretation(value: number): string {
    if (value === 0) return 'Aucune donnée disponible';
    if (value === 1) return 'Excellent ! Réussi du premier coup';
    if (value <= 2) return 'Très bien ! Peu de tentatives nécessaires';
    if (value <= 3) return 'Correct, mais peut être amélioré';
    return 'Des efforts supplémentaires sont nécessaires';
  }
}