import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { IngestionService, RawEvent } from './ingestion.service';
import { EventClassifierService } from '../event-rules/event-classifier.service';
import { PLATON_EXCHANGE } from './ingestion.constants';

export const QUEUE_LEARNER    = 'indicators.learner';
export const QUEUE_AGGREGATE  = 'indicators.aggregate';

@Injectable()
export class IngestionConsumerService {
  private readonly logger = new Logger(IngestionConsumerService.name);

  constructor(
    private readonly ingestionService: IngestionService,
    private readonly classifier: EventClassifierService,
  ) {}

  /*
  Le relais (côté LMS hôte, voir docs/integration-platon-relay.md) transmet les lignes de
  l'outbox telles quelles, sans les interpréter - `event_type` reste préfixé `raw:<Table>`
  pour tout déclencheur générique installé depuis l'admin. La classification en événement(s)
  métier réel(s) se fait donc ici, juste avant traitement, plutôt que dans le relais : les
  règles (`IndicatorEventRule`) vivent dans la base Indicateurs, pas celle du LMS hôte.
  */
  private async resolveEvents(raw: Record<string, any>): Promise<RawEvent[]> {
    if (typeof raw?.type === 'string' && raw.type.startsWith('raw:')) {
      const classified = await this.classifier.classify(raw);
      return classified.map(evt => ({
        type: evt.type,
        userId: evt.userId,
        courseId: evt.courseId,
        activityId: evt.activityId,
        sessionId: evt.sessionId,
        timestamp: new Date(),
        payload: evt.payload,
      }));
    }
    return [raw as RawEvent];
  }

  /*
  Consumer 1 : indicateurs Apprenant
  Reçoit tous les événements (routing '#'), filtrage fin fait dans IngestionService
  via requiredEvents.
  */
  @RabbitSubscribe({
    exchange: PLATON_EXCHANGE,
    routingKey: '#',
    queue: QUEUE_LEARNER,
    queueOptions: { durable: true },
  })
  async onLearnerEvent(raw: Record<string, any>): Promise<void> {
    const events = await this.resolveEvents(raw);
    let firstError: Error | undefined;
    for (const evt of events) {
      const t = Date.now();
      this.logger.log(`[learner] ← ${evt.type} user=${evt.userId}`);
      try {
        await this.ingestionService.ingestForContext(evt, 'learner');
        this.logger.log(`[learner] ✓ ${Date.now() - t}ms user=${evt.userId}`);
      } catch (err) {
        this.logger.error(`[learner] ✗ ${(err as Error).message}`);
        firstError ??= err as Error;
      }
    }
    /*
    Un seul throw, après avoir tenté tous les événements classifiés de ce message - sinon
    l'échec du premier empêcherait les suivants d'être traités.
    */
    if (firstError) throw firstError;
  }

  /*
  Consumer 2 : indicateurs Agrégats (tous les autres contextTypes)
  Séparé du consumer learner pour que les calculs lourds ne bloquent pas le score individuel.
  */
  @RabbitSubscribe({
    exchange: PLATON_EXCHANGE,
    routingKey: '#',
    queue: QUEUE_AGGREGATE,
    queueOptions: { durable: true },
  })
  async onAggregateEvent(raw: Record<string, any>): Promise<void> {
    const events = await this.resolveEvents(raw);
    let firstError: Error | undefined;
    for (const evt of events) {
      const t = Date.now();
      this.logger.log(`[aggregate] ← ${evt.type} user=${evt.userId}`);
      try {
        const affectedIndicators = await this.ingestionService.getAffectedIndicators(evt);
        const aggregateIndicators = affectedIndicators.filter(ind => ind.contextType !== 'learner');

        if (aggregateIndicators.length === 0) {
          this.logger.debug(`[aggregate] aucun indicateur agrégat pour event="${evt.type}"`);
          continue;
        }

        this.logger.log(`[aggregate] ${aggregateIndicators.length} indicateur(s) à traiter`);

        await Promise.allSettled(
          aggregateIndicators.map(ind =>
            this.ingestionService.processAggregateIndicator(ind, evt)
              .catch(e => this.logger.warn(`[aggregate] ind=${ind.id} (${ind.contextType}): ${e.message}`)),
          ),
        );

        this.logger.log(`[aggregate] ✓ ${Date.now() - t}ms`);
      } catch (err) {
        this.logger.error(`[aggregate] ✗ ${(err as Error).message}`);
        firstError ??= err as Error;
      }
    }
    if (firstError) throw firstError;
  }
}
