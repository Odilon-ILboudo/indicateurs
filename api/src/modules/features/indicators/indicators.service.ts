// src/modules/features/indicators/indicators.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IndicatorDefinition, ContextType, FormulaDefinition } from './entities/indicator-definition.entity';
import { IndicatorValue, buildValueMetadata } from './entities/indicator-value.entity';
import { IndicatorExecutionLog } from './entities/indicator-execution-log.entity';
import { IndicatorSnapshot } from './entities/indicator-snapshot.entity';
import { IndicatorFeedback } from './entities/indicator-feedback.entity';
import { IndicatorNotification } from './entities/indicator-notification.entity';
import { UserIndicatorPreference } from '../user-preferences/entities/user-indicator-preference.entity';
import { FormulaInterpreterService, CandidateRowsMap, GroupCandidateRowsMap } from './interpreter/formula-interpreter.service';
import { PlatonService } from '../../core/platon/platon.service';
import { resolveFormula, isActivityAware, isCourseAware } from './formula-resolution.util';
import { CreateIndicatorDto, UpdateIndicatorDto } from './dto/indicator.dto';
import { IndicatorEventRule } from '../event-rules/indicator-event-rule.entity';
import { IndicatorEventType } from '../event-types/event-type.entity';

export interface DeltaEvent {
  sessionId?: string;
  payload: Record<string, any>;
}

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
    @InjectRepository(IndicatorFeedback, 'indicators')
    private feedbackModel: Repository<IndicatorFeedback>,
    @InjectRepository(IndicatorNotification, 'indicators')
    private notificationModel: Repository<IndicatorNotification>,
    @InjectRepository(IndicatorEventRule, 'indicators')
    private eventRuleModel: Repository<IndicatorEventRule>,
    @InjectRepository(IndicatorEventType, 'indicators')
    private eventTypeModel: Repository<IndicatorEventType>,
    private readonly formulaInterpreter: FormulaInterpreterService,
    private readonly platonService: PlatonService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private emitUpdated(indicatorId: string, indicatorName: string, contextType: string, contextId: string, value: number): void {
    this.eventEmitter.emit('indicator.updated', {
      indicatorId,
      indicatorName,
      contextType,
      contextId,
      value,
      eventType: 'refresh',
      timestamp: new Date(),
    });
  }

  async findAllActive(): Promise<IndicatorDefinition[]> {
    return this.indicatorModel.find({ where: { isActive: true } });
  }

  async findAllForAdmin(): Promise<IndicatorDefinition[]> {
    return this.indicatorModel.find({ order: { createdAt: 'DESC' } });
  }

  async searchSimilar(q: string, excludeId?: string): Promise<IndicatorDefinition[]> {
    const term = `%${q.trim()}%`;
    const qb = this.indicatorModel
      .createQueryBuilder('ind')
      .where('(ind.name ILIKE :term OR ind.description ILIKE :term)', { term })
      .orderBy('ind.name', 'ASC');
    if (excludeId) qb.andWhere('ind.id != :excludeId', { excludeId });
    return qb.getMany();
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

  /**
   * Un indicateur actif dont un événement requis n'a aucun déclencheur installé ne sera
   * jamais recalculé en temps réel (silencieusement) - on refuse l'enregistrement plutôt que
   * de laisser un admin croire que l'indicateur est fonctionnel.
   */
  private async assertRequiredEventsHaveInstalledTriggers(requiredEvents: string[] | null | undefined): Promise<void> {
    if (!requiredEvents || requiredEvents.length === 0) return;

    const uniqueNames = [...new Set(requiredEvents)];
    const eventTypes = await this.eventTypeModel.find({ where: { name: In(uniqueNames) } });
    const eventTypesByName = new Map(eventTypes.map(et => [et.name, et]));

    const problems: string[] = [];
    for (const name of uniqueNames) {
      const eventType = eventTypesByName.get(name);
      if (!eventType || !eventType.isActive) {
        problems.push(`"${name}" (aucun type d'événement actif portant ce nom)`);
        continue;
      }
      const installedRule = await this.eventRuleModel.findOne({
        where: { eventTypeId: eventType.id, isActive: true, triggerInstalled: true },
      });
      if (!installedRule) {
        problems.push(`"${name}" (aucun déclencheur installé et actif)`);
      }
    }

    if (problems.length > 0) {
      throw new BadRequestException(
        `Impossible d'activer cet indicateur : les événements suivants ne recalculeront jamais sa valeur car ils n'ont aucun déclencheur réellement installé - ${problems.join(', ')}. ` +
        `Installez le déclencheur correspondant dans l'écran "Événements & déclencheurs" avant d'activer l'indicateur, ou retirez ces événements de sa liste.`,
      );
    }
  }

  async create(definition: CreateIndicatorDto): Promise<IndicatorDefinition> {
    const existing = await this.indicatorModel.findOne({ where: { name: definition.name } });
    if (existing) {
      throw new ConflictException(`Un indicateur nommé "${definition.name}" existe déjà.`);
    }

    const isActive = definition.isActive ?? false;
    if (isActive) {
      await this.assertRequiredEventsHaveInstalledTriggers(definition.requiredEvents);
    }

    const indicator = this.indicatorModel.create({
      name: definition.name,
      description: definition.description,
      contextType: (definition.contextType ?? null) as ContextType,
      familyName: definition.familyName ?? null,
      requiredEvents: definition.requiredEvents || [],
      visualizations: definition.visualizations ?? [],
      formula: definition.formula ?? null,
      isActive,
      isComplete: definition.isComplete ?? false,
      isFamilyPlaceholder: definition.isFamilyPlaceholder ?? false,
      interpretationHint: definition.interpretationHint ?? null,
      thresholds: definition.thresholds ?? null,
      visibilityRoles: definition.visibilityRoles ?? null,
      baseIndicatorId: definition.baseIndicatorId ?? null,
    });
    const saved = await this.indicatorModel.save(indicator);

    return saved;
  }

  async update(id: string, data: UpdateIndicatorDto): Promise<IndicatorDefinition> {
    const indicator = await this.findById(id);

    Object.assign(indicator, data);
    if (indicator.isActive) {
      await this.assertRequiredEventsHaveInstalledTriggers(indicator.requiredEvents);
    }
    return this.indicatorModel.save(indicator);
  }

  async toggleStatus(id: string, isActive: boolean): Promise<IndicatorDefinition> {
    const indicator = await this.findById(id);
    if (isActive) {
      await this.assertRequiredEventsHaveInstalledTriggers(indicator.requiredEvents);
    }
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

    // Un indicateur personnel (learner/teacher/admin) activity-aware ou course-aware n'a pas
    // UNE valeur par utilisateur mais une par (utilisateur, activité/cours) - même distinction
    // que resolveCacheContextId(), pour ne jamais écrire une ligne de cache différente de celle
    // que la carte lit réellement via computeView().
    const isPersonal = indicator.contextType === 'learner' || indicator.contextType === 'teacher' || indicator.contextType === 'admin';
    const activityAware = isPersonal && isActivityAware(formula);
    const courseAware = isPersonal && isCourseAware(formula);

    let processed = 0;
    let updated = 0;
    let failed = 0;
    const BATCH = 10;

    for (let i = 0; i < userIds.length; i += BATCH) {
      const chunk = userIds.slice(i, i + BATCH);
      await Promise.all(chunk.map(async userId => {
        if (!activityAware && !courseAware) {
          // Indicateur personnel non scopé : une seule valeur globale par utilisateur.
          processed++;
          try {
            await this.computeView(id, indicator.contextType, userId, undefined, undefined, true);
            updated++;
          } catch (err) {
            failed++;
            this.logger.warn(`Recalcul échoué pour userId=${userId}: ${(err as Error).message}`);
          }
          return;
        }

        // Indicateur scopé : une valeur par activité (ou cours) où l'utilisateur a une trace
        // réelle dans SessionData - computeView() se charge de recalculer et d'écrire la bonne
        // ligne de cache (avec le suffixe :activityId ou :courseId).
        let sessions: { activity_id?: string; course_id?: string }[] = [];
        try {
          sessions = await this.platonService.getUserSessionData(userId);
        } catch (err) {
          failed++;
          this.logger.warn(`Recalcul échoué pour userId=${userId}: ${(err as Error).message}`);
          return;
        }
        const scopeIds = [...new Set(
          (activityAware ? sessions.map(s => s.activity_id) : sessions.map(s => s.course_id))
            .filter((v): v is string => !!v),
        )];

        for (const scopeId of scopeIds) {
          processed++;
          try {
            if (activityAware) {
              await this.computeView(id, indicator.contextType, userId, scopeId, undefined, true);
            } else {
              await this.computeView(id, indicator.contextType, userId, undefined, undefined, true, scopeId);
            }
            updated++;
          } catch (err) {
            failed++;
            this.logger.warn(`Recalcul échoué pour userId=${userId}, scope=${scopeId}: ${(err as Error).message}`);
          }
        }
      }));
    }

    this.logger.log(`Recalcul terminé - processed: ${processed}, updated: ${updated}, failed: ${failed}`);
    return { processed, updated, failed };
  }

  async searchCourses(query: string, offset = 0) {
    return this.platonService.searchCourses(query, 10, offset);
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
  /**
   * Clé de cache pour indicator_values : ajoute un suffixe activityId ou courseId quand le
   * contexte ET la formule en ont besoin (voir isActivityAware()/isCourseAware()). Partagée par
   * computeView() et computeViewIncremental() pour qu'elles ciblent toujours la même ligne -
   * une divergence entre les deux aurait pour effet de faire manquer le cache en incrémental
   * et de retomber, sans erreur visible, sur un recalcul complet.
   */
  private resolveCacheContextId(
    contextType: string,
    contextId: string,
    formula: FormulaDefinition | null,
    activityId?: string,
    courseId?: string,
  ): string {
    const isPersonal = contextType === 'learner' || contextType === 'teacher' || contextType === 'admin';
    const activityRelevant = contextType === 'course' || contextType === 'group' || (isPersonal && isActivityAware(formula));
    const courseRelevant = contextType === 'group' || (isPersonal && isCourseAware(formula));
    const scopeSuffix = (activityRelevant && activityId) ? activityId : (courseRelevant && courseId) ? courseId : undefined;
    return scopeSuffix ? `${contextId}:${scopeSuffix}` : contextId;
  }

  /**
   * Construit le FormulaContext (userId/groupId/activityId/courseId) passé à l'interpréteur,
   * à partir du (contextType, contextId) de la vue. Partagée par computeView() et
   * computeViewIncremental() (chemin needsTargetedFetch, formules avec join) - voir
   * resolveCacheContextId() pour le même principe appliqué à la clé de cache.
   */
  private buildFormulaContext(
    indicatorId: string,
    contextType: string,
    contextId: string,
    formula: FormulaDefinition | null,
    activityId?: string,
    courseId?: string,
  ): Record<string, any> {
    const formulaContext: any = { indicatorId };
    // course_id est une colonne directe de SessionData (dénormalisée) : contrairement à
    // `group`, aucune sous-requête n'est nécessaire, le mécanisme générique de filtre suffit
    // (voir executeFetch, CONTEXT_FIELD_MAP). Le choix se base sur ce que LA FORMULE déclare
    // (isActivityAware/isCourseAware), jamais sur la simple présence d'un activityId~: un
    // événement réel porte presque toujours un activityId, même pour une formule qui ne
    // s'intéresse qu'à course_id - s'y fier aveuglément aurait scopé par erreur une formule
    // course-aware sur une seule activité (ou pire, laissé son filtre sans valeur du tout).
    if (contextType === 'learner' || contextType === 'teacher' || contextType === 'admin') {
      formulaContext.userId = contextId;
      if (isActivityAware(formula)) formulaContext.activityId = activityId;
      if (isCourseAware(formula)) formulaContext.courseId = courseId;
    }
    if (contextType === 'group') {
      formulaContext.groupId = contextId;
      // Même principe que learner/teacher/admin ci-dessus~: se baser sur ce que la formule
      // déclare, pas sur la simple présence d'un activityId (voir executeFetch, wantsGroup).
      if (isCourseAware(formula)) { formulaContext.courseId = courseId; } else { formulaContext.activityId = activityId; }
    }
    if (contextType === 'course')   { formulaContext.courseId = contextId; formulaContext.activityId = activityId; }
    if (contextType === 'activity') { formulaContext.activityId = contextId; }
    return formulaContext;
  }

  async computeView(
    indicatorId: string,
    contextType: string,
    contextId: string,
    activityId?: string,
    vizId?: string,
    forceRefresh = false,
    courseId?: string,
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

    // Clé de cache : 1 valeur par indicateur/contexte, partagée par toutes les visualisations.
    // `course` est structurellement toujours scopé par activité (activityId requis côté
    // appelant). `group` est scopé soit par activité, soit par cours entier (toutes ses
    // activités agrégées) - l'un ou l'autre, jamais aucun, jamais les deux à la fois.
    // `learner`/`teacher`/`admin` ne sont scopés que si LEUR formule est activity-aware
    // (isActivityAware) ou course-aware (isCourseAware) : sinon, une valeur "globale"
    // légitime (ex. tableau de bord) serait à tort fragmentée, ou inversement écrasée par
    // une valeur scopée. Logique partagée avec computeViewIncremental() via resolveCacheContextId().
    const cacheContextId = this.resolveCacheContextId(contextType, contextId, formula, activityId, courseId);

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

    const formulaContext = this.buildFormulaContext(indicatorId, contextType, contextId, formula, activityId, courseId);

    // Pour les formules éligibles au calcul incrémental, stocker l'état intermédiaire en metadata
    // (rowValues ou groupRowValues) permet aux refresh d'événements ultérieurs d'éviter un SQL complet.
    const shape = this.formulaInterpreter.getIncrementalShape(formula as any);
    let result: any;
    let rowValues: Record<string, number> | undefined;
    let groupRowValues: Record<string, Record<string, number>> | undefined;
    let candidateRows: CandidateRowsMap | undefined;
    let groupCandidateRows: GroupCandidateRowsMap | undefined;

    if (shape?.findFirst) {
      const computed = await this.formulaInterpreter.computeWithCandidateRows(formula as any, formulaContext, shape);
      result = computed.result;
      candidateRows = computed.candidateRows;
      groupCandidateRows = computed.groupCandidateRows;
    } else if (shape?.groupByField) {
      const computed = await this.formulaInterpreter.computeWithGroupRowMap(formula as any, formulaContext, shape);
      result = computed.result;
      groupRowValues = computed.groupRowValues;
    } else if (shape) {
      const computed = await this.formulaInterpreter.computeWithRowMap(formula as any, formulaContext, shape);
      result = computed.result;
      rowValues = computed.rowValues;
    } else {
      result = await this.formulaInterpreter.interpret(formula as any, formulaContext);
    }

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
        metadata: buildValueMetadata(existing?.metadata, scalarValue, {
          structuredValue,
          ...(rowValues ? { incremental: { rowValues } } : {}),
          ...(groupRowValues ? { incremental: { groupRowValues } } : {}),
          ...(candidateRows ? { incremental: { candidateRows } } : {}),
          ...(groupCandidateRows ? { incremental: { groupCandidateRows } } : {}),
        }),
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
      activityId: context.activityId,
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
      activityId: context.activityId,
      courseId: context.courseId,
    });
  }

  async getPlatonSchema() {
    return this.platonService.getAvailableTables();
  }

  async getFullSchema() {
    return this.platonService.getSchemaWithRelations();
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

  async getSnapshots(indicatorId: string, scope: { activityId: string } | { courseId: string }): Promise<IndicatorSnapshot[]> {
    return this.snapshotModel.find({
      where: { indicatorId, ...scope },
      order: { createdAt: 'ASC' },
    });
  }

  async createSnapshot(
    indicatorId: string,
    body: { contextType: string; contextId: string; activityId?: string; courseId?: string; title: string },
  ): Promise<IndicatorSnapshot> {
    if (!body.activityId === !body.courseId) {
      throw new BadRequestException('Exactement un des deux, activityId ou courseId, est requis');
    }
    const scope = body.activityId ? { activityId: body.activityId } : { courseId: body.courseId };
    const existing = await this.snapshotModel.findOne({
      where: { indicatorId, contextType: body.contextType, contextId: body.contextId, ...scope },
    });
    if (existing) {
      throw new ConflictException(
        `Un snapshot pour ce groupe et ce${body.activityId ? 'tte activité' : ' cours'} existe déjà`,
      );
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
   * Mise à jour incrémentale (delta) d'une vue lors d'un événement d'ingestion. Point d'entrée
   * unique pour tout événement, quel que soit le contextType ou le périmètre (activité, cours
   * entier, ou aucun) : si la formule est éligible (voir getIncrementalShape()) et qu'un état
   * incrémental existe déjà en metadata, met à jour uniquement la ligne concernée et ré-agrège -
   * 0 requête SQL sur PLaTon si le pipeline n'a pas de join (lecture directe du payload de
   * l'événement), 1 requête ciblée (par sessionId) si le pipeline a un join. Sinon (formule non
   * éligible, ou premier calcul), retombe sur un recalcul complet via
   * computeView(forceRefresh=true), qui initialise au passage l'état incrémental pour les
   * événements suivants. Retourne toujours la valeur à jour (jamais void), pour que les
   * appelants puissent émettre la notification WS quel que soit le chemin emprunté.
   */
  async computeViewIncremental(
    indicatorId: string,
    contextType: string,
    contextId: string,
    activityId: string | undefined,
    vizId: string | undefined,
    deltaEvent: DeltaEvent,
    courseId?: string,
  ): Promise<{ value: number } | null> {
    const indicator = await this.findById(indicatorId);
    const formula = resolveFormula(indicator);
    if (!formula?.pipeline?.length) return null;

    const fullRecompute = async (): Promise<{ value: number }> => {
      const result = await this.computeView(indicatorId, contextType, contextId, activityId, vizId, true, courseId);
      return { value: result.value };
    };

    const cacheContextId = this.resolveCacheContextId(contextType, contextId, formula, activityId, courseId);

    const existing = await this.indicatorValueModel.findOne({
      where: { indicatorId, contextType, contextId: cacheContextId },
    });

    const shape = this.formulaInterpreter.getIncrementalShape(formula as any);
    if (!shape || !deltaEvent.sessionId) return fullRecompute();

    // Résout la ligne source de l'événement, seulement si un état incrémental existe déjà (sinon
    // fullRecompute() est appelé sans aucune requête ciblée). Pas de join → payload de
    // l'événement directement (0 SQL) ; join → 1 fetch ciblé sur ce sessionId puis joins en
    // mémoire (voir fetchSingleSessionRow). Utilisé par les 3 chemins ci-dessous.
    const formulaContext = this.buildFormulaContext(indicatorId, contextType, contextId, formula, activityId, courseId);
    const resolveSourceRow = async (): Promise<Record<string, any> | null> => {
      if (!shape.needsTargetedFetch) return deltaEvent.payload ?? null;
      const fetched = await this.formulaInterpreter.fetchSingleSessionRow(deltaEvent.sessionId!, formulaContext, shape);
      return fetched ?? deltaEvent.payload ?? null;
    };
    const passesFilters = (row: Record<string, any>): boolean =>
      shape.filterSteps.every(fs => this.formulaInterpreter.evaluateFilterRow(fs.params, row));

    if (shape.findFirst) {
      // ── Chemin findFirst semi-incrémental ──────────────────────────────────
      const { sortField, whereField, whereValue } = shape.findFirst;
      const buildEntry = (row: Record<string, any>) => {
        const extractedValue = parseFloat(row[shape.extractField]);
        if (isNaN(extractedValue) || !passesFilters(row)) return null;
        return {
          sortValue: sortField ? row[sortField] : null,
          extractedValue,
          passes: whereField != null ? String(row[whereField]) === String(whereValue) : true,
        };
      };

      if (shape.groupByField) {
        const existingGroupCandidateRows = (existing?.metadata as any)?.incremental?.groupCandidateRows as GroupCandidateRowsMap | undefined;
        if (existingGroupCandidateRows !== undefined) {
          const row = await resolveSourceRow();
          const entry = row ? buildEntry(row) : null;
          if (row && entry) {
            const groupKey = String(row[shape.groupByField] ?? '__null__');
            const newGroupCandidateRows = {
              ...existingGroupCandidateRows,
              [groupKey]: { ...(existingGroupCandidateRows[groupKey] ?? {}), [deltaEvent.sessionId]: entry },
            };
            const newValue = await this.formulaInterpreter.computeResultFromGroupCandidates(newGroupCandidateRows, shape);
            await this.indicatorValueModel.upsert(
              { indicatorId, contextType, contextId: cacheContextId, value: newValue,
                metadata: buildValueMetadata(existing?.metadata, newValue, { incremental: { groupCandidateRows: newGroupCandidateRows } }) },
              { conflictPaths: ['indicatorId', 'contextType', 'contextId'] },
            );
            return { value: newValue };
          }
        }
      } else {
        const existingCandidateRows = (existing?.metadata as any)?.incremental?.candidateRows as CandidateRowsMap | undefined;
        if (existingCandidateRows !== undefined) {
          const row = await resolveSourceRow();
          const entry = row ? buildEntry(row) : null;
          if (entry) {
            const newCandidateRows = { ...existingCandidateRows, [deltaEvent.sessionId]: entry };
            const newValue = await this.formulaInterpreter.computeResultFromCandidates(newCandidateRows, shape);
            await this.indicatorValueModel.upsert(
              { indicatorId, contextType, contextId: cacheContextId, value: newValue,
                metadata: buildValueMetadata(existing?.metadata, newValue, { incremental: { candidateRows: newCandidateRows } }) },
              { conflictPaths: ['indicatorId', 'contextType', 'contextId'] },
            );
            return { value: newValue };
          }
        }
      }
      return fullRecompute();
    }

    if (shape.groupByField) {
      // ── Chemin groupBy incrémental ─────────────────────────────────────────
      const existingGroupRowValues = (existing?.metadata as any)?.incremental?.groupRowValues as
        Record<string, Record<string, number>> | undefined;

      if (existingGroupRowValues !== undefined) {
        const row = await resolveSourceRow();
        if (row) {
          const groupKey = String(row[shape.groupByField] ?? '__null__');
          const newGroupRowValues = { ...existingGroupRowValues };
          newGroupRowValues[groupKey] = { ...(newGroupRowValues[groupKey] ?? {}) };

          if (passesFilters(row)) {
            const rawVal = row[shape.extractField];
            const v = typeof rawVal === 'number' ? rawVal : parseFloat(rawVal);
            if (!isNaN(v)) newGroupRowValues[groupKey][deltaEvent.sessionId] = v;
          } else {
            delete newGroupRowValues[groupKey][deltaEvent.sessionId];
            if (Object.keys(newGroupRowValues[groupKey]).length === 0) delete newGroupRowValues[groupKey];
          }

          const allValues = Object.values(newGroupRowValues).flatMap(g => Object.values(g));
          const newValue = await this.formulaInterpreter.applyPostSteps(allValues, shape.postSteps);

          await this.indicatorValueModel.upsert(
            {
              indicatorId,
              contextType,
              contextId: cacheContextId,
              value: newValue,
              metadata: buildValueMetadata(existing?.metadata, newValue, { incremental: { groupRowValues: newGroupRowValues } }),
            },
            { conflictPaths: ['indicatorId', 'contextType', 'contextId'] },
          );
          return { value: newValue };
        }
      }

      return fullRecompute();
    }

    // ── Chemin rowValues plat ────────────────────────────────────────────────
    const existingRowValues = (existing?.metadata as any)?.incremental?.rowValues as Record<string, number> | undefined;

    if (existingRowValues !== undefined) {
      const row = await resolveSourceRow();
      if (row) {
        const newRowValues = { ...existingRowValues };
        if (passesFilters(row)) {
          const rawVal = row[shape.extractField];
          const v = typeof rawVal === 'number' ? rawVal : parseFloat(rawVal);
          if (!isNaN(v)) newRowValues[deltaEvent.sessionId] = v;
        } else {
          delete newRowValues[deltaEvent.sessionId];
        }
        const newValue = await this.formulaInterpreter.applyPostSteps(Object.values(newRowValues), shape.postSteps);

        await this.indicatorValueModel.upsert(
          {
            indicatorId,
            contextType,
            contextId: cacheContextId,
            value: newValue,
            metadata: buildValueMetadata(existing?.metadata, newValue, { incremental: { rowValues: newRowValues } }),
          },
          { conflictPaths: ['indicatorId', 'contextType', 'contextId'] },
        );
        return { value: newValue };
      }
    }

    // Fallback : rowValues absent (première consultation) ou formule non éligible → calcul complet
    return fullRecompute();
  }

  /**
   * Rafraîchit tous les snapshots d'un indicateur liés à une activité ou à un cours donné.
   * Si deltaEvent est fourni (appel depuis l'ingestion) → tente un calcul incrémental via
   * computeViewIncremental() (activité ou cours entier, peu importe) ; sinon, recalcul complet.
   */
  async refreshSnapshots(
    indicatorId: string,
    scope: { activityId: string } | { courseId: string },
    deltaEvent?: DeltaEvent,
  ): Promise<void> {
    const snapshots = await this.snapshotModel.find({ where: { indicatorId, ...scope } });
    if (!snapshots.length) return;

    const indicator = await this.indicatorModel.findOne({ where: { id: indicatorId } });
    if (!indicator) return;

    const vizList = indicator.visualizations ?? [];

    for (const snapshot of snapshots) {
      for (const viz of vizList) {
        try {
          const result = deltaEvent
            ? await this.computeViewIncremental(
                snapshot.indicatorId, snapshot.contextType, snapshot.contextId,
                snapshot.activityId ?? undefined, viz.id, deltaEvent, snapshot.courseId ?? undefined,
              )
            : await this.computeView(
                snapshot.indicatorId, snapshot.contextType, snapshot.contextId,
                snapshot.activityId ?? undefined, viz.id, true, snapshot.courseId ?? undefined,
              );
          if (result) {
            this.emitUpdated(snapshot.indicatorId, indicator.name, snapshot.contextType, snapshot.contextId, result.value);
          }
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
  async refreshActivityViews(indicatorId: string, activityId: string, deltaEvent?: DeltaEvent): Promise<void> {
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
          const result = deltaEvent
            ? await this.computeViewIncremental(indicatorId, contextType, contextId, activityId, vizId, deltaEvent)
            : await this.computeView(indicatorId, contextType, contextId, activityId, vizId, true);
          if (result) {
            this.emitUpdated(indicatorId, indicator.name, contextType, contextId, result.value);
          }
        } catch (err) {
          this.logger.warn(
            `Refresh vue échoué - indicatorId=${indicatorId} contextType=${contextType} contextId=${contextId} viz=${vizId}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  /**
   * Équivalent de refreshActivityViews mais pour les indicateurs `group` course-aware
   * (isCourseAware) : rafraîchit toutes les valeurs déjà en cache pour ce cours, tous
   * groupes confondus. Si deltaEvent est fourni, tente un calcul incrémental via
   * computeViewIncremental() (0 requête SQL si le pipeline s'y prête et qu'un état
   * incrémental existe déjà pour ce cours) ; sinon, recalcul complet comme avant.
   */
  async refreshCourseGroupViews(indicatorId: string, courseId: string, deltaEvent?: DeltaEvent): Promise<void> {
    const indicator = await this.indicatorModel.findOne({ where: { id: indicatorId } });
    if (!indicator) return;

    const rows = await this.indicatorValueModel
      .createQueryBuilder('iv')
      .where('iv.indicatorId = :indicatorId', { indicatorId })
      .andWhere('iv.contextType = :type', { type: 'group' })
      .andWhere('iv.contextId LIKE :suffix', { suffix: `%:${courseId}` })
      .getMany();

    if (!rows.length) return;

    const groupIds = new Set(rows.map(r => r.contextId.split(':')[0]));
    const vizList = indicator.visualizations ?? [];

    for (const groupId of groupIds) {
      for (const vizId of (vizList.length ? vizList.map(v => v.id) : [undefined])) {
        try {
          const result = deltaEvent
            ? await this.computeViewIncremental(indicatorId, 'group', groupId, undefined, vizId, deltaEvent, courseId)
            : await this.computeView(indicatorId, 'group', groupId, undefined, vizId, true, courseId);
          if (result) {
            this.emitUpdated(indicatorId, indicator.name, 'group', groupId, result.value);
          }
        } catch (err) {
          this.logger.warn(
            `refreshCourseGroupViews échoué - indicatorId=${indicatorId} groupId=${groupId} courseId=${courseId}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  /**
   * Rafraîchit tous les contextes (teacher, admin, ou tout contextType futur) dont
   * les valeurs sont déjà en cache dans indicator_values. Utilisé quand on ne connaît
   * pas à l'avance les contextIds pertinents (ex: admin = 1 contexte "global" inconnu).
   * Si deltaEvent est fourni, tente un calcul incrémental via computeViewIncremental()
   * pour chaque ligne en cache ; sinon, recalcul complet comme avant.
   */
  async refreshCachedContextValues(indicatorId: string, contextType: string, deltaEvent?: DeltaEvent): Promise<void> {
    const indicator = await this.indicatorModel.findOne({ where: { id: indicatorId } });
    if (!indicator) return;

    const rows = await this.indicatorValueModel.find({ where: { indicatorId, contextType } });
    if (!rows.length) return;

    const vizList = indicator.visualizations ?? [];
    // Conserve le couple complet (contextId de base, suffixe éventuel) : une ligne en cache
    // peut être "globale" (contextId seul), scopée à une activité ou scopée à un cours
    // (voir isActivityAware()/isCourseAware()). Les fusionner en ne gardant que le contextId
    // de base referait recalculer/écraser la mauvaise ligne. Le suffixe est un activityId ou
    // un courseId selon ce que LA FORMULE déclare - jamais les deux à la fois, donc jamais
    // ambigu à interpréter une fois qu'on sait laquelle des deux elle utilise.
    const formula = resolveFormula(indicator);
    const suffixIsCourse = isCourseAware(formula);
    const uniqueCacheKeys = [...new Set(rows.map(r => r.contextId))];

    for (const cacheKey of uniqueCacheKeys) {
      const [contextId, suffix] = cacheKey.split(':');
      const activityId = suffixIsCourse ? undefined : suffix;
      const courseId = suffixIsCourse ? suffix : undefined;
      for (const vizId of (vizList.length ? vizList.map(v => v.id) : [undefined])) {
        try {
          const result = deltaEvent
            ? await this.computeViewIncremental(indicatorId, contextType, contextId, activityId, vizId, deltaEvent, courseId)
            : await this.computeView(indicatorId, contextType, contextId, activityId, vizId, true, courseId);
          if (result) {
            this.emitUpdated(indicatorId, indicator.name, contextType, contextId, result.value);
          }
        } catch (err) {
          this.logger.warn(
            `refreshCachedContextValues échoué - indicatorId=${indicatorId} contextType=${contextType} contextId=${cacheKey}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private calculateTrend(history: any[]): 'up' | 'down' | 'stable' | undefined {
    if (!history || history.length < 2) return undefined;
    const last = history[history.length - 1].value;
    const previous = history.slice(-6, -1).map(h => h.value);
    const avg = previous.reduce((a, b) => a + b, 0) / previous.length;
    if (last > avg * 1.05) return 'up';
    if (last < avg * 0.95) return 'down';
    return 'stable';
  }

  // ── Feedbacks ────────────────────────────────────────────────────────────────

  async submitFeedback(indicatorId: string, userId: string, rating: number, comment?: string): Promise<IndicatorFeedback> {
    if (!indicatorId || !userId) throw new BadRequestException('indicatorId et userId sont requis.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new BadRequestException('rating doit être un entier entre 1 et 5.');

    const feedback = this.feedbackModel.create({ indicatorId, userId, rating, comment: comment ?? null });
    return this.feedbackModel.save(feedback);
  }

  async getFeedbacks(indicatorId: string): Promise<{
    feedbacks: (IndicatorFeedback & { userName: string })[];
    count: number;
    averageRating: number;
  }> {
    const feedbacks = await this.feedbackModel.find({
      where: { indicatorId },
      order: { createdAt: 'DESC' },
    });
    const count = feedbacks.length;
    const averageRating = count > 0
      ? Math.round((feedbacks.reduce((s, f) => s + f.rating, 0) / count) * 10) / 10
      : 0;
    const userIds = [...new Set(feedbacks.map(f => f.userId))];
    const nameMap = await this.platonService.getUserNameMap(userIds);
    const enriched = feedbacks.map(f => ({ ...f, userName: nameMap[f.userId] ?? f.userId }));
    return { feedbacks: enriched, count, averageRating };
  }

  async sendNotification(indicatorId: string, title: string, message: string): Promise<IndicatorNotification> {
    if (!title?.trim() || !message?.trim())
      throw new BadRequestException('Le titre et le message sont requis.');
    const notif = this.notificationModel.create({ indicatorId, title: title.trim(), message: message.trim() });
    return this.notificationModel.save(notif);
  }

  async getNotifications(): Promise<IndicatorNotification[]> {
    return this.notificationModel.find({ order: { createdAt: 'DESC' } });
  }

  async deleteFeedback(indicatorId: string, feedbackId: string): Promise<void> {
    const feedback = await this.feedbackModel.findOne({ where: { id: feedbackId, indicatorId } });
    if (!feedback) throw new NotFoundException('Feedback introuvable.');
    await this.feedbackModel.remove(feedback);
  }
}
