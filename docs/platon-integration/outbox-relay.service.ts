import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

export const PLATON_EXCHANGE = 'platon.events';

/**
 * Relais des événements écrits dans platon_outbox_events (par les déclencheurs installés
 * depuis l'administration Indicateurs) vers RabbitMQ, pour que le microservice Indicateurs
 * les consomme presque en temps réel.
 *
 * Volontairement "bête" : republie chaque ligne telle quelle, sans l'interpréter. La
 * classification (quel événement métier - "exercice.completed", etc. - une ligne générique
 * représente) se fait côté Indicateurs, qui est seul à connaître les règles configurées par
 * son administration (IndicatorEventRule). Ce service n'a donc besoin de lire que sa propre
 * base, jamais celle d'Indicateurs.
 *
 * Prérequis (voir docs/integration-platon-relay.md pour le détail) :
 * - Tables `platon_outbox_events` (côté Indicateurs, api/scripts/migrations/platon-outbox.sql)
 *   et `indicateurs_outbox_cursor` (ce dossier, outbox-cursor.sql) déjà créées sur cette BDD.
 * - Dépendances npm : `@nestjs/schedule`, `@golevelup/nestjs-rabbitmq` (ou client AMQP
 *   équivalent - adapter cette classe si un autre choix est fait).
 * - Accès réseau sortant vers l'instance RabbitMQ d'Indicateurs (voir configuration ci-dessous,
 *   côté module).
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private isRunning = false;

  constructor(
    // Connexion par défaut de ce projet NestJS - remplacer par le token/nom réel si une
    // connexion nommée est utilisée (@InjectDataSource('nomDeLaConnexion')).
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly amqp: AmqpConnection,
  ) {}

  @Cron('*/2 * * * * *')
  async relay(): Promise<void> {
    if (this.isRunning) return; // évite les chevauchements si le traitement est lent
    this.isRunning = true;

    try {
      const cursorRows: { last_id: string }[] = await this.dataSource.query(
        `SELECT last_id FROM indicateurs_outbox_cursor WHERE id = 1`,
      );
      if (cursorRows.length === 0) {
        this.logger.error('Curseur indicateurs_outbox_cursor introuvable - voir outbox-cursor.sql');
        return;
      }
      const lastId = parseInt(cursorRows[0].last_id, 10);

      const rows: Array<{ id: string; event_type: string; payload: Record<string, any> }> =
        await this.dataSource.query(
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
          // "type" injecté depuis event_type : le payload JSON lui-même ne le contient pas.
          const message = { ...row.payload, type: row.event_type };
          await this.amqp.publish(PLATON_EXCHANGE, row.event_type, message);
          published++;
        } catch (err) {
          this.logger.error(`Publish échoué pour outbox id=${row.id}: ${(err as Error).message}`);
          // On arrête le batch : le curseur ne sera pas avancé, les événements seront retraités.
          break;
        }
      }

      if (published > 0) {
        const newLastId = rows[published - 1].id;
        await this.dataSource.query(
          `UPDATE indicateurs_outbox_cursor SET last_id = $1, updated_at = now() WHERE id = 1`,
          [newLastId],
        );
        this.logger.debug(`Relay : ${published} événement(s) publié(s) (curseur → ${newLastId})`);
      }
    } catch (err) {
      this.logger.error(`Relay échoué : ${(err as Error).message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
