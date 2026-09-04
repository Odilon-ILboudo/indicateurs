import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { IndicatorValue } from '../indicators/entities/indicator-value.entity';
import { IndicatorsService, DeltaEvent } from '../indicators/indicators.service';
import { PlatonService } from '../../core/platon/platon.service';
import { resolveFormula, isCourseAware } from '../indicators/formula-resolution.util';

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
    private indicatorsService: IndicatorsService,
    private platonService: PlatonService,
  ) {}

  async onModuleInit() {
    await this.refreshIndicatorCache();
    this.logger.log(`IngestionService initialized with ${this.indicatorCache.size} indicators`);
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

  // API publique pour les consumers RabbitMQ

  // Retourne les indicateurs affectés par cet événement (exposé pour le consumer de groupe)
  async getAffectedIndicators(event: RawEvent) {
    return this.findAffectedIndicators(event);
  }

  /* Traite un événement pour les indicateurs d'un contextType donné, utilisé par les
   consumers RabbitMQ. Routage basé sur l'éligibilité du pipeline (computeViewIncremental),
   jamais sur le périmètre : c'est elle qui décide s'il faut recalculer entièrement ou non.
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
    const deltaEvent: DeltaEvent = { sessionId: event.sessionId, payload: event.payload };

    for (const indicator of filtered) {
      if (contextType === 'learner') {
        /*
        courseId n'est résolu (requête PLaTon) que si la formule en a réellement besoin -
        computeViewIncremental choisit ensuite lui-même activityId ou courseId, ou aucun des
        deux, selon ce que LA FORMULE déclare (isActivityAware/isCourseAware).
        */
        const formula = resolveFormula(indicator);
        let courseId: string | undefined;
        if (formula && isCourseAware(formula)) {
          courseId = event.courseId ?? (event.activityId
            ? (await this.platonService.getCourseIdForActivity(event.activityId)
                .catch(e => { this.logger.warn(`[learner] getCourseIdForActivity échoué: ${e.message}`); return undefined; })) ?? undefined
            : undefined);
          if (!courseId) continue;
        }
        const result = await this.indicatorsService
          .computeViewIncremental(indicator.id, 'learner', event.userId, event.activityId, undefined, deltaEvent, courseId)
          .catch(e => { this.logger.warn(`[learner] computeViewIncremental échoué ind=${indicator.id}: ${e.message}`); return null; });
        if (result) this.emitUpdated(indicator, 'learner', event.userId, result.value);
      } else if (contextType === 'activity' && event.activityId) {
        const result = await this.indicatorsService
          .computeViewIncremental(indicator.id, 'activity', event.activityId, event.activityId, undefined, deltaEvent)
          .catch(e => { this.logger.warn(`[activity] computeViewIncremental échoué ind=${indicator.id}: ${e.message}`); return null; });
        if (result) this.emitUpdated(indicator, 'activity', event.activityId, result.value);
      }
    }
  }

  /* Traite un indicateur non-learner, dispatch selon contextType. Chaque branche tente le
   calcul différentiel et ne retombe sur un recalcul complet que si nécessaire.
  */
  async processAggregateIndicator(indicator: IndicatorDefinition, event: RawEvent): Promise<void> {
    const deltaEvent: DeltaEvent = { sessionId: event.sessionId, payload: event.payload };

    switch (indicator.contextType) {

      case 'activity': {
        if (!event.activityId) return;
        const result = await this.indicatorsService
          .computeViewIncremental(indicator.id, 'activity', event.activityId, event.activityId, undefined, deltaEvent)
          .catch(e => { this.logger.warn(`[activity] computeViewIncremental échoué ind=${indicator.id}: ${e.message}`); return null; });
        if (result) {
          this.emitUpdated(indicator, 'activity', event.activityId, result.value);
        }
        break;
      }

      case 'course': {
        if (!event.courseId) return;
        const result = await this.indicatorsService
          .computeViewIncremental(indicator.id, 'course', event.courseId, event.activityId, undefined, deltaEvent)
          .catch(e => { this.logger.warn(`[course] computeViewIncremental échoué ind=${indicator.id}: ${e.message}`); return null; });
        if (result) {
          this.emitUpdated(indicator, 'course', event.courseId, result.value);
        }
        break;
      }

      case 'group': {
        if (!event.activityId) return;

        if (isCourseAware(resolveFormula(indicator))) {
          /*
          Groupe scopé à tout le cours (toutes activités confondues) : la ligne en
          cache est identifiée par courseId, pas par activityId, un rafraîchissement
          dédié est nécessaire (voir refreshCourseGroupViews).
          */
          const courseId = event.courseId ?? await this.platonService.getCourseIdForActivity(event.activityId)
            .catch(e => { this.logger.warn(`[group] getCourseIdForActivity échoué: ${e.message}`); return null; });
          if (!courseId) return;
          await Promise.allSettled([
            this.indicatorsService.refreshSnapshots(indicator.id, { courseId }, deltaEvent)
              .catch(e => this.logger.warn(`[group] refreshSnapshots (cours) échoué ind=${indicator.id}: ${e.message}`)),
            this.indicatorsService.refreshCourseGroupViews(indicator.id, courseId, deltaEvent)
              .catch(e => this.logger.warn(`[group] refreshCourseGroupViews échoué ind=${indicator.id}: ${e.message}`)),
          ]);
          break;
        }

        // refreshSnapshots et refreshActivityViews émettent WS eux-mêmes après chaque calcul
        await Promise.allSettled([
          this.indicatorsService.refreshSnapshots(indicator.id, { activityId: event.activityId }, deltaEvent)
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
        /*
        computeViewIncremental choisit lui-même activityId ou courseId selon ce que la formule
        déclare (isActivityAware/isCourseAware) - les deux peuvent être transmis sans risque.
        */
        const result = await this.indicatorsService
          .computeViewIncremental(indicator.id, 'teacher', teacherId, event.activityId, undefined, deltaEvent, event.courseId)
          .catch(e => { this.logger.warn(`[teacher] computeViewIncremental échoué ind=${indicator.id}: ${e.message}`); return null; });
        if (result) {
          this.emitUpdated(indicator, 'teacher', teacherId, result.value);
        }
        break;
      }

      /*
      admin et tout contextType futur : rafraîchit les valeurs déjà en cache (différentiel si
      le pipeline s'y prête, recalcul complet sinon - voir refreshCachedContextValues)
      */
      default: {
        await this.indicatorsService
          .refreshCachedContextValues(indicator.id, indicator.contextType, deltaEvent)
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