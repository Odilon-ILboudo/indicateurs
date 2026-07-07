import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { IngestionCursor } from '../ingestion/entities/ingestion-cursor.entity';
import { IndicatorEventRule, EventRuleCondition } from '../event-rules/indicator-event-rule.entity';

export const PLATON_EXCHANGE = 'platon.events';

const RULE_CACHE_TTL_MS = 30_000;

interface ClassifiedEvent {
  type: string;
  userId: string;
  courseId?: string;
  activityId?: string;
  sessionId?: string;
  payload: Record<string, any>;
}

@Injectable()
export class IngestionRelayService {
  private readonly logger = new Logger(IngestionRelayService.name);
  private isRunning = false;

  private ruleCache: IndicatorEventRule[] = [];
  private ruleCacheLoadedAt = 0;

  constructor(
    @Inject('PLATON_DATA_SOURCE')
    private readonly platonDb: DataSource,
    @InjectRepository(IngestionCursor, 'indicators')
    private readonly cursorRepo: Repository<IngestionCursor>,
    @InjectRepository(IndicatorEventRule, 'indicators')
    private readonly ruleRepo: Repository<IndicatorEventRule>,
    private readonly amqp: AmqpConnection,
  ) {}

  // ── Initialisation du curseur ─────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    const exists = await this.cursorRepo.findOne({ where: { streamName: 'platon_outbox' } });
    if (!exists) {
      await this.cursorRepo.save({ streamName: 'platon_outbox', lastId: '0' });
      this.logger.log('Curseur platon_outbox initialisé à 0');
    }
  }

  // ── Polling toutes les 2 secondes ─────────────────────────────────────────

  @Cron('*/2 * * * * *')
  async relay(): Promise<void> {
    if (this.isRunning) return; // évite les chevauchements si le traitement est lent
    this.isRunning = true;

    try {
      const cursor = await this.cursorRepo.findOne({ where: { streamName: 'platon_outbox' } });
      if (!cursor) return;

      const lastId = parseInt(cursor.lastId, 10);

      const rows: Array<{ id: string; event_type: string; payload: Record<string, any> }> =
        await this.platonDb.query(
          `SELECT id, event_type, payload
           FROM platon_outbox_events
           WHERE id > $1
           ORDER BY id ASC
           LIMIT 200`,
          [lastId],
        );

      if (rows.length === 0) return;

      let published = 0;
      for (const row of rows) {
        try {
          if (row.event_type.startsWith('raw:')) {
            // Événement générique brut (trigger installé via l'admin) : à classifier selon
            // les règles actives avant de savoir quel(s) event_type métier il représente.
            const classified = await this.classify(row.payload);
            for (const evt of classified) {
              const message = {
                ...evt.payload,
                type: evt.type,
                userId: evt.userId,
                courseId: evt.courseId,
                activityId: evt.activityId,
                sessionId: evt.sessionId,
              };
              await this.amqp.publish(PLATON_EXCHANGE, evt.type, message);
            }
            // 0 correspondance = ignoré silencieusement, pas de bruit 'raw:*' sur le bus.
          } else {
            // Injecte "type" depuis la colonne event_type de l'outbox
            // (le trigger PLaTon ne met pas "type" dans le payload JSON)
            const message = { ...row.payload, type: row.event_type };
            await this.amqp.publish(PLATON_EXCHANGE, row.event_type, message);
          }
          published++;
        } catch (err) {
          this.logger.error(`Publish échoué pour outbox id=${row.id}: ${(err as Error).message}`);
          // On arrête le batch : le curseur ne sera pas avancé, les events seront retraités
          break;
        }
      }

      if (published > 0) {
        const newLastId = rows[published - 1].id;
        await this.cursorRepo.update({ streamName: 'platon_outbox' }, { lastId: newLastId });
        this.logger.debug(`Relay : ${published} événements publiés (cursor → ${newLastId})`);
      }
    } catch (err) {
      this.logger.error(`Relay échoué : ${(err as Error).message}`);
    } finally {
      this.isRunning = false;
    }
  }

  // ── Classification des événements génériques ────────────────────────────

  private async refreshRuleCache(): Promise<void> {
    if (Date.now() - this.ruleCacheLoadedAt < RULE_CACHE_TTL_MS) return;
    this.ruleCache = await this.ruleRepo.find({ where: { isActive: true } });
    this.ruleCacheLoadedAt = Date.now();
  }

  private async classify(rawPayload: Record<string, any>): Promise<ClassifiedEvent[]> {
    await this.refreshRuleCache();

    const table = rawPayload?.table;
    const op = rawPayload?.op;
    const newRow = rawPayload?.new ?? {};
    const oldRow = rawPayload?.old ?? null;

    const matches: ClassifiedEvent[] = [];
    for (const rule of this.ruleCache) {
      if (rule.sourceTable !== table) continue;
      if (rule.operation === 'INSERT' && op !== 'INSERT') continue;
      if (rule.operation === 'UPDATE' && op !== 'UPDATE') continue;
      if (!this.evaluateCondition(rule.condition, rule.watchedColumn, newRow, oldRow)) continue;

      const userId = rule.contextMapping.userId ? newRow[rule.contextMapping.userId] : undefined;
      if (!userId) continue; // invariant RawEvent : userId obligatoire

      matches.push({
        type: rule.eventType.name,
        userId: String(userId),
        courseId: rule.contextMapping.courseId ? newRow[rule.contextMapping.courseId] : undefined,
        activityId: rule.contextMapping.activityId ? newRow[rule.contextMapping.activityId] : undefined,
        sessionId: rule.contextMapping.sessionId ? newRow[rule.contextMapping.sessionId] : undefined,
        payload: newRow,
      });
    }
    return matches;
  }

  private evaluateCondition(
    condition: EventRuleCondition,
    column: string | null,
    newRow: Record<string, any>,
    oldRow: Record<string, any> | null,
  ): boolean {
    if (condition.kind === 'always') return true;
    if (!column) return false;

    const newVal = newRow[column];
    const oldVal = oldRow ? oldRow[column] : undefined;

    switch (condition.kind) {
      case 'changed':
        return oldRow === null || newVal !== oldVal;
      case 'equals':
        return newVal === condition.value;
      case 'not_equals':
        return newVal !== condition.value;
      case 'threshold_crossed': {
        const passes = (v: any) => this.compareThreshold(v, condition.operator, condition.threshold);
        return passes(newVal) && !passes(oldVal);
      }
      default:
        return false;
    }
  }

  private compareThreshold(value: any, operator?: string, threshold?: number): boolean {
    if (threshold === undefined || value === undefined || value === null) return false;
    const v = Number(value);
    switch (operator) {
      case '>': return v > threshold;
      case '>=': return v >= threshold;
      case '<': return v < threshold;
      case '<=': return v <= threshold;
      default: return false;
    }
  }
}
