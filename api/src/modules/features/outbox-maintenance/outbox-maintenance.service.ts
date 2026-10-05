import { Injectable, Logger, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

/** Purge de `platon_outbox_events` - la lecture/publication vers RabbitMQ est assurée par un relais côté LMS hôte. */
@Injectable()
export class OutboxMaintenanceService {
  private readonly logger = new Logger(OutboxMaintenanceService.name);

  constructor(
    @Inject('PLATON_DATA_SOURCE')
    private readonly platonDb: DataSource,
  ) {}

  /* Supprime les événements de plus de 7 jours pleins - borne depuis le début du jour (date_trunc), jour courant jamais compté. */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeOldEvents(): Promise<void> {
    try {
      /* RETURNING id plutôt que le format de retour de DataSource.query() sur DELETE (varie selon driver/version). */
      const deleted: { id: string }[] = await this.platonDb.query(
        `DELETE FROM platon_outbox_events
         WHERE created_at < date_trunc('day', now()) - INTERVAL '7 days'
         RETURNING id`,
      );
      if (deleted.length > 0) {
        this.logger.log(`Purge platon_outbox_events : ${deleted.length} ligne(s) de plus de 7 jours supprimée(s)`);
      }
    } catch (err) {
      this.logger.error(`Purge platon_outbox_events échouée : ${(err as Error).message}`);
    }
  }
}
