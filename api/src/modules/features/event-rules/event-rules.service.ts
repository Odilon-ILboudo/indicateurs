import { Injectable, Inject, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import { Client } from 'pg';
import {
  IndicatorEventRule,
  EventRuleContextMapping,
} from './indicator-event-rule.entity';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { EventTypesService } from '../event-types/event-types.service';
import { PlatonService } from '../../core/platon/platon.service';
import { CreateEventRuleDto, UpdateEventRuleDto } from './dto/event-rule.dto';

@Injectable()
export class EventRulesService {
  private readonly logger = new Logger(EventRulesService.name);

  constructor(
    @InjectRepository(IndicatorEventRule, 'indicators')
    private readonly repo: Repository<IndicatorEventRule>,
    @InjectRepository(IndicatorDefinition, 'indicators')
    private readonly indicatorRepo: Repository<IndicatorDefinition>,
    private readonly eventTypesSvc: EventTypesService,
    private readonly platonSvc: PlatonService,
    private readonly config: ConfigService,
    @Inject('PLATON_DATA_SOURCE')
    private readonly platonDb: DataSource,
  ) {}

  /** Retourne TOUTES les règles, actives ou non - la désactivation ne doit jamais les rendre invisibles. */
  findAll(): Promise<IndicatorEventRule[]> {
    return this.repo.find({ order: { isActive: 'DESC', createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<IndicatorEventRule> {
    const rule = await this.repo.findOne({ where: { id } });
    if (!rule) throw new NotFoundException(`Règle ${id} introuvable`);
    return rule;
  }

  async create(dto: CreateEventRuleDto): Promise<IndicatorEventRule> {
    await this.platonSvc.assertValidTableColumn(dto.sourceTable, dto.watchedColumn ?? null);
    this.assertContextMapping(dto.sourceTable, dto.contextMapping);

    let eventTypeId = dto.eventTypeId;
    if (!eventTypeId && dto.newEventType) {
      const created = await this.eventTypesSvc.create(dto.newEventType);
      eventTypeId = created.id;
    }
    if (!eventTypeId) throw new NotFoundException('eventTypeId ou newEventType requis');

    return this.repo.save({
      eventTypeId,
      sourceTable: dto.sourceTable,
      watchedColumn: dto.watchedColumn ?? null,
      operation: dto.operation,
      condition: dto.condition,
      contextMapping: dto.contextMapping,
      isActive: true,
      triggerInstalled: false,
    });
  }

  async update(id: string, dto: UpdateEventRuleDto): Promise<IndicatorEventRule> {
    const rule = await this.findOne(id);

    const sourceTable = dto.sourceTable ?? rule.sourceTable;
    const watchedColumn = dto.watchedColumn !== undefined ? dto.watchedColumn : rule.watchedColumn;
    if (dto.sourceTable || dto.watchedColumn !== undefined) {
      await this.platonSvc.assertValidTableColumn(sourceTable, watchedColumn);
    }
    if (dto.contextMapping) this.assertContextMapping(sourceTable, dto.contextMapping);

    const structuralChange = (dto.sourceTable && dto.sourceTable !== rule.sourceTable)
      || (dto.watchedColumn !== undefined && dto.watchedColumn !== rule.watchedColumn)
      || (dto.operation && dto.operation !== rule.operation);

    Object.assign(rule, {
      sourceTable,
      watchedColumn,
      operation: dto.operation ?? rule.operation,
      condition: dto.condition ?? rule.condition,
      contextMapping: dto.contextMapping ?? rule.contextMapping,
    });

    if (structuralChange && rule.triggerInstalled) {
      rule.triggerInstalled = false;
      rule.installedAt = null;
      rule.lastAppliedSql = null;
    }

    return this.repo.save(rule);
  }

  async remove(id: string): Promise<void> {
    const rule = await this.findOne(id);
    await this.assertNoActiveIndicatorDependency(rule);
    rule.isActive = false;
    await this.repo.save(rule);
  }

  /** Réactive une règle désactivée. Ne réinstalle pas le trigger tout seul si `triggerInstalled`
   *  est déjà à false (l'admin doit relancer "Installer" explicitement, comme pour une nouvelle règle). */
  async reactivate(id: string): Promise<IndicatorEventRule> {
    const rule = await this.findOne(id);
    rule.isActive = true;
    return this.repo.save(rule);
  }

  // ── Suppression DÉFINITIVE (distincte de remove() ci-dessus, qui ne fait que désactiver) ──
  // Si le trigger est installé, le désinstalle d'abord (même DDL que deleteAndUninstall) puis
  // supprime réellement la ligne en base. Jamais automatique - toujours un aperçu SQL + clic
  // explicite côté admin quand un DDL est impliqué.

  async previewHardDeleteSql(id: string): Promise<{ sql: string }> {
    const rule = await this.findOne(id);
    if (!rule.triggerInstalled) return { sql: '' };
    const sql = await this.buildUninstallDdl(rule);
    return { sql };
  }

  async hardDelete(id: string): Promise<{ success: boolean; message?: string; sql: string }> {
    const rule = await this.findOne(id);
    await this.assertNoActiveIndicatorDependency(rule);

    if (rule.triggerInstalled) {
      const sql = await this.buildUninstallDdl(rule);
      try {
        await this.execDdl(sql);
      } catch (err) {
        const message = this.friendlyError(err as Error);
        rule.lastInstallError = message;
        await this.repo.save(rule);
        return { success: false, message, sql };
      }
      await this.repo.remove(rule);
      return { success: true, sql };
    }

    await this.repo.remove(rule);
    return { success: true, sql: '' };
  }

  // ── Suppression + désinstallation du trigger (jamais automatique) ───────────
  // Contrairement à remove() ci-dessus (désactivation simple, le trigger reste en place),
  // cette méthode retire aussi le trigger PostgreSQL réel s'il était installé - en le
  // supprimant complètement s'il n'est plus utilisé par aucune autre règle active sur la
  // même table, ou en le réduisant (recalcul des colonnes surveillées) si d'autres règles
  // actives en dépendent encore.

  async previewUninstallSql(id: string): Promise<{ sql: string }> {
    const rule = await this.findOne(id);
    const sql = await this.buildUninstallDdl(rule);
    return { sql };
  }

  async deleteAndUninstall(id: string): Promise<{ success: boolean; message?: string; sql: string }> {
    const rule = await this.findOne(id);
    await this.assertNoActiveIndicatorDependency(rule);

    if (!rule.triggerInstalled) {
      rule.isActive = false;
      await this.repo.save(rule);
      return { success: true, sql: '' };
    }

    const sql = await this.buildUninstallDdl(rule);
    try {
      await this.execDdl(sql);
      rule.isActive = false;
      rule.triggerInstalled = false;
      rule.installedAt = null;
      rule.lastAppliedSql = sql;
      rule.lastInstallError = null;
      await this.repo.save(rule);
      return { success: true, sql };
    } catch (err) {
      const message = this.friendlyError(err as Error);
      rule.lastInstallError = message;
      await this.repo.save(rule);
      return { success: false, message, sql };
    }
  }

  // ── Installation du trigger (jamais automatique - appelée uniquement sur clic admin) ──

  async previewInstallSql(id: string): Promise<{ sql: string }> {
    const rule = await this.findOne(id);
    const sql = await this.buildDdl(rule);
    return { sql };
  }

  async installTrigger(id: string): Promise<{ success: boolean; message?: string; sql: string }> {
    const rule = await this.findOne(id);
    const sql = await this.buildDdl(rule);
    try {
      await this.execDdl(sql);
      rule.triggerInstalled = true;
      rule.installedAt = new Date();
      rule.lastAppliedSql = sql;
      rule.lastInstallError = null;
      await this.repo.save(rule);
      return { success: true, sql };
    } catch (err) {
      const message = this.friendlyError(err as Error);
      rule.lastInstallError = message;
      await this.repo.save(rule);
      return { success: false, message, sql };
    }
  }

  private friendlyError(err: Error): string {
    if (/must be owner|permission denied/i.test(err.message)) {
      return `Droits insuffisants sur la base PLaTon pour créer ce trigger. ` +
        `Configurez PLATON_DB_ADMIN_USERNAME/PASSWORD (identifiant Postgres propriétaire de la table, ou superuser) pour que l'installation s'exécute directement avec ces droits, ` +
        `ou exécutez le SQL ci-dessous manuellement par un administrateur de la base. Détail : ${err.message}`;
    }
    return `Échec de l'installation : ${err.message}`;
  }

  // ── Exécution du DDL (installation ou désinstallation) ───────────────────
  // Si PLATON_DB_ADMIN_USERNAME/PASSWORD sont configurés, le DDL s'exécute directement via
  // cette connexion (qui a déjà les droits nécessaires - pas besoin de savoir qui possède
  // la table, ni de changer/restaurer un ownership). Sinon, tentative avec la connexion
  // applicative habituelle (échoue avec le message ci-dessus si les droits manquent).
  private async execDdl(sql: string): Promise<void> {
    const adminUsername = this.config.get<string>('platonDatabaseAdmin.username');
    const adminPassword = this.config.get<string>('platonDatabaseAdmin.password');
    if (!adminUsername || !adminPassword) {
      await this.platonDb.query(sql);
      return;
    }

    const admin = new Client({
      host: this.config.get<string>('platonDatabase.host'),
      port: this.config.get<number>('platonDatabase.port'),
      database: this.config.get<string>('platonDatabase.database'),
      user: adminUsername,
      password: adminPassword,
    });
    await admin.connect();
    try {
      await admin.query(sql);
    } finally {
      await admin.end();
    }
  }

  private assertContextMapping(sourceTable: string, mapping: EventRuleContextMapping): void {
    if (!mapping?.userId) throw new NotFoundException('contextMapping.userId est obligatoire (RawEvent.userId est requis pour tout événement)');
  }

  /** Le lien entre un indicateur et une règle se fait par le NOM de l'event type
   *  (IndicatorDefinition.requiredEvents contient des noms, pas des ids de règle) - donc
   *  bloque dès qu'un indicateur actif référence ce nom, même si d'autres règles actives
   *  partagent le même eventTypeId (pas de faux négatif possible). */
  private async assertNoActiveIndicatorDependency(rule: IndicatorEventRule): Promise<void> {
    const eventTypeName = rule.eventType?.name;
    if (!eventTypeName) return;

    const activeIndicators = await this.indicatorRepo.find({ where: { isActive: true } });
    const dependents = activeIndicators.filter(ind => ind.requiredEvents?.includes(eventTypeName));
    if (dependents.length > 0) {
      throw new ConflictException(
        `Impossible : les indicateurs actifs suivants dépendent de l'événement "${eventTypeName}" : ` +
        `${dependents.map(i => `"${i.name}"`).join(', ')}. Désactivez-les d'abord, ou retirez cet ` +
        `événement de leur configuration.`,
      );
    }
  }

  // ── Génération du DDL (jamais de concaténation non validée) ─────────────────

  private triggerNameFor(table: string): string {
    return `trg_platon_outbox_generic_${table.toLowerCase()}`;
  }

  /** `AFTER INSERT OR UPDATE OF "col1","col2"` (ou juste `AFTER INSERT` si aucune colonne à surveiller). */
  private updateClauseFor(rules: IndicatorEventRule[]): string {
    const columns = Array.from(new Set(
      rules.filter(r => r.operation !== 'INSERT' && r.watchedColumn).map(r => r.watchedColumn as string),
    ));
    return columns.length > 0
      ? `AFTER INSERT OR UPDATE OF ${columns.map(c => `"${c}"`).join(', ')}`
      : `AFTER INSERT`;
  }

  private async buildDdl(rule: IndicatorEventRule): Promise<string> {
    await this.platonSvc.assertValidTableColumn(rule.sourceTable, rule.watchedColumn);

    const siblingRules = await this.repo.find({ where: { sourceTable: rule.sourceTable, isActive: true } });
    const relevant = siblingRules.filter(r => r.triggerInstalled || r.id === rule.id);
    const triggerName = this.triggerNameFor(rule.sourceTable);
    const updateClause = this.updateClauseFor(relevant);

    return [
      `CREATE OR REPLACE FUNCTION fn_platon_outbox_generic() RETURNS TRIGGER AS $$`,
      `BEGIN`,
      `  INSERT INTO platon_outbox_events (event_type, payload)`,
      `  VALUES ('raw:' || TG_TABLE_NAME, jsonb_build_object(`,
      `    'table', TG_TABLE_NAME,`,
      `    'op', TG_OP,`,
      `    'new', to_jsonb(NEW),`,
      `    'old', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,`,
      `    'timestamp', extract(epoch from now())::bigint`,
      `  ));`,
      `  RETURN NEW;`,
      `END;`,
      `$$ LANGUAGE plpgsql;`,
      ``,
      `DROP TRIGGER IF EXISTS ${triggerName} ON "${rule.sourceTable}";`,
      `CREATE TRIGGER ${triggerName}`,
      `${updateClause} ON "${rule.sourceTable}"`,
      `FOR EACH ROW EXECUTE FUNCTION fn_platon_outbox_generic();`,
    ].join('\n');
  }

  /**
   * DDL de retrait pour `rule` : si d'autres règles actives et déjà installées partagent
   * le même trigger générique sur cette table, on le RECRÉE avec la liste de colonnes
   * réduite (sans celle de `rule`) plutôt que de le supprimer - sinon on le retire
   * complètement (plus aucune règle ne le nécessite sur cette table).
   */
  private async buildUninstallDdl(rule: IndicatorEventRule): Promise<string> {
    const siblingRules = await this.repo.find({ where: { sourceTable: rule.sourceTable, isActive: true } });
    const remaining = siblingRules.filter(r => r.id !== rule.id && r.triggerInstalled);
    const triggerName = this.triggerNameFor(rule.sourceTable);

    if (remaining.length === 0) {
      return `DROP TRIGGER IF EXISTS ${triggerName} ON "${rule.sourceTable}";`;
    }

    const updateClause = this.updateClauseFor(remaining);
    return [
      `DROP TRIGGER IF EXISTS ${triggerName} ON "${rule.sourceTable}";`,
      `CREATE TRIGGER ${triggerName}`,
      `${updateClause} ON "${rule.sourceTable}"`,
      `FOR EACH ROW EXECUTE FUNCTION fn_platon_outbox_generic();`,
    ].join('\n');
  }
}
