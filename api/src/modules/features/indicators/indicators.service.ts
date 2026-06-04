// src/modules/features/indicators/indicators.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndicatorDefinition } from './entities/indicator-definition.entity';
import { IndicatorValue } from './entities/indicator-value.entity';
import { IndicatorFormulaVersion } from './entities/indicator-formula-version.entity';
import { IndicatorExecutionLog } from './entities/indicator-execution-log.entity';
import { UserIndicatorPreference } from '../user-preferences/entities/user-indicator-preference.entity';
import { FormulaInterpreterService } from './interpreter/formula-interpreter.service';
import { PlatonService } from '../../core/platon/platon.service';

@Injectable()
export class IndicatorsService {
  private readonly logger = new Logger(IndicatorsService.name);

  constructor(
    @InjectRepository(IndicatorDefinition, 'indicators')
    private indicatorModel: Repository<IndicatorDefinition>,
    @InjectRepository(IndicatorValue, 'indicators')
    private indicatorValueModel: Repository<IndicatorValue>,
    @InjectRepository(IndicatorFormulaVersion, 'indicators')
    private formulaVersionModel: Repository<IndicatorFormulaVersion>,
    @InjectRepository(IndicatorExecutionLog, 'indicators')
    private executionLogModel: Repository<IndicatorExecutionLog>,
    @InjectRepository(UserIndicatorPreference, 'indicators')
    private preferenceModel: Repository<UserIndicatorPreference>,
    private readonly formulaInterpreter: FormulaInterpreterService,
    private readonly platonService: PlatonService,
  ) {}

  async findAllActive(): Promise<IndicatorDefinition[]> {
    return this.indicatorModel.find({ where: { isActive: true } });
  }

  async findAllForAdmin(): Promise<IndicatorDefinition[]> {
    return this.indicatorModel.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<IndicatorDefinition> {
    const indicator = await this.indicatorModel.findOne({ where: { id } });
    if (!indicator) throw new NotFoundException(`Indicator ${id} not found`);
    return indicator;
  }

  async findByName(name: string): Promise<IndicatorDefinition | null> {
    return this.indicatorModel.findOne({ where: { name, isActive: true } });
  }

  async getValues(
    id: string,
    contextType: string,
    contextId: string,
    _period: string,
    limit: number,
  ) {
    const indicator = await this.findById(id);

    const values = await this.indicatorValueModel.find({
      where: { indicatorId: indicator.id, contextType, contextId },
      order: { metadata: { lastUpdate: 'DESC' } } as any,
      take: limit,
    });

    return {
      indicator: {
        id: indicator.id,
        name: indicator.name,
        description: indicator.description,
        visualization: indicator.visualization,
      },
      values: values.map(v => ({
        value: v.value,
        timestamp: v.metadata?.lastUpdate,
        trend: this.calculateTrend(v.metadata?.history || []),
        metadata: v.metadata,
      })),
    };
  }

  async getValuesByName(name: string, contextType: string, contextId: string, limit = 30) {
    const indicator = await this.findByName(name);
    if (!indicator) throw new NotFoundException(`Indicator '${name}' not found`);
    return this.getValues(indicator.id, contextType, contextId, 'day', limit);
  }

  async getDashboardValues(request: {
    indicators: string[];
    context: { contextType: string; contextId: string; userId: string };
  }): Promise<Record<string, any>> {
    const { indicators, context } = request;
    const { contextType, contextId } = context;
    const results: Record<string, any> = {};

    for (const name of indicators) {
      const indicator = await this.findByName(name);
      if (indicator) {
        const values = await this.indicatorValueModel.find({
          where: { indicatorId: indicator.id, contextType, contextId },
          order: { metadata: { lastUpdate: 'DESC' } } as any,
          take: 1,
        });
        results[name] = {
          value: values[0]?.value || 0,
          metadata: values[0]?.metadata,
          visualization: indicator.visualization,
        };
      }
    }

    return results;
  }

  async create(definition: any): Promise<IndicatorDefinition> {
    const indicator = this.indicatorModel.create({
      name: definition.name,
      description: definition.description,
      supportedContexts: definition.supportedContexts || [],
      requiredEvents: definition.requiredEvents || [],
      visualization: definition.visualization,
      formula: definition.formula ?? null,
      contextConfigs: definition.contextConfigs ?? null,
      isActive: definition.isActive ?? true,
      templateConfig: definition.templateConfig,
    });
    const saved = await this.indicatorModel.save(indicator);

    // Snapshot de la version initiale
    if (saved.formula?.pipeline?.length) {
      await this.saveFormulaVersion(saved.id, saved.formula, definition.createdBy);
    }

    return saved;
  }

  async update(id: string, data: Partial<IndicatorDefinition> & { updatedBy?: string }): Promise<IndicatorDefinition> {
    const indicator = await this.findById(id);

    // Si la formule change, sauvegarder une nouvelle version avant d'appliquer
    const newFormula = (data as any).formula;
    if (newFormula?.pipeline?.length) {
      const formulaChanged = JSON.stringify(indicator.formula) !== JSON.stringify(newFormula);
      if (formulaChanged) {
        await this.saveFormulaVersion(id, newFormula, (data as any).updatedBy);
      }
    }

    Object.assign(indicator, data);
    return this.indicatorModel.save(indicator);
  }

  async toggleStatus(id: string, isActive: boolean): Promise<IndicatorDefinition> {
    const indicator = await this.findById(id);
    indicator.isActive = isActive;
    return this.indicatorModel.save(indicator);
  }

  async delete(id: string): Promise<void> {
    const indicator = await this.findById(id);
    await this.preferenceModel.delete({ indicatorId: id });
    await this.executionLogModel.delete({ indicatorId: id });
    await this.formulaVersionModel.delete({ indicatorId: id });
    await this.indicatorValueModel.delete({ indicatorId: id });
    await this.indicatorModel.remove(indicator);
  }

  async recalculate(id: string): Promise<{ processed: number; updated: number; failed: number }> {
    const indicator = await this.findById(id);

    // Résoudre la formule à utiliser (vue learner en priorité, sinon formule principale)
    const configs = this.getEffectiveContextConfigs(indicator);
    const firstView = configs.find((c: any) => c.contextType === 'learner')?.views?.[0];
    const formulaToUse = (firstView?.formula?.pipeline?.length) ? firstView.formula : indicator.formula;

    if (!formulaToUse?.pipeline?.length) {
      throw new BadRequestException(`L'indicateur "${indicator.name}" n'a pas de formule DSL`);
    }

    const userIds = await this.platonService.getAllUserIds();
    this.logger.log(`Recalcul de "${indicator.name}" pour ${userIds.length} utilisateurs`);

    let updated = 0;
    let failed = 0;
    const BATCH = 10;

    for (let i = 0; i < userIds.length; i += BATCH) {
      const chunk = userIds.slice(i, i + BATCH);
      await Promise.all(chunk.map(async userId => {
        try {
          const sessions = await this.platonService.getUserSessionData(userId);
          const latestActivityId: string | undefined = sessions.length > 0
            ? [...sessions].sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              )[0]?.activity_id ?? undefined
            : undefined;

          const value = await this.formulaInterpreter.interpret(formulaToUse as any, {
            userId,
            activityId: latestActivityId,
            indicatorId: indicator.id,
          });
          await this.indicatorValueModel.upsert(
            {
              indicatorId: indicator.id,
              contextType: 'learner',
              contextId: userId,
              value,
              metadata: { lastUpdate: new Date(), history: [] } as any,
            },
            { conflictPaths: ['indicatorId', 'contextType', 'contextId'] },
          );
          updated++;
        } catch (err) {
          failed++;
          this.logger.warn(`Recalcul échoué pour userId=${userId}: ${(err as Error).message}`);
        }
      }));
    }

    this.logger.log(`Recalcul terminé - updated: ${updated}, failed: ${failed}`);
    return { processed: userIds.length, updated, failed };
  }

  /**
   * Calcule une vue spécifique d'un indicateur pour un contexte donné.
   * Supporte les contextes : learner (userId), group (groupId), course (courseId), activity, global.
   * Persiste le résultat dans indicator_values (valeur scalaire dans value, résultat structuré dans metadata).
   */
  async getTeacherContext(teacherId: string) {
    return this.platonService.getCoursesWithGroupsForTeacher(teacherId);
  }

