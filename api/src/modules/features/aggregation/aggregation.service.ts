import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndicatorDefinition } from '../indicators/entities/indicator-definition.entity';
import { IndicatorsService } from '../indicators/indicators.service';

@Injectable()
export class AggregationService implements OnModuleInit {
  private readonly logger = new Logger(AggregationService.name);
  private isRecalculatingTriggerless = false;

  constructor(
    @InjectRepository(IndicatorDefinition, 'indicators')
    private indicatorDefinitionModel: Repository<IndicatorDefinition>,
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

  /** Indicateurs actifs sans événement déclencheur : pas de mise à jour temps réel possible,
   *  donc recalcul périodique. Fréquence configurable, voir onModuleInit(). */
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

}