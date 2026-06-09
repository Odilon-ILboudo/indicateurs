// src/ingestion/ingestion.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { IndicatorValue } from '../indicators/entities/indicator-value.entity';
import { FormulaInterpreterService } from '../indicators/interpreter/formula-interpreter.service';
import { IndicatorsService } from '../indicators/indicators.service';

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

        // Rafraîchit les snapshots liés à cette activité dès que les données changent
        if (event.activityId) {
          this.indicatorsService.refreshSnapshots(indicator.id, event.activityId)
            .catch(err => this.logger.warn(`refreshSnapshots échoué pour indicator=${indicator.id}: ${err.message}`));
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

    let newValue = 0;
    const hasDslFormula = (indicator.formula?.pipeline?.length ?? 0) > 0;

    if (hasDslFormula) {
      newValue = await this.formulaInterpreter.interpret(indicator.formula as any, {
        userId: event.userId,
        activityId: event.activityId,
        courseId: event.courseId,
        indicatorId: indicator.id,
      });
    }

    let record = await this.indicatorValueModel.findOne({
      where: { indicatorId: indicator.id, contextType, contextId },
    });

    if (record) {
      if (hasDslFormula) {
        record.value = newValue;
        record.metadata = {
          ...record.metadata,
          lastUpdate: event.timestamp,
        };
        await this.indicatorValueModel.save(record);
      }
    } else {
      record = this.indicatorValueModel.create({
        indicatorId: indicator.id,
        contextType,
        contextId,
        value: newValue,
        metadata: {
          createdAt: event.timestamp,
          lastUpdate: event.timestamp,
          history: [],
        },
      });
      await this.indicatorValueModel.save(record);
    }

    this.eventEmitter.emit(`indicator.${indicator.name}.updated`, {
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