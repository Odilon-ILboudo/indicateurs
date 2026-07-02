import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { IngestionService, RawEvent } from './ingestion.service';
import { PLATON_EXCHANGE } from '../ingestion-relay/ingestion-relay.service';

export const QUEUE_LEARNER    = 'indicators.learner';
export const QUEUE_AGGREGATE  = 'indicators.aggregate';

@Injectable()
export class IngestionConsumerService {
  private readonly logger = new Logger(IngestionConsumerService.name);

  constructor(private readonly ingestionService: IngestionService) {}

  // ── Consumer 1 : indicateurs Apprenant ───────────────────────────────────
  // Reçoit TOUS les types d'événements (routing '#') et traite uniquement les
  // indicateurs contextType='learner'. Le filtrage fin se fait dans IngestionService
  // via requiredEvents : si l'événement reçu ne figure pas dans requiredEvents de
  // l'indicateur, il est ignoré — la routing key large n'entraîne pas de surcharge.
  @RabbitSubscribe({
    exchange: PLATON_EXCHANGE,
    routingKey: '#',
    queue: QUEUE_LEARNER,
    queueOptions: { durable: true },
  })
  async onLearnerEvent(raw: RawEvent): Promise<void> {
    const t = Date.now();
    this.logger.log(`[learner] ← ${raw.type} user=${raw.userId}`);
    try {
      await this.ingestionService.ingestForContext(raw, 'learner');
      this.logger.log(`[learner] ✓ ${Date.now() - t}ms user=${raw.userId}`);
    } catch (err) {
      this.logger.error(`[learner] ✗ ${(err as Error).message}`);
      throw err;
    }
  }

  // ── Consumer 2 : indicateurs Agrégats (tous les autres contextTypes) ─────
  // Gère activity, course, group, teacher, admin et tout contextType futur.
  // Séparé du consumer learner pour que les calculs lourds (agrégats multi-étudiants)
  // ne bloquent pas la mise à jour du score individuel.
  @RabbitSubscribe({
    exchange: PLATON_EXCHANGE,
    routingKey: '#',
    queue: QUEUE_AGGREGATE,
    queueOptions: { durable: true },
  })
  async onAggregateEvent(raw: RawEvent): Promise<void> {
    const t = Date.now();
    this.logger.log(`[aggregate] ← ${raw.type} user=${raw.userId}`);
    try {
      const affectedIndicators = await this.ingestionService.getAffectedIndicators(raw);
      const aggregateIndicators = affectedIndicators.filter(ind => ind.contextType !== 'learner');

      if (aggregateIndicators.length === 0) {
        this.logger.debug(`[aggregate] aucun indicateur agrégat pour event="${raw.type}"`);
        return;
      }

      this.logger.log(`[aggregate] ${aggregateIndicators.length} indicateur(s) à traiter`);

      await Promise.allSettled(
        aggregateIndicators.map(ind =>
          this.ingestionService.processAggregateIndicator(ind, raw)
            .catch(e => this.logger.warn(`[aggregate] ind=${ind.id} (${ind.contextType}): ${e.message}`)),
        ),
      );

      this.logger.log(`[aggregate] ✓ ${Date.now() - t}ms`);
    } catch (err) {
      this.logger.error(`[aggregate] ✗ ${(err as Error).message}`);
      throw err;
    }
  }
}
