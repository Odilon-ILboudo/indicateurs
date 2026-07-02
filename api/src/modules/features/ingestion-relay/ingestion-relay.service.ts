import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { IngestionCursor } from '../ingestion/entities/ingestion-cursor.entity';

export const PLATON_EXCHANGE = 'platon.events';

@Injectable()
export class IngestionRelayService {
  private readonly logger = new Logger(IngestionRelayService.name);
  private isRunning = false;

  constructor(
    @Inject('PLATON_DATA_SOURCE')
    private readonly platonDb: DataSource,
    @InjectRepository(IngestionCursor, 'indicators')
    private readonly cursorRepo: Repository<IngestionCursor>,
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
          // Injecte "type" depuis la colonne event_type de l'outbox
          // (le trigger PLaTon ne met pas "type" dans le payload JSON)
          const message = { ...row.payload, type: row.event_type };
          await this.amqp.publish(PLATON_EXCHANGE, row.event_type, message);
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
}
