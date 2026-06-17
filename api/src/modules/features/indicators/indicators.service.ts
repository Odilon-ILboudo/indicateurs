// src/modules/features/indicators/indicators.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndicatorDefinition } from './entities/indicator-definition.entity';
import { IndicatorValue, buildValueMetadata } from './entities/indicator-value.entity';
import { IndicatorExecutionLog } from './entities/indicator-execution-log.entity';
import { IndicatorSnapshot } from './entities/indicator-snapshot.entity';
import { UserIndicatorPreference } from '../user-preferences/entities/user-indicator-preference.entity';
import { FormulaInterpreterService } from './interpreter/formula-interpreter.service';
import { PlatonService } from '../../core/platon/platon.service';
import { resolveFormula } from './formula-resolution.util';

@Injectable()
export class IndicatorsService {
  private readonly logger = new Logger(IndicatorsService.name);

  constructor(
    @InjectRepository(IndicatorDefinition, 'indicators')
    private indicatorModel: Repository<IndicatorDefinition>,
    @InjectRepository(IndicatorValue, 'indicators')
    private indicatorValueModel: Repository<IndicatorValue>,
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

    return saved;
  }

  async update(id: string, data: Partial<IndicatorDefinition> & { updatedBy?: string }): Promise<IndicatorDefinition> {
    const indicator = await this.findById(id);

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
    await this.indicatorValueModel.delete({ indicatorId: id });
    await this.indicatorModel.remove(indicator);
  }

  async recalculate(id: string): Promise<{ processed: number; updated: number; failed: number }> {
    const indicator = await this.findById(id);

    // Résolution de la formule : visualizations[n].formula en priorité, puis indicator.formula (legacy)
    const formula = resolveFormula(indicator);

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
          const scalarValue = isScalar ? value : 0;
          const existing = await this.indicatorValueModel.findOne({
            where: { indicatorId: indicator.id, contextType: 'learner', contextId: userId },
          });
          await this.indicatorValueModel.upsert(
            {
              indicatorId: indicator.id,
              contextType: 'learner',
              contextId: userId,
              value: scalarValue,
              metadata: buildValueMetadata(existing?.metadata, scalarValue, {
                structuredValue: isScalar ? undefined : value,
              }),
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
    const formula = resolveFormula(indicator);

    if (!formula?.pipeline?.length) {
      throw new BadRequestException(
        `L'indicateur "${indicator.name}" n'a pas de formule DSL${viz ? ` pour la vue "${viz.label}"` : ''}`,
      );
    }

    const resolvedActivityId = contextType === 'learner'
      ? (activityId ?? process.env.TARGET_ACTIVITY_ID)
      : activityId;

    // Clé de cache : 1 valeur par indicateur/contexte, partagée par toutes les visualisations
    const cacheContextId = (contextType === 'course' || contextType === 'group') && resolvedActivityId
      ? `${contextId}:${resolvedActivityId}`
      : contextId;

    const existing = await this.indicatorValueModel.findOne({
      where: { indicatorId, contextType, contextId: cacheContextId },
    });

    if (!forceRefresh && existing) {
      return {
        value: existing.value,
        structuredValue: (existing.metadata as any)?.structuredValue,
        metadata: existing.metadata as any,
      };
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
        metadata: buildValueMetadata(existing?.metadata, scalarValue, { structuredValue }),
      },
      { conflictPaths: ['indicatorId', 'contextType', 'contextId'] },
    );

    return { value: scalarValue, structuredValue, metadata: { lastUpdate: new Date() } };
  }

  async preview(
    formula: any,
    context: { userId?: string; groupId?: string; activityId?: string; courseId?: string },
  ): Promise<{ result: any }> {
    const raw = await this.formulaInterpreter.interpret(formula, {
      userId: context.userId,
      groupId: context.groupId,
      activityId: context.activityId ?? process.env.TARGET_ACTIVITY_ID,
      courseId: context.courseId,
    });
    const result = Array.isArray(raw) && raw.length > 200 ? raw.slice(0, 200) : raw;
    return { result };
  }

  async previewSteps(
    formula: any,
    context: { userId?: string; groupId?: string; activityId?: string; courseId?: string },
  ) {
    return this.formulaInterpreter.interpretWithSteps(formula, {
      userId: context.userId,
      groupId: context.groupId,
      activityId: context.activityId ?? process.env.TARGET_ACTIVITY_ID,
      courseId: context.courseId,
    });
  }

  async getPlatonSchema() {
    return this.platonService.getAvailableTables();
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
            `Snapshot refresh échoué - indicatorId=${snapshot.indicatorId} contextId=${snapshot.contextId} viz=${viz.id}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  /**
   * Rafraîchit (force-recalcul) toutes les vues course/group/activity déjà mises en cache dans
   * indicator_values pour une activité donnée (au-delà des seuls snapshots épinglés).
   * Une vue course/group/activity est mise en cache dès qu'un utilisateur la consulte
   * (computeView), même sans snapshot explicite ; sans ce rafraîchissement ce cache restait figé
   * à sa valeur de première consultation. Le contextId composite (`${contextId}:${activityId}`
   * pour course/group, `${activityId}` pour activity, suffixé de `:${viz.id}` selon la vue) est
   * celui produit par computeView - voir sa construction de `cacheContextId`.
   */
  async refreshActivityViews(indicatorId: string, activityId: string): Promise<void> {
    const indicator = await this.indicatorModel.findOne({ where: { id: indicatorId } });
    if (!indicator) return;

    const rows = await this.indicatorValueModel
      .createQueryBuilder('iv')
      .where('iv.indicatorId = :indicatorId', { indicatorId })
      .andWhere('iv.contextType IN (:...types)', { types: ['course', 'group', 'activity'] })
      .andWhere(
        '(iv.contextId = :activityId OR iv.contextId LIKE :prefix OR iv.contextId LIKE :suffix OR iv.contextId LIKE :middle)',
        {
          activityId,
          prefix: `${activityId}:%`,
          suffix: `%:${activityId}`,
          middle: `%:${activityId}:%`,
        },
      )
      .getMany();

    if (!rows.length) return;

    // Déduit les couples (contextType, contextId d'origine) uniques à partir des contextId
    // composites : pour 'activity' le contextId d'origine est l'activityId lui-même, pour
    // 'course'/'group' c'est le premier segment (avant `:${activityId}`).
    const targets = new Map<string, { contextType: string; contextId: string }>();
    for (const row of rows) {
      const contextId = row.contextId.split(':')[0];
      targets.set(`${row.contextType}:${contextId}`, { contextType: row.contextType, contextId });
    }

    const vizList = indicator.visualizations ?? [];

    for (const { contextType, contextId } of targets.values()) {
      for (const vizId of (vizList.length ? vizList.map(v => v.id) : [undefined])) {
        try {
          await this.computeView(indicatorId, contextType, contextId, activityId, vizId, true);
        } catch (err) {
          this.logger.warn(
            `Refresh vue échoué - indicatorId=${indicatorId} contextType=${contextType} contextId=${contextId} viz=${vizId}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private calculateTrend(history: any[]): 'up' | 'down' | 'stable' {
    if (!history || history.length < 2) return 'stable';
    const last = history[history.length - 1].value;
    const previous = history.slice(-6, -1).map(h => h.value);
    const avg = previous.reduce((a, b) => a + b, 0) / previous.length;
    if (last > avg * 1.05) return 'up';
    if (last < avg * 0.95) return 'down';
    return 'stable';
  }
}
