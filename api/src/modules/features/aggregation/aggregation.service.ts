// src/aggregation/aggregation.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { IndicatorValue } from '../indicators/entities/indicator-value.entity';
import { IndicatorsService } from '../indicators/indicators.service';

@Injectable()
export class AggregationService implements OnModuleInit {
  private readonly logger = new Logger(AggregationService.name);
  private isRecalculatingTriggerless = false;

  constructor(
    @InjectRepository(IndicatorDefinition, 'indicators')
    private indicatorDefinitionModel: Repository<IndicatorDefinition>,
    @InjectRepository(IndicatorValue, 'indicators')
    private indicatorValueModel: Repository<IndicatorValue>,
    private readonly indicatorsService: IndicatorsService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  /** Enregistrement dynamique (plutôt que @Cron statique) pour que la fréquence soit lue depuis
   *  la config (TRIGGERLESS_RECALC_CRON, voir configuration.ts) - un décorateur @Cron ne peut
   *  pas lire le ConfigService, ses arguments sont évalués à la définition de la classe. */
  onModuleInit(): void {
    const expression = this.config.get<string>('aggregation.triggerlessRecalcCron') || CronExpression.EVERY_MINUTE;
    const job = new CronJob(expression, () => this.recalculateTriggerlessIndicators());
    this.schedulerRegistry.addCronJob('recalculateTriggerlessIndicators', job);
    job.start();
    this.logger.log(`Recalcul périodique (sans déclencheur) programmé : "${expression}"`);
  }

  /** Indicateurs actifs sans événement déclencheur (case "Activer des événements déclencheurs"
   *  décochée dans le wizard) : pas de mise à jour temps réel possible, donc recalcul périodique
   *  via recalculate() - même logique de calcul que le flux événementiel, juste déclenchée par
   *  le temps plutôt que par un événement PLaTon. Fréquence configurable, voir onModuleInit(). */
  async recalculateTriggerlessIndicators() {
    if (this.isRecalculatingTriggerless) return;
    this.isRecalculatingTriggerless = true;

    try {
      const indicators = await this.indicatorDefinitionModel.find({ where: { isActive: true } });
      const triggerless = indicators.filter(i => !i.requiredEvents?.length);

      let updated = 0;
      let failed = 0;
      for (const indicator of triggerless) {
        try {
          await this.indicatorsService.recalculate(indicator.id);
          updated++;
        } catch (err) {
          failed++;
          this.logger.warn(`Recalcul minute échoué pour "${indicator.name}": ${(err as Error).message}`);
        }
      }

      if (triggerless.length > 0) {
        this.logger.debug(`Recalcul minute (sans événement) : ${updated} ok, ${failed} échoués sur ${triggerless.length}`);
      }
    } finally {
      this.isRecalculatingTriggerless = false;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async dailyAggregation() {
    this.logger.log('Starting daily aggregation...');
    
    const indicators = await this.indicatorDefinitionModel.find({ where: { isActive: true } });
    
    for (const indicator of indicators) {
      await this.aggregateIndicator(indicator, 'day');
    }
    
    this.logger.log('Daily aggregation completed');
  }

  @Cron(CronExpression.EVERY_WEEK)
  async weeklyAggregation() {
    this.logger.log('Starting weekly aggregation...');
    
    const indicators = await this.indicatorDefinitionModel.find({ where: { isActive: true } });
    
    for (const indicator of indicators) {
      await this.aggregateIndicator(indicator, 'week');
    }
    
    this.logger.log('Weekly aggregation completed');
  }

  private async aggregateIndicator(indicator: IndicatorDefinition, period: 'day' | 'week' | 'month') {
    // Utiliser le nom de l'indicateur pour la clé d'agrégation (plus lisible)
    const aggregationKey = `${indicator.name}_${period}`;
    const periodStart = this.getPeriodStart(period);
    
    // Récupérer les valeurs par l'UUID de l'indicateur
    const values = await this.indicatorValueModel.find({
      where: {
        indicatorId: indicator.id,
      },
    });
    
    // Filtrer par date
    const filteredValues = values.filter(v => 
      v.metadata?.lastUpdate && new Date(v.metadata.lastUpdate) >= periodStart
    );
    
    const aggregated = this.computeAggregation(filteredValues, indicator);
    
    // Vérifier si une entrée d'agrégation existe déjà
    const existing = await this.indicatorValueModel.findOne({
      where: {
        indicatorId: indicator.id,
        contextType: 'global',      // Agrégations globales
        contextId: aggregationKey,   // Clé d'agrégation
      }
    });
    
    if (existing) {
      existing.value = aggregated;
      existing.metadata = {
        ...existing.metadata,
        lastUpdate: new Date(),
        period: period,
      };
      await this.indicatorValueModel.save(existing);
      this.logger.debug(`Updated aggregation for ${indicator.name}: ${period} = ${aggregated}`);
    } else {
      const newValue = this.indicatorValueModel.create({
        indicatorId: indicator.id,
        contextType: 'global',
        contextId: aggregationKey,
        value: aggregated,
        metadata: {
          lastUpdate: new Date(),
          period: period,
        },
      });
      await this.indicatorValueModel.save(newValue);
      this.logger.debug(`Created aggregation for ${indicator.name}: ${period} = ${aggregated}`);
    }
  }

  private getPeriodStart(period: 'day' | 'week' | 'month'): Date {
    const now = new Date();
    switch (period) {
      case 'day':
        return new Date(now.setHours(0, 0, 0, 0));
      case 'week':
        const day = now.getDay();
        return new Date(now.setDate(now.getDate() - day));
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  private computeAggregation(values: IndicatorValue[], indicator: IndicatorDefinition): number {
    if (values.length === 0) return 0;
    
    // Par défaut, on calcule la moyenne
    const sum = values.reduce((acc, v) => acc + v.value, 0);
    const avg = sum / values.length;
    
    this.logger.debug(`Computed aggregation for ${indicator.name}: ${values.length} values, avg = ${avg}`);
    return avg;
  }
}