// src/ingestion/ingestion.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { IndicatorValue, buildValueMetadata } from '../indicators/entities/indicator-value.entity';
import { FormulaInterpreterService, CandidateRowsMap, GroupCandidateRowsMap } from '../indicators/interpreter/formula-interpreter.service';
import { IndicatorsService, DeltaEvent } from '../indicators/indicators.service';
import { PlatonService } from '../../core/platon/platon.service';
import { resolveFormula } from '../indicators/formula-resolution.util';

export interface RawEvent {
  type: string;
  userId: string;
  courseId?: string;
  activityId?: string;
  exerciseId?: string;
  sessionId?: string;
  timestamp: Date;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

@Injectable()
export class IngestionService implements OnModuleInit {
  private readonly logger = new Logger(IngestionService.name);
  private indicatorCache = new Map<string, IndicatorDefinition>(); // Clé = id
  private cacheLastUpdate = 0;
  private readonly CACHE_TTL = 60000;

  constructor(
    @InjectRepository(IndicatorDefinition, 'indicators')
    private indicatorDefinitionModel: Repository<IndicatorDefinition>,
    @InjectRepository(IndicatorValue, 'indicators')
    private indicatorValueModel: Repository<IndicatorValue>,
    private eventEmitter: EventEmitter2,
    private formulaInterpreter: FormulaInterpreterService,
    private indicatorsService: IndicatorsService,
    private platonService: PlatonService,
  ) {}

  async onModuleInit() {
    await this.refreshIndicatorCache();
    this.logger.log(`IngestionService initialized with ${this.indicatorCache.size} indicators`);
  }