  async getCourseActivities(courseId: string) {
    return this.platonService.getActivitiesByCourse(courseId);
  }

  /**
   * Pré-calcule (et persiste) toutes les vues de tous les indicateurs actifs
   * pour un contexte donné (course ou group + activité).
   * Chaque appel interne à computeView vérifie le cache → pas de double calcul.
   */
  async precomputeForContext(
    contextType: string,
    contextId: string,
    activityId: string,
  ): Promise<{ computed: number }> {
    const indicators = await this.findAllActive();
    let computed = 0;

    for (const indicator of indicators) {
      const configs = this.getEffectiveContextConfigs(indicator);
      const ctxConfig = configs.find((c: any) => c.contextType === contextType);
      if (!ctxConfig?.views?.length) continue;

      for (const view of ctxConfig.views) {
        try {
          await this.computeView(indicator.id, contextType, contextId, view.id, activityId);
          computed++;
        } catch {
          // erreur sur un indicateur individuel → on continue les autres
        }
      }
    }

    return { computed };
  }

  async computeView(
    indicatorId: string,
    contextType: string,
    contextId: string,
    viewId: string,
    activityId?: string,
  ): Promise<{ value: number; structuredValue?: any; metadata: Record<string, any> }> {
    const indicator = await this.findById(indicatorId);

    // Résoudre la ViewConfig depuis contextConfigs
    const viewConfig = this.resolveViewConfig(indicator, contextType, viewId);
    if (!viewConfig) {
      throw new BadRequestException(
        `Vue "${viewId}" introuvable pour le contexte "${contextType}" sur l'indicateur "${indicator.name}"`,
      );
    }

    // Pour learner : fallback sur TARGET_ACTIVITY_ID. Pour course/group : l'activityId est fourni par l'appelant.
    const resolvedActivityId = contextType === 'learner'
      ? (activityId ?? process.env.TARGET_ACTIVITY_ID)
      : activityId;

    // Clé de cache composite pour course/group : contextId:activityId:viewId
    // Garantit qu'une même combinaison (cours/groupe + activité + vue) n'est calculée qu'une seule fois.
    const cacheContextId = (contextType === 'course' || contextType === 'group') && resolvedActivityId
      ? `${contextId}:${resolvedActivityId}:${viewId}`
      : contextId;

    // Vérifier le cache avant tout calcul
    const cached = await this.indicatorValueModel.findOne({
      where: { indicatorId, contextType, contextId: cacheContextId },
    });
    if (cached) {
      return {
        value: cached.value,
        structuredValue: (cached.metadata as any)?.structuredValue,
        metadata: cached.metadata as any,
      };
    }

    // Construire le FormulaContext selon le contextType
    const formulaContext: any = { indicatorId };
    if (contextType === 'learner')  { formulaContext.userId = contextId; formulaContext.activityId = resolvedActivityId; }
    if (contextType === 'group')    { formulaContext.groupId = contextId; formulaContext.activityId = resolvedActivityId; }
    if (contextType === 'course')   { formulaContext.courseId = contextId; formulaContext.activityId = resolvedActivityId; }
    if (contextType === 'activity') { formulaContext.activityId = contextId; }

    // Si la vue n'a pas de pipeline propre, on utilise la formule principale de l'indicateur
    const formulaToUse = (viewConfig.formula?.pipeline?.length)
      ? viewConfig.formula
      : indicator.formula;
    let result = await this.formulaInterpreter.interpret(formulaToUse as any, formulaContext);

    // Si le résultat est un tableau de buckets avec userIds, résoudre en noms lisibles
    if (Array.isArray(result) && result.length > 0 && result[0]?.userIds !== undefined) {
      const allIds: string[] = [...new Set<string>(result.flatMap((b: any) => b.userIds ?? []))];
      const nameMap = await this.platonService.getUserNameMap(allIds);
      result = result.map((b: any) => ({
        bucket: b.bucket,
        count: b.count,
        users: (b.userIds as string[]).map(id => nameMap[id] ?? id),
      }));
    }

    const isScalar = typeof result === 'number';
    const scalarValue = isScalar ? result : 0;
    const structuredValue = isScalar ? undefined : result;

    await this.indicatorValueModel.upsert(
      {
        indicatorId,
        contextType,
        contextId: cacheContextId,
        value: scalarValue,
        metadata: { lastUpdate: new Date(), structuredValue, history: [] } as any,
      },
      { conflictPaths: ['indicatorId', 'contextType', 'contextId'] },
    );

    return { value: scalarValue, structuredValue, metadata: { lastUpdate: new Date() } };
  }

