// src/modules/features/user-preferences/user-preferences.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { IndicatorValue } from '../indicators/entities/indicator-value.entity';
import { UserIndicatorPreference } from './entities/user-indicator-preference.entity';
import { FormulaInterpreterService } from '../indicators/interpreter/formula-interpreter.service';

@Injectable()
export class UserPreferencesService {
  private readonly logger = new Logger(UserPreferencesService.name);

  constructor(
    @InjectRepository(UserIndicatorPreference, 'indicators')
    private preferenceRepository: Repository<UserIndicatorPreference>,
    @InjectRepository(IndicatorDefinition, 'indicators')
    private indicatorRepository: Repository<IndicatorDefinition>,
    @InjectRepository(IndicatorValue, 'indicators')
    private indicatorValueRepository: Repository<IndicatorValue>,
    private readonly formulaInterpreter: FormulaInterpreterService,
  ) {}

  async getUserPreferences(userId: string) {
    const preferences = await this.preferenceRepository.find({
      where: { userId },
      relations: ['indicator'],
    });

    return {
      activeIndicators: preferences.filter(p => p.isVisible).map(p => p.indicatorId),
      preferences: preferences.map(p => ({
        indicatorId: p.indicatorId,
        indicatorName: p.indicator?.name,
        isVisible: p.isVisible,
        displayPreferences: p.displayPreferences,
        usageCount: p.indicator?.usageCount || 0,
      })),
    };
  }

  async getUserPreference(userId: string, indicatorId: string) {
    return this.preferenceRepository.findOne({
      where: { userId, indicatorId },
      relations: ['indicator'],
    });
  }

  async createPreference(
    userId: string,
    indicatorId: string,
    data: { isVisible?: boolean; displayPreferences?: { icon?: string; color?: string }; userRole?: string },
  ) {
    const indicator = await this.indicatorRepository.findOne({
      where: { id: indicatorId, isActive: true },
    });

    if (!indicator) {
      throw new NotFoundException(`Indicator ${indicatorId} not found`);
    }

    const preference = this.preferenceRepository.create({
      userId,
      indicatorId,
      isVisible: data.isVisible ?? true,
      displayPreferences: data.displayPreferences,
    });

    const savedPreference = await this.preferenceRepository.save(preference);
    await this.incrementUsageCount(indicatorId);
    const isTeacherOrAdmin = data.userRole === 'teacher' || data.userRole === 'admin';
    if (!isTeacherOrAdmin) await this.calculateAndStoreValue(userId, indicator);
    return savedPreference;
  }

  async updatePreference(
    userId: string,
    indicatorId: string,
    data: { isVisible?: boolean; displayPreferences?: { icon?: string; color?: string }; userRole?: string },
  ) {
    let preference = await this.preferenceRepository.findOne({
      where: { userId, indicatorId },
      relations: ['indicator'],
    });

    const wasVisible = preference?.isVisible ?? false;
    const willBeVisible = data.isVisible ?? wasVisible;

    if (!preference) {
      preference = this.preferenceRepository.create({
        userId,
        indicatorId,
        isVisible: true,
      });
    }

    if (data.isVisible !== undefined) {
      preference.isVisible = data.isVisible;
    }
    if (data.displayPreferences) {
      preference.displayPreferences = data.displayPreferences;
    }

    const savedPreference = await this.preferenceRepository.save(preference);

    if (!wasVisible && willBeVisible) {
      await this.incrementUsageCount(indicatorId);
      const isTeacherOrAdmin = data.userRole === 'teacher' || data.userRole === 'admin';
      if (!isTeacherOrAdmin) {
        const indicator = await this.indicatorRepository.findOne({
          where: { id: indicatorId, isActive: true },
        });
        if (indicator) await this.calculateAndStoreValue(userId, indicator);
      }
    } else if (wasVisible && !willBeVisible) {
      await this.decrementUsageCount(indicatorId);
    }

    return savedPreference;
  }

  async deletePreference(userId: string, indicatorId: string) {
    const preference = await this.preferenceRepository.findOne({
      where: { userId, indicatorId },
    });

    if (!preference) {
      throw new NotFoundException(`Preference not found`);
    }

    const wasVisible = preference.isVisible;
    await this.preferenceRepository.delete({ userId, indicatorId });

    if (wasVisible) {
      await this.decrementUsageCount(indicatorId);
    }
  }

  // Pré-calcule la valeur learner d'un indicateur et la persiste.
  // Skip si l'indicateur n'a pas de contextConfig 'learner' (ex. indicateur course/group uniquement).
  private async calculateAndStoreValue(userId: string, indicator: IndicatorDefinition): Promise<void> {
    const explicitConfigs: any[] = indicator.contextConfigs as any[];
    const hasExplicitConfigs = Array.isArray(explicitConfigs) && explicitConfigs.length > 0;

    // Si contextConfigs est défini mais sans vue learner → indicateur teacher/course, rien à pré-calculer
    if (hasExplicitConfigs && !explicitConfigs.some(c => c.contextType === 'learner')) return;

    const configs: any[] = hasExplicitConfigs
      ? explicitConfigs
      : indicator.formula
        ? [{ contextType: 'learner', views: [{ formula: indicator.formula }] }]
        : [];

    const firstView = configs.find(c => c.contextType === 'learner')?.views?.[0];
    const formulaToUse = (firstView?.formula?.pipeline?.length)
      ? firstView.formula
      : indicator.formula;

    if (!formulaToUse?.pipeline?.length) return;

    let value = 0;
    try {
      value = await this.formulaInterpreter.interpret(formulaToUse as any, {
        userId,
        activityId: process.env.TARGET_ACTIVITY_ID,
        indicatorId: indicator.id,
      });
    } catch (err) {
      this.logger.warn(`Calcul échoué pour indicator=${indicator.id} user=${userId}: ${(err as Error).message}`);
    }

    await this.indicatorValueRepository.upsert(
      {
        indicatorId: indicator.id,
        contextType: 'learner',
        contextId: userId,
        value,
        metadata: { lastUpdate: new Date(), history: [] } as any,
      },
      { conflictPaths: ['indicatorId', 'contextType', 'contextId'] },
    );
  }

  private async incrementUsageCount(indicatorId: string): Promise<void> {
    await this.indicatorRepository.increment({ id: indicatorId }, 'usageCount', 1);
  }

  private async decrementUsageCount(indicatorId: string): Promise<void> {
    await this.indicatorRepository.decrement({ id: indicatorId }, 'usageCount', 1);
  }
}