  async ingestEvent(event: RawEvent): Promise<void> {
    const startTime = Date.now();
    
    try {
      if (!this.isValidEvent(event)) {
        this.logger.warn(`Invalid event received: ${JSON.stringify(event)}`);
        return;
      }

      const affectedIndicators = await this.findAffectedIndicators(event);
      
      if (affectedIndicators.length === 0) {
        this.logger.debug(`No indicators found for event type: ${event.type}`);
        return;
      }

      for (const indicator of affectedIndicators) {
        await this.processIndicatorUpdate(indicator, event);

        // Rafraîchit les snapshots et les vues course/group/activity en cache liés à cette
        // activité dès que les données changent
        if (event.activityId) {
          // Calcul différentiel sur événement : on passe les données brutes de l'événement
          // pour que refreshSnapshots/refreshActivityViews puissent mettre à jour uniquement
          // la session concernée sans re-fetch SQL complet (si la formule est éligible).
          const deltaEvent: DeltaEvent = { sessionId: event.sessionId, payload: event.payload };
          this.indicatorsService.refreshSnapshots(indicator.id, event.activityId, deltaEvent)
            .catch(err => this.logger.warn(`refreshSnapshots échoué pour indicator=${indicator.id}: ${err.message}`));
          this.indicatorsService.refreshActivityViews(indicator.id, event.activityId, deltaEvent)
            .catch(err => this.logger.warn(`refreshActivityViews échoué pour indicator=${indicator.id}: ${err.message}`));
        }
      }

      this.eventEmitter.emit('ingestion.event.processed', {
        eventType: event.type,
        indicatorsCount: affectedIndicators.length,
        processingTime: Date.now() - startTime,
      });

    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to ingest event: ${err.message}`, err.stack);
      this.eventEmitter.emit('ingestion.event.error', {
        eventType: event.type,
        error: err.message,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  async ingestBatch(events: RawEvent[]): Promise<{ total: number; processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    for (const event of events) {
      try {
        await this.ingestEvent(event);
        processed++;
      } catch (error) {
        failed++;
        this.logger.error(`Failed to process batch event: ${(error as Error).message}`);
      }
    }

    return { total: events.length, processed, failed };
  }

  private async findAffectedIndicators(event: RawEvent): Promise<IndicatorDefinition[]> {
    await this.refreshIndicatorCache();
    
    const affected: IndicatorDefinition[] = [];
    
    for (const indicator of this.indicatorCache.values()) {
      if (indicator.requiredEvents.includes(event.type)) {
        affected.push(indicator);
      }
    }
    
    return affected;
  }

  private async processIndicatorUpdate(indicator: IndicatorDefinition, event: RawEvent): Promise<void> {
    const contextType = 'learner';
    const contextId = event.userId;

    if (indicator.contextType !== contextType) {
      this.logger.debug(`Context ${contextType} not supported for indicator ${indicator.name}`);
      return;
    }

    const formula = resolveFormula(indicator);
    const hasDslFormula = (formula?.pipeline?.length ?? 0) > 0;

    let record = await this.indicatorValueModel.findOne({
      where: { indicatorId: indicator.id, contextType, contextId },
    });

    let newValue = 0;
    let rowValues: Record<string, number> | undefined;
    let groupRowValues: Record<string, Record<string, number>> | undefined;
    let candidateRows: CandidateRowsMap | undefined;
    let groupCandidateRows: GroupCandidateRowsMap | undefined;

    if (hasDslFormula) {
      const formulaContext = {
        userId: event.userId,
        activityId: event.activityId,
        courseId: event.courseId,
        indicatorId: indicator.id,
      };

      const shape = this.formulaInterpreter.getIncrementalShape(formula as any);

      if (shape?.findFirst) {
        // ── Chemin findFirst semi-incrémental ─────────────────────────────────
        // Stocke candidateRows ou groupCandidateRows : pour chaque session,
        // { sortValue, extractedValue, passes }. Sur événement, on met à jour
        // 1 entrée puis on re-scanne le groupe touché (O(n_groupe), 0 SQL).
        const helper = async () => {
          let sourceRow: Record<string, any>;
          if (shape.needsTargetedFetch) {
            const fetched = await this.formulaInterpreter.fetchSingleSessionRow(event.sessionId!, formulaContext, shape);
            sourceRow = fetched ?? event.payload ?? {};
          } else {
            sourceRow = event.payload ?? {};
          }

          const passesFilter = shape.filterSteps.every(fs =>
            this.formulaInterpreter.evaluateFilterRow(fs.params, sourceRow),
          );

          const { sortField, whereField, whereValue } = shape.findFirst!;
          const extractedValue = parseFloat(sourceRow[shape.extractField]);
          if (isNaN(extractedValue) || !passesFilter) return false;

          const entry = {
            sortValue: sortField ? sourceRow[sortField] : null,
            extractedValue,
            passes: whereField != null ? String(sourceRow[whereField]) === String(whereValue) : true,
          };

          if (shape.groupByField) {
            const existing = (record?.metadata as any)?.incremental?.groupCandidateRows as GroupCandidateRowsMap | undefined;
            if (existing === undefined) return false;
            const groupKey = String(sourceRow[shape.groupByField] ?? '__null__');
            const updated = { ...existing, [groupKey]: { ...(existing[groupKey] ?? {}), [event.sessionId!]: entry } };
            newValue = await this.formulaInterpreter.computeResultFromGroupCandidates(updated, shape);
            groupCandidateRows = updated;
          } else {
            const existing = (record?.metadata as any)?.incremental?.candidateRows as CandidateRowsMap | undefined;
            if (existing === undefined) return false;
            const updated = { ...existing, [event.sessionId!]: entry };
            newValue = await this.formulaInterpreter.computeResultFromCandidates(updated, shape);
            candidateRows = updated;
          }
          return true;
        };

        const incremental = event.sessionId ? await helper() : false;

        if (!incremental) {
          const computed = await this.formulaInterpreter.computeWithCandidateRows(formula as any, formulaContext, shape);
          newValue = computed.result;
          candidateRows = computed.candidateRows;
          groupCandidateRows = computed.groupCandidateRows;
        }

      } else if (shape?.groupByField) {
        // ── Chemin groupBy incrémental ────────────────────────────────────────
        // Stocke groupRowValues: { groupKey → { sessionId → valeur } } en metadata.
        // Sur événement, seul le groupe touché est recalculé (0 SQL si pas de join).
        const existingGroupRowValues = (record?.metadata as any)?.incremental?.groupRowValues as
          Record<string, Record<string, number>> | undefined;

        if (existingGroupRowValues !== undefined && event.sessionId) {
          // Résoudre la source : payload direct ou row fetchée si join nécessaire
          let sourceRow: Record<string, any>;
          if (shape.needsTargetedFetch) {
            const fetched = await this.formulaInterpreter.fetchSingleSessionRow(event.sessionId, formulaContext, shape);
            sourceRow = fetched ?? event.payload ?? {};
          } else {
            sourceRow = event.payload ?? {};
          }

          const groupKey = String(sourceRow[shape.groupByField] ?? '__null__');
          const passesFilter = shape.filterSteps.every(fs =>
            this.formulaInterpreter.evaluateFilterRow(fs.params, sourceRow),
          );

          // Copie superficielle du dictionnaire + copie profonde du groupe touché uniquement
          const newGroupRowValues = { ...existingGroupRowValues };
          newGroupRowValues[groupKey] = { ...(newGroupRowValues[groupKey] ?? {}) };

          if (passesFilter) {
            const rawVal = sourceRow[shape.extractField];
            const v = typeof rawVal === 'number' ? rawVal : parseFloat(rawVal);
            if (!isNaN(v)) newGroupRowValues[groupKey][event.sessionId] = v;
          } else {
            delete newGroupRowValues[groupKey][event.sessionId];
            if (Object.keys(newGroupRowValues[groupKey]).length === 0) {
              delete newGroupRowValues[groupKey];
            }
          }

          const allValues = Object.values(newGroupRowValues).flatMap(g => Object.values(g));
          newValue = await this.formulaInterpreter.applyPostSteps(allValues, shape.postSteps);
          groupRowValues = newGroupRowValues;
        }

        // Premier événement ou groupRowValues absent → calcul complet qui initialise l'état
        if (groupRowValues === undefined) {
          const computed = await this.formulaInterpreter.computeWithGroupRowMap(formula as any, formulaContext, shape);
          newValue = computed.result;
          groupRowValues = computed.groupRowValues;
        }

      } else {
        // ── Chemins existants (rowValues plat) ───────────────────────────────
        // Calcul incrémental pour fetch→[join*]→[filter*]→extract→aggregate.
        // Trois chemins selon la shape :
        //   1. Pas de join, pas de filter : lit depuis event.payload (0 SQL)
        //   2. Filter sans join           : évalue le filtre sur event.payload (0 SQL)
        //   3. Join (± filter)            : 1 SQL ciblé (1 ligne) + joins en mémoire
        const existingRowValues = (record?.metadata as any)?.incremental?.rowValues as Record<string, number> | undefined;

        if (shape && existingRowValues && event.sessionId) {
          if (shape.needsTargetedFetch) {
            const row = await this.formulaInterpreter.fetchSingleSessionRow(event.sessionId, formulaContext, shape);
            if (row !== null) {
              const passesFilter = shape.filterSteps.every(fs =>
                this.formulaInterpreter.evaluateFilterRow(fs.params, row),
              );
              const newRowValues = { ...existingRowValues };
              if (passesFilter) {
                const rawVal = parseFloat(row[shape.extractField]);
                if (!isNaN(rawVal)) newRowValues[event.sessionId] = rawVal;
              } else {
                delete newRowValues[event.sessionId];
              }
              rowValues = newRowValues;
              newValue = await this.formulaInterpreter.applyPostSteps(Object.values(rowValues), shape.postSteps);
            }
          } else if (shape.filterSteps.length > 0) {
            const passesFilter = shape.filterSteps.every(fs =>
              this.formulaInterpreter.evaluateFilterRow(fs.params, event.payload ?? {}),
            );
            const newRowValues = { ...existingRowValues };
            if (passesFilter) {
              const rawVal = event.payload?.[shape.extractField];
              const newRowVal = typeof rawVal === 'number' ? rawVal : parseFloat(rawVal);
              if (!isNaN(newRowVal)) newRowValues[event.sessionId] = newRowVal;
            } else {
              delete newRowValues[event.sessionId];
            }
            rowValues = newRowValues;
            newValue = await this.formulaInterpreter.applyPostSteps(Object.values(rowValues), shape.postSteps);
          } else {
            const rawVal = event.payload?.[shape.extractField];
            const newRowVal = typeof rawVal === 'number' ? rawVal : parseFloat(rawVal);
            if (!isNaN(newRowVal)) {
              rowValues = { ...existingRowValues, [event.sessionId]: newRowVal };
              newValue = await this.formulaInterpreter.applyPostSteps(Object.values(rowValues), shape.postSteps);
            }
          }
        }

        // Premier événement ou rowValues absent → calcul complet
        if (rowValues === undefined) {
          if (shape) {
            const computed = await this.formulaInterpreter.computeWithRowMap(formula as any, formulaContext, shape);
            newValue = computed.result;
            rowValues = computed.rowValues;
          } else {
            newValue = await this.formulaInterpreter.interpret(formula as any, formulaContext);
          }
        }
      }
    }

    const extraMetadata = rowValues
      ? { incremental: { rowValues } }
      : groupRowValues
        ? { incremental: { groupRowValues } }
        : candidateRows
          ? { incremental: { candidateRows } }
          : groupCandidateRows
            ? { incremental: { groupCandidateRows } }
            : {};

    if (record) {
      if (hasDslFormula) {
        const prevValue = record.value;
        record.value = newValue;
        record.metadata = buildValueMetadata(record.metadata, newValue, extraMetadata);
        await this.indicatorValueModel.save(record);
        this.logger.log(
          `[indicator] ✓ mis à jour "${indicator.name}" (${contextType}) ` +
          `user=${contextId} : ${prevValue} → ${newValue}` +
          (rowValues ? ' [incrémental]' : ' [complet]'),
        );
      }
    } else {
      record = this.indicatorValueModel.create({
        indicatorId: indicator.id,
        contextType,
        contextId,
        value: newValue,
        metadata: buildValueMetadata(null, newValue, extraMetadata),
      });
      await this.indicatorValueModel.save(record);
      this.logger.log(
        `[indicator] ✓ créé "${indicator.name}" (${contextType}) ` +
        `user=${contextId} : valeur initiale = ${newValue}`,
      );
    }

    this.eventEmitter.emit('indicator.updated', {
      indicatorId: indicator.id,
      indicatorName: indicator.name,
      contextType,
      contextId,
      value: newValue,
      eventType: event.type,
      timestamp: event.timestamp,
    });
  }

  private async refreshIndicatorCache(): Promise<void> {
    const now = Date.now();
    
    if (now - this.cacheLastUpdate < this.CACHE_TTL && this.indicatorCache.size > 0) {
      return;
    }
    
    try {
      const indicators = await this.indicatorDefinitionModel.find({
        where: { isActive: true }
      });
      
      this.indicatorCache.clear();
      for (const indicator of indicators) {
        this.indicatorCache.set(indicator.id, indicator);
      }
      
      this.cacheLastUpdate = now;
      this.logger.debug(`Cache refreshed: ${this.indicatorCache.size} indicators loaded`);
    } catch (error) {
      this.logger.error(`Failed to refresh cache: ${(error as Error).message}`);
    }
  }

  private isValidEvent(event: RawEvent): boolean {
    if (!event.type) {
      this.logger.warn('Event missing type');
      return false;
    }
    
    if (!event.userId) {
      this.logger.warn('Event missing userId');
      return false;
    }
    
    if (!event.timestamp) {
      event.timestamp = new Date();
    }
    
    return true;
  }

  // ── API publique pour les consumers RabbitMQ ─────────────────────────────

  /** Retourne les indicateurs affectés par cet événement (exposé pour le consumer de groupe). */
  async getAffectedIndicators(event: RawEvent) {
    return this.findAffectedIndicators(event);
  }

  /**
   * Traite un événement uniquement pour les indicateurs du contextType donné.
   * Utilisé par les consumers RabbitMQ pour paralléliser le traitement par niveau.
   */
  async ingestForContext(event: RawEvent, contextType: string): Promise<void> {
    if (!this.isValidEvent(event)) return;

    const affectedIndicators = await this.findAffectedIndicators(event);
    const filtered = affectedIndicators.filter(ind => ind.contextType === contextType);

    if (filtered.length === 0) {
      this.logger.debug(`[${contextType}] aucun indicateur actif pour event="${event.type}"`);
      return;
    }

    this.logger.log(`[${contextType}] ${filtered.length} indicateur(s) à traiter pour event="${event.type}" user=${event.userId}`);

    for (const indicator of filtered) {
      if (contextType === 'learner') {
        await this.processIndicatorUpdate(indicator, event);
      } else if (contextType === 'activity' && event.activityId) {
        // Pour les indicateurs d'activité, computeView avec forceRefresh
        await this.indicatorsService
          .computeView(indicator.id, 'activity', event.activityId, event.activityId, undefined, true)
          .catch(e => this.logger.warn(`[activity] computeView échoué ind=${indicator.id}: ${e.message}`));
      }
    }
  }

  /**
   * Traite un indicateur non-learner : dispatch selon contextType.
   * Le case `default` couvre tout contextType futur sans modification du consumer.
   */
  async processAggregateIndicator(indicator: IndicatorDefinition, event: RawEvent): Promise<void> {
    const deltaEvent: DeltaEvent = { sessionId: event.sessionId, payload: event.payload };

    switch (indicator.contextType) {

      case 'activity': {
        if (!event.activityId) return;
        const result = await this.indicatorsService
          .computeView(indicator.id, 'activity', event.activityId, event.activityId, undefined, true)
          .catch(e => { this.logger.warn(`[activity] computeView échoué ind=${indicator.id}: ${e.message}`); return null; });
        if (result) {
          this.emitUpdated(indicator, 'activity', event.activityId, result.value);
        }
        break;
      }

      case 'course': {
        if (!event.courseId) return;
        const result = await this.indicatorsService
          .computeView(indicator.id, 'course', event.courseId, event.activityId, undefined, true)
          .catch(e => { this.logger.warn(`[course] computeView échoué ind=${indicator.id}: ${e.message}`); return null; });
        if (result) {
          this.emitUpdated(indicator, 'course', event.courseId, result.value);
        }
        break;
      }

      case 'group': {
        if (!event.activityId) return;
        // refreshSnapshots et refreshActivityViews émettent WS eux-mêmes après chaque calcul
        await Promise.allSettled([
          this.indicatorsService.refreshSnapshots(indicator.id, event.activityId, deltaEvent)
            .catch(e => this.logger.warn(`[group] refreshSnapshots échoué ind=${indicator.id}: ${e.message}`)),
          this.indicatorsService.refreshActivityViews(indicator.id, event.activityId, deltaEvent)
            .catch(e => this.logger.warn(`[group] refreshActivityViews échoué ind=${indicator.id}: ${e.message}`)),
        ]);
        break;
      }

      case 'teacher': {
        if (!event.courseId) return;
        const teacherId = await this.platonService.getTeacherByCourse(event.courseId)
          .catch(e => { this.logger.warn(`[teacher] getTeacherByCourse échoué: ${e.message}`); return null; });
        if (!teacherId) return;
        const result = await this.indicatorsService
          .computeView(indicator.id, 'teacher', teacherId, event.activityId, undefined, true)
          .catch(e => { this.logger.warn(`[teacher] computeView échoué ind=${indicator.id}: ${e.message}`); return null; });
        if (result) {
          this.emitUpdated(indicator, 'teacher', teacherId, result.value);
        }
        break;
      }

      // admin et tout contextType futur : rafraîchit les valeurs déjà en cache
      default: {
        await this.indicatorsService
          .refreshCachedContextValues(indicator.id, indicator.contextType)
          .catch(e => this.logger.warn(`[${indicator.contextType}] refreshCached échoué ind=${indicator.id}: ${e.message}`));
        break;
      }
    }
  }

  private emitUpdated(indicator: IndicatorDefinition, contextType: string, contextId: string, value: number): void {
    this.eventEmitter.emit('indicator.updated', {
      indicatorId: indicator.id,
      indicatorName: indicator.name,
      contextType,
      contextId,
      value,
      eventType: 'refresh',
      timestamp: new Date(),
    });
  }

  async getIngestionStats(): Promise<{ cachedIndicators: number; cacheAge: number }> {
    return {
      cachedIndicators: this.indicatorCache.size,
      cacheAge: Date.now() - this.cacheLastUpdate,
    };
  }

  async resetIndicator(indicatorId: string, contextId?: string): Promise<void> {
    const query: any = { indicatorId: indicatorId };
    if (contextId) {
      query.contextId = contextId;
    }
    
    await this.indicatorValueModel.delete(query);
    this.logger.log(`Reset indicator ${indicatorId}${contextId ? ` for ${contextId}` : ''}`);
  }
}