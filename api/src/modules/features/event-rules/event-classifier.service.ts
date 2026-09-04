import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndicatorEventRule, EventRuleCondition } from './indicator-event-rule.entity';

const RULE_CACHE_TTL_MS = 30_000;

export interface ClassifiedEvent {
  type: string;
  userId: string;
  courseId?: string;
  activityId?: string;
  sessionId?: string;
  payload: Record<string, any>;
}

/*
Interprète un événement générique brut (`{table, op, new, old}`, produit par un déclencheur
installé depuis l'admin) en 0..N événements métier, selon les IndicatorEventRule actives.
Utilisé par les consumers RabbitMQ (le relais, côté LMS hôte, ne fait que
transmettre les lignes de l'outbox telles quelles - voir docs/integration-platon-relay.md).
*/
@Injectable()
export class EventClassifierService {
  private ruleCache: IndicatorEventRule[] = [];
  private ruleCacheLoadedAt = 0;

  constructor(
    @InjectRepository(IndicatorEventRule, 'indicators')
    private readonly ruleRepo: Repository<IndicatorEventRule>,
  ) {}

  private async refreshRuleCache(): Promise<void> {
    if (Date.now() - this.ruleCacheLoadedAt < RULE_CACHE_TTL_MS) return;
    this.ruleCache = await this.ruleRepo.find({ where: { isActive: true } });
    this.ruleCacheLoadedAt = Date.now();
  }

  async classify(rawPayload: Record<string, any>): Promise<ClassifiedEvent[]> {
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
