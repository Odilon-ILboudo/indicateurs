// src/modules/features/user-preferences/user-preferences.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { IndicatorValue, buildValueMetadata } from '../indicators/entities/indicator-value.entity';
import { UserIndicatorPreference } from './entities/user-indicator-preference.entity';
import { FormulaInterpreterService } from '../indicators/interpreter/formula-interpreter.service';
import { resolveFormula } from '../indicators/formula-resolution.util';

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

    const vizPreferences: Record<string, string> = {};
    const vizVisibility: Record<string, string[]> = {};
    for (const p of preferences) {
      if (p.activeVizId) vizPreferences[p.indicatorId] = p.activeVizId;
      if (p.enabledVizIds) vizVisibility[p.indicatorId] = p.enabledVizIds;
    }

    return {
      activeIndicators: preferences.filter(p => p.isVisible).map(p => p.indicatorId),
      vizPreferences,
      vizVisibility,
      preferences: preferences.map(p => ({
        indicatorId: p.indicatorId,
        indicatorName: p.indicator?.name,
        isVisible: p.isVisible,
        displayPreferences: p.displayPreferences,
        activeVizId: p.activeVizId ?? null,
        enabledVizIds: p.enabledVizIds ?? null,
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
    data: { isVisible?: boolean; displayPreferences?: { icon?: string; color?: string }; userRole?: string; activeVizId?: string; enabledVizIds?: string[] | null },
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
      activeVizId: data.activeVizId ?? null,
      enabledVizIds: data.enabledVizIds ?? null,
    });

    const savedPreference = await this.preferenceRepository.save(preference);
    await this.incrementUsageCount(indicatorId);
    await this.calculateAndStoreValue(userId, indicator);
    return savedPreference;
  }

  async updatePreference(
    userId: string,
    indicatorId: string,
    data: { isVisible?: boolean; displayPreferences?: { icon?: string; color?: string }; userRole?: string; activeVizId?: string; enabledVizIds?: string[] | null },
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
    if (data.activeVizId !== undefined) {
      preference.activeVizId = data.activeVizId;
    }
    if (data.enabledVizIds !== undefined) {
      preference.enabledVizIds = data.enabledVizIds;
    }

    const savedPreference = await this.preferenceRepository.save(preference);

    if (!wasVisible && willBeVisible) {
      await this.incrementUsageCount(indicatorId);
      const indicator = await this.indicatorRepository.findOne({
        where: { id: indicatorId, isActive: true },
      });
      if (indicator) await this.calculateAndStoreValue(userId, indicator);
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

  // Pré-calcule la valeur d'un indicateur scopé à un seul utilisateur (learner/teacher/admin) et la persiste.
  // Skip pour les indicateurs course/group/activity : leur valeur se calcule à la demande via computeView.
  private async calculateAndStoreValue(userId: string, indicator: IndicatorDefinition): Promise<void> {
    if (!['learner', 'teacher', 'admin'].includes(indicator.contextType)) return;

    const formulaToUse = resolveFormula(indicator);

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

    const existing = await this.indicatorValueRepository.findOne({
      where: { indicatorId: indicator.id, contextType: indicator.contextType, contextId: userId },
    });
    await this.indicatorValueRepository.upsert(
      {
        indicatorId: indicator.id,
        contextType: indicator.contextType,
        contextId: userId,
        value,
        metadata: buildValueMetadata(existing?.metadata, value),
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