  /**
   * Prévisualise le résultat brut d'un pipeline DSL sans persister.
   * Supporte les contextes learner et group.
   */
  async preview(
    formula: any,
    context: { userId?: string; groupId?: string; activityId?: string },
  ): Promise<{ result: any }> {
    const result = await this.formulaInterpreter.interpret(formula, {
      userId: context.userId,
      groupId: context.groupId,
      activityId: context.activityId ?? process.env.TARGET_ACTIVITY_ID,
    });
    return { result };
  }

  /**
   * Retourne les contextConfigs d'un indicateur en garantissant la rétro-compatibilité
   * avec l'ancien format formula + visualization.
   */
  getEffectiveContextConfigs(indicator: any): any[] {
    if (indicator.contextConfigs?.length) return indicator.contextConfigs;
    // Rétro-compatibilité : construire un contextConfig learner depuis formula + visualization
    if (indicator.formula) {
      return [{
        contextType: 'learner',
        views: [{
          id: 'default',
          label: 'Vue principale',
          formula: indicator.formula,
          visualization: indicator.visualization ?? { type: 'card' },
        }],
      }];
    }
    return [];
  }

  private resolveViewConfig(indicator: any, contextType: string, viewId: string): any | null {
    const configs = this.getEffectiveContextConfigs(indicator);
    const ctxConfig = configs.find((c: any) => c.contextType === contextType);
    if (!ctxConfig) return null;
    return ctxConfig.views.find((v: any) => v.id === viewId) ?? null;
  }

  async getPlatonSchema() {
    return this.platonService.getAvailableTables();
  }

  // ── Versioning des formules (tâche 4) ────────────────────────────────────

  async getFormulaHistory(id: string): Promise<IndicatorFormulaVersion[]> {
    return this.formulaVersionModel.find({
      where: { indicatorId: id },
      order: { versionNum: 'DESC' },
      take: 20,
    });
  }

  async rollbackFormula(id: string, versionId: string): Promise<IndicatorDefinition> {
    const version = await this.formulaVersionModel.findOne({ where: { id: versionId, indicatorId: id } });
    if (!version) throw new NotFoundException(`Version ${versionId} introuvable pour l'indicateur ${id}`);

    const indicator = await this.findById(id);
    indicator.formula = version.formula;
    return this.indicatorModel.save(indicator);
  }

  // ── Logs d'exécution (tâche 5) ───────────────────────────────────────────

  async getExecutionLogs(
    id: string,
    limit = 50,
  ): Promise<IndicatorExecutionLog[]> {
    return this.executionLogModel.find({
      where: { indicatorId: id },
      order: { executedAt: 'DESC' },
      take: limit,
    });
  }

  // ── Helpers privés ────────────────────────────────────────────────────────

  private async saveFormulaVersion(indicatorId: string, formula: any, createdBy?: string): Promise<void> {
    const lastVersion = await this.formulaVersionModel.findOne({
      where: { indicatorId },
      order: { versionNum: 'DESC' },
    });
    const versionNum = (lastVersion?.versionNum ?? 0) + 1;
    await this.formulaVersionModel.save({ indicatorId, versionNum, formula, createdBy });
  }

  private calculateTrend(history: any[]): 'up' | 'down' | 'stable' {
    if (!history || history.length < 2) return 'stable';
    const recent = history.slice(-5);
    const values = recent.map(h => h.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const last = values[values.length - 1];
    if (last > avg * 1.05) return 'up';
    if (last < avg * 0.95) return 'down';
    return 'stable';
  }
}
