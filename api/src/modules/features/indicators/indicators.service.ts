// src/modules/features/indicators/indicators.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndicatorDefinition } from './entities/indicator-definition.entity';
import { IndicatorValue } from './entities/indicator-value.entity';
import { IndicatorFormulaVersion } from './entities/indicator-formula-version.entity';
import { IndicatorExecutionLog } from './entities/indicator-execution-log.entity';
import { IndicatorSnapshot } from './entities/indicator-snapshot.entity';
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
    @InjectRepository(IndicatorSnapshot, 'indicators')
    private snapshotModel: Repository<IndicatorSnapshot>,
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
        visualizations: indicator.visualizations,
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
          visualizations: indicator.visualizations,
        };
      }
    }

    return results;
  }

  async create(definition: any): Promise<IndicatorDefinition> {
    const indicator = this.indicatorModel.create({
      name: definition.name,
      description: definition.description,
      contextType: definition.contextType ?? null,
      familyName: definition.familyName ?? null,
      requiredEvents: definition.requiredEvents || [],
      visualizations: definition.visualizations ?? [],
      formula: definition.formula ?? null,
      isActive: definition.isActive ?? true,
    });
    const saved = await this.indicatorModel.save(indicator);

    if (saved.formula?.pipeline?.length) {
      await this.saveFormulaVersion(saved.id, saved.formula, definition.createdBy);
    }

    return saved;
  }

  async update(id: string, data: Partial<IndicatorDefinition> & { updatedBy?: string }): Promise<IndicatorDefinition> {
    const indicator = await this.findById(id);

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

    // Résolution de la formule : visualizations[n].formula en priorité, puis indicator.formula (legacy)
    const vizList = indicator.visualizations ?? [];
    const formula = vizList.find(v => v.formula?.pipeline?.length)?.formula
      ?? indicator.formula;

    if (!formula?.pipeline?.length) {
      throw new BadRequestException(`L'indicateur "${indicator.name}" n'a pas de formule DSL`);
    }

    const prefs = await this.preferenceModel.find({
      where: { indicatorId: id },
      select: ['userId'],
    });
    const userIds = prefs.map(p => p.userId);
    this.logger.log(`Recalcul de "${indicator.name}" pour ${userIds.length} utilisateurs (ayant activé cet indicateur)`);

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

          const value = await this.formulaInterpreter.interpret(formula as any, {
            userId,
            activityId: latestActivityId,
            indicatorId: indicator.id,
          });
          const isScalar = typeof value === 'number';
          await this.indicatorValueModel.upsert(
            {
              indicatorId: indicator.id,
              contextType: 'learner',
              contextId: userId,
              value: isScalar ? value : 0,
              metadata: { lastUpdate: new Date(), structuredValue: isScalar ? undefined : value, history: [] } as any,
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

  async getTeacherContext(teacherId: string) {
    return this.platonService.getCoursesWithGroupsForTeacher(teacherId);
  }

  async getCourseActivities(courseId: string) {
    return this.platonService.getActivitiesByCourse(courseId);
  }

  async getCourseStudents(courseId: string) {
    return this.platonService.getStudentsByCourse(courseId);
  }

  /**
   * Pré-calcule tous les indicateurs actifs dont le contextType correspond
   * au contexte fourni (course, group, activity).
   */
  async precomputeForContext(
    contextType: string,
    contextId: string,
    activityId: string,
  ): Promise<{ computed: number }> {
    const indicators = await this.findAllActive();
    let computed = 0;

    for (const indicator of indicators) {
      if (indicator.contextType !== contextType) continue;
      try {
        await this.computeView(indicator.id, contextType, contextId, activityId);
        computed++;
      } catch {
        // erreur sur un indicateur individuel → on continue
      }
    }

    return { computed };
  }

  /**
   * Calcule la formule d'une visualisation donnée d'un indicateur.
   * Si vizId est fourni, utilise la formule propre à cette visualisation (ou la formule
   * partagée de l'indicateur si la visualisation n'en a pas).
   * Si vizId est absent, utilise visualizations[0].
   * Persiste et met en cache le résultat dans indicator_values (clé = indicatorId+contextId+vizId).
   */
  async computeView(
    indicatorId: string,
    contextType: string,
    contextId: string,
    activityId?: string,
    vizId?: string,
    forceRefresh = false,
  ): Promise<{ value: number; structuredValue?: any; metadata: Record<string, any> }> {
    const indicator = await this.findById(indicatorId);

    // Résoudre la visualisation ciblée
    const vizList = indicator.visualizations ?? [];
    const viz = vizId
      ? (vizList.find(v => v.id === vizId) ?? vizList[0])
      : vizList[0];

    // La formule à utiliser : propre à la viz, sinon formule partagée
    const formula = viz?.formula?.pipeline?.length ? viz.formula : indicator.formula;

    if (!formula?.pipeline?.length) {
      throw new BadRequestException(
        `L'indicateur "${indicator.name}" n'a pas de formule DSL${viz ? ` pour la vue "${viz.label}"` : ''}`,
      );
    }

    const resolvedActivityId = contextType === 'learner'
      ? (activityId ?? process.env.TARGET_ACTIVITY_ID)
      : activityId;

    // Clé de cache : inclut vizId pour distinguer les vues d'un même indicateur
    const baseContextId = (contextType === 'course' || contextType === 'group') && resolvedActivityId
      ? `${contextId}:${resolvedActivityId}`
      : contextId;
    const cacheContextId = viz?.id ? `${baseContextId}:${viz.id}` : baseContextId;

    if (!forceRefresh) {
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
    }

    const formulaContext: any = { indicatorId };
    if (contextType === 'learner')  { formulaContext.userId = contextId; formulaContext.activityId = resolvedActivityId; }
    if (contextType === 'teacher' || contextType === 'admin') { formulaContext.userId = contextId; formulaContext.activityId = resolvedActivityId; }
    if (contextType === 'group')    { formulaContext.groupId = contextId; formulaContext.activityId = resolvedActivityId; }
    if (contextType === 'course')   { formulaContext.courseId = contextId; formulaContext.activityId = resolvedActivityId; }
    if (contextType === 'activity') { formulaContext.activityId = contextId; }

    let result = await this.formulaInterpreter.interpret(formula as any, formulaContext);

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

  async previewSteps(
    formula: any,
    context: { userId?: string; groupId?: string; activityId?: string },
  ) {
    return this.formulaInterpreter.interpretWithSteps(formula, {
      userId: context.userId,
      groupId: context.groupId,
      activityId: context.activityId ?? process.env.TARGET_ACTIVITY_ID,
    });
  }

  async getPlatonSchema() {
    return this.platonService.getAvailableTables();
  }

  // ── Versioning ────────────────────────────────────────────────────────────

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

  // ── Logs ─────────────────────────────────────────────────────────────────

  async getExecutionLogs(id: string, limit = 50): Promise<IndicatorExecutionLog[]> {
    return this.executionLogModel.find({
      where: { indicatorId: id },
      order: { executedAt: 'DESC' },
      take: limit,
    });
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────

  async getSnapshots(indicatorId: string, activityId: string): Promise<IndicatorSnapshot[]> {
    return this.snapshotModel.find({
      where: { indicatorId, activityId },
      order: { createdAt: 'ASC' },
    });
  }

  async createSnapshot(
    indicatorId: string,
    body: { contextType: string; contextId: string; activityId: string; title: string },
  ): Promise<IndicatorSnapshot> {
    const existing = await this.snapshotModel.findOne({
      where: { indicatorId, contextType: body.contextType, contextId: body.contextId, activityId: body.activityId },
    });
    if (existing) {
      throw new ConflictException('Un snapshot pour ce groupe et cette activité existe déjà');
    }
    const snapshot = this.snapshotModel.create({ indicatorId, ...body });
    return this.snapshotModel.save(snapshot);
  }

  async updateSnapshotTitle(indicatorId: string, snapshotId: string, title: string): Promise<IndicatorSnapshot> {
    const snapshot = await this.snapshotModel.findOne({ where: { id: snapshotId, indicatorId } });
    if (!snapshot) throw new NotFoundException('Snapshot introuvable');
    snapshot.title = title;
    return this.snapshotModel.save(snapshot);
  }

  async deleteSnapshot(indicatorId: string, snapshotId: string): Promise<void> {
    const snapshot = await this.snapshotModel.findOne({ where: { id: snapshotId, indicatorId } });
    if (!snapshot) throw new NotFoundException('Snapshot introuvable');
    await this.snapshotModel.remove(snapshot);
  }

  /**
   * Rafraîchit (force-recalcul) tous les snapshots d'un indicateur liés à une activité donnée.
   * Appelé automatiquement par l'ingestion dès qu'un événement affecte cet indicateur.
   * Chaque visualisation de l'indicateur est recalculée indépendamment.
   */
  async refreshSnapshots(indicatorId: string, activityId: string): Promise<void> {
    const snapshots = await this.snapshotModel.find({ where: { indicatorId, activityId } });
    if (!snapshots.length) return;

    const indicator = await this.indicatorModel.findOne({ where: { id: indicatorId } });
    if (!indicator) return;

    const vizList = indicator.visualizations ?? [];

    for (const snapshot of snapshots) {
      for (const viz of vizList) {
        try {
          await this.computeView(
            snapshot.indicatorId,
            snapshot.contextType,
            snapshot.contextId,
            snapshot.activityId,
            viz.id,
            true,
          );
        } catch (err) {
          this.logger.warn(
            `Snapshot refresh échoué — indicatorId=${snapshot.indicatorId} contextId=${snapshot.contextId} viz=${viz.id}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

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
