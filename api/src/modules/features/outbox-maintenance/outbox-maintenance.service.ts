import { Injectable, Logger, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
Purge de `platon_outbox_events` (BDD PLaTon). La lecture/publication vers RabbitMQ est
assurée par un relais côté LMS hôte (voir docs/integration-platon-relay.md).
*/
@Injectable()
export class OutboxMaintenanceService {
  private readonly logger = new Logger(OutboxMaintenanceService.name);

  constructor(
    @Inject('PLATON_DATA_SOURCE')
    private readonly platonDb: DataSource,
  ) {}

  /* Supprime les événements déjà relayés depuis plus de 7 jours pleins. Borne calculée
   depuis le début du jour courant (date_trunc), pas depuis l'instant présent (now()) :
   le jour en cours n'est jamais compté dans les 7 jours de rétention, quelle que soit
   l'heure à laquelle cette tâche tourne.
  */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeOldEvents(): Promise<void> {
    try {
      /*
      RETURNING id plutôt que de se fier au format de retour de DataSource.query() sur un
      DELETE (varie selon driver/version) : compter la longueur du tableau est sans ambiguïté.
      */
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
