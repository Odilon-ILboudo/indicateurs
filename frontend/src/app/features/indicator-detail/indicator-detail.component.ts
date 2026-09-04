import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Params, Router, RouterModule } from '@angular/router';
import { filter, startWith } from 'rxjs/operators';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NgxEchartsModule, NGX_ECHARTS_CONFIG } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';

import { IndicatorService } from '../../core/services/indicator.service';
import { RoleService } from '../../core/services/role.service';
import { IndicatorDefinition, IndicatorVisualization, ViewResult, contextIcon } from '../../core/models/indicator.model';
import { buildIndicatorChartOptions } from '../../shared/utils/indicator-chart-options.util';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { getCurrentUserId } from '../../core/auth/current-user';
import { ROUTE_BASE_PATH } from '../../core/tokens/route-base-path.token';
import { EMBEDDED_MODE } from '../../core/tokens/embedded-mode.token';

@Component({
  selector: 'ui-indicator-detail',
  standalone: true,
  imports: [
    CommonModule, RouterModule, FormsModule,
    MatIconModule, MatCardModule, MatTooltipModule,
    NzBreadCrumbModule, NzTabsModule,
    NzSpinModule, NzTagModule, NzEmptyModule, NzDatePickerModule, NzRadioModule,
    NzModalModule, NzRateModule, NzButtonModule, NzInputModule,
    NgxEchartsModule,
  ],
  providers: [
    {
      provide: NGX_ECHARTS_CONFIG,
      useFactory: () => ({ echarts: () => import('echarts') }),
    },
  ],
  templateUrl: './indicator-detail.component.html',
  styleUrls: ['./indicator-detail.component.scss'],
})
export class IndicatorDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly indicatorService = inject(IndicatorService);
  private readonly roleService = inject(RoleService);
  private readonly messageService = inject(NzMessageService);
  private readonly modalService = inject(NzModalService);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly routeBasePath = inject(ROUTE_BASE_PATH, { optional: true }) ?? '/dashboard';
  /*
  Les bannières de contexte renvoient vers /courses/... en standalone, ou en interne vers
  /context en mode embarqué - jamais un lien externe vers une page PLaTon native.
  */
  protected readonly embedded = inject(EMBEDDED_MODE, { optional: true }) ?? false;

  readonly contextIcon = contextIcon;

  //  Feedback
  feedbackModalVisible = false;
  feedbackRating = 0;
  feedbackComment = '';
  feedbackSubmitting = false;

  indicator: IndicatorDefinition | null = null;

  activeContextType: string = 'learner';
  activeContextId: string = getCurrentUserId();
  activeActivityId: string | undefined = undefined;
  // Uniquement pour un indicateur `group` course-aware (isCourseAware) - voir groupSnapshotIsCourseScoped.
  activeCourseId: string | undefined = undefined;

  courseContextCourseName = '';
  /*
  Id du cours pour le lien "Retour au cours" - distinct de activeContextId, qui vaut l'id de
  l'utilisateur (pas celui du cours) pour un indicateur personnel course-aware.
  */
  courseContextCourseId = '';
  hasCourseContext = false;

  activityCourseName = '';
  activityName = '';
  activityCourseId = '';
  activityId = '';
  hasActivityContext = false;

  groupSnapshotCourseName = '';
  groupSnapshotActivityName = '';
  groupSnapshotGroupName = '';
  groupSnapshotCourseId = '';
  groupSnapshotActivityId = '';
  hasGroupSnapshotContext = false;
  // true = snapshot de groupe scopé à tout le cours (pas d'activité précise), voir isCourseAware().
  groupSnapshotIsCourseScoped = false;

  // Résultats indexés par vizId
  results: Record<string, ViewResult> = {};
  loading: Record<string, boolean> = {};
  chartOptions: Record<string, EChartsOption> = {};

  // Période affichée pour les graphiques en courbe (jours), par vizId. 7 jours par défaut. -1 = plage personnalisée.
  historyPeriodDays: Record<string, number> = {};

  // Plage de dates personnalisée par vizId, utilisée quand historyPeriodDays[vizId] === -1.
  historyCustomRange: Record<string, [Date, Date] | null> = {};

  readonly historyPeriodOptions: { label: string; value: number }[] = [
    { label: '7 jours', value: 7 },
    { label: '30 jours', value: 30 },
    { label: '90 jours', value: 90 },
    { label: 'Tout', value: 0 },
    { label: 'Personnalisé', value: -1 },
  ];

  isLoading = true;

  // Visualisation active (choisie par l'utilisateur, persistée en BDD).
  activeVizId: string | null = null;

  get isTeacher(): boolean { return this.roleService.isTeacher(); }

  get visualizations(): IndicatorVisualization[] {
    const all = this.indicator?.visualizations ?? [];
    if (!all.length) return all;
    const visible = all.filter(v => this.indicatorService.isVizEnabled(this.indicator!.id, v.id));
    return visible.length ? visible : all;
  }

  get activeViz(): IndicatorVisualization | undefined {
    return this.visualizations.find(v => v.id === this.activeVizId)
      ?? this.visualizations[0];
  }

  get activeVizIndex(): number {
    const idx = this.visualizations.findIndex(v => v.id === this.activeVizId);
    return idx >= 0 ? idx : 0;
  }

  ngOnInit(): void {
    /*
    Une navigation entre deux /indicator/:id réutilise la même instance de composant : on
    réagit à chaque NavigationEnd plutôt qu'une seule fois dans ngOnInit. On relit
    route.snapshot plutôt que combiner paramMap/queryParams (deux flux qui peuvent émettre de
    façon non atomique et produire une combinaison transitoire incohérente).
    */
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      startWith(null),
    ).subscribe(() => {
      this.loadFromRoute(this.route.snapshot.paramMap.get('id'), this.route.snapshot.queryParams);
    });
  }

  private loadFromRoute(id: string | null, q: Params): void {
    /*
    Réinitialise tout l'état dépendant de la route - nécessaire car l'instance peut être
    réutilisée d'une navigation à l'autre (voir commentaire ngOnInit).
    */
    this.isLoading = true;
    this.indicator = null;
    this.results = {};
    this.loading = {};
    this.chartOptions = {};
    this.historyPeriodDays = {};
    this.historyCustomRange = {};
    this.activeVizId = null;

    this.activeContextType = 'learner';
    this.activeContextId = getCurrentUserId();
    this.activeActivityId = undefined;
    this.activeCourseId = undefined;

    this.courseContextCourseName = '';
    this.courseContextCourseId = '';
    this.hasCourseContext = false;

    this.activityCourseName = '';
    this.activityName = '';
    this.activityCourseId = '';
    this.activityId = '';
    this.hasActivityContext = false;

    this.groupSnapshotCourseName = '';
    this.groupSnapshotActivityName = '';
    this.groupSnapshotGroupName = '';
    this.groupSnapshotCourseId = '';
    this.groupSnapshotActivityId = '';
    this.hasGroupSnapshotContext = false;
    this.groupSnapshotIsCourseScoped = false;

    if (!id) {
      this.isLoading = false;
      this.messageService.error('Indicateur non spécifié');
      this.cdr.markForCheck();
      return;
    }

    if (q['from'] === 'group-snapshot' && q['groupId'] && (q['activityId'] || q['courseId'])) {
      this.activeContextType = 'group';
      this.activeContextId = q['groupId'];
      this.groupSnapshotIsCourseScoped = !q['activityId'];
      this.activeActivityId = q['activityId'];
      this.activeCourseId = this.groupSnapshotIsCourseScoped ? q['courseId'] : undefined;
      this.groupSnapshotGroupName = q['groupName'] ?? 'Groupe';
      this.groupSnapshotActivityName = q['activityName'] ?? 'Activité';
      this.groupSnapshotCourseName = q['courseName'] ?? 'Cours';
      this.groupSnapshotCourseId = q['courseId'] ?? '';
      this.groupSnapshotActivityId = q['activityId'] ?? '';
      this.hasGroupSnapshotContext = true;
    } else if (q['from'] === 'activity' && q['activityId']) {
      this.activeContextType = 'activity';
      this.activeContextId = q['activityId'];
      this.activityId = q['activityId'];
      this.activityCourseId = q['courseId'] ?? '';
      this.activityName = q['activityName'] ?? 'Activité';
      this.activityCourseName = q['courseName'] ?? 'Cours';
      this.hasActivityContext = true;
    } else if (q['from'] === 'course' && q['courseId']) {
      this.activeContextType = 'course';
      this.activeContextId = q['courseId'];
      this.courseContextCourseName = q['courseName'] ?? 'Cours';
      this.courseContextCourseId = q['courseId'];
      this.hasCourseContext = true;
    } else if (q['from'] === 'activity-personal' && q['contextType'] && q['activityId']) {
      /*
      Carte personnelle activity-aware : contextType dépend de l'indicateur cliqué, donc
      fourni explicitement en query param plutôt que déduit de `from`.
      */
      this.activeContextType = q['contextType'];
      this.activeContextId = getCurrentUserId();
      this.activeActivityId = q['activityId'];
      this.activityId = q['activityId'];
      this.activityCourseId = q['courseId'] ?? '';
      this.activityName = q['activityName'] ?? 'Activité';
      this.activityCourseName = q['courseName'] ?? 'Cours';
      this.hasActivityContext = true;
    } else if (q['from'] === 'course-personal' && q['contextType'] && q['courseId']) {
      // Même principe, pour une carte personnelle course-aware.
      this.activeContextType = q['contextType'];
      this.activeContextId = getCurrentUserId();
      this.activeCourseId = q['courseId'];
      this.courseContextCourseName = q['courseName'] ?? 'Cours';
      this.courseContextCourseId = q['courseId'];
      this.hasCourseContext = true;
    }

    this.loadIndicator(id);
  }

  private loadIndicator(id: string): void {
    this.indicatorService.loadIndicators().subscribe({
      next: indicators => {
        this.indicator = indicators.find(i => i.id === id) ?? null;
        this.isLoading = false;
        if (!this.indicator) {
          this.messageService.error('Indicateur non trouvé');
          this.cdr.markForCheck();
          return;
        }

        /*
        Pas de contexte spécifique (clic depuis le tableau de bord) :
        résout le contexte sur celui de l'indicateur (learner/teacher/admin = userId)
        */
        if (!this.hasGroupSnapshotContext && !this.hasActivityContext && !this.hasCourseContext) {
          this.activeContextType = this.indicator.contextType;
        }

        // Restaure la préférence viz depuis le cache BDD
        const saved = this.indicatorService.getVizPreference(id);
        const valid = this.visualizations.find(v => v.id === saved);
        this.activeVizId = valid?.id ?? this.visualizations[0]?.id ?? null;

        this.cdr.markForCheck();
        // Calcule uniquement la viz active (pas toutes)
        if (this.activeViz) this.computeViz(this.activeViz);
      },
      error: () => {
        this.isLoading = false;
        this.messageService.error('Erreur lors du chargement');
        this.cdr.markForCheck();
      },
    });
  }

  // Appelé quand l'utilisateur clique sur un autre onglet de visualisation.
  onVizTabChange(index: number): void {
    const viz = this.visualizations[index];
    if (!viz || viz.id === this.activeVizId) return;
    this.activeVizId = viz.id;
    this.indicatorService.setVizPreference(getCurrentUserId(), this.indicator!.id, viz.id);
    // Calcule à la demande si pas encore fait
    if (!this.results[viz.id] && !this.loading[viz.id]) {
      this.computeViz(viz);
    }
    this.cdr.markForCheck();
  }

  computeViz(viz: IndicatorVisualization): void {
    if (!this.indicator || !this.activeContextId) return;
    this.loading[viz.id] = true;
    this.cdr.markForCheck();

    const activityIdParam = this.activeContextType === 'activity' ? undefined : this.activeActivityId;

    this.indicatorService.computeView(
      this.indicator.id,
      this.activeContextType,
      this.activeContextId,
      activityIdParam,
      viz.id,
      this.activeCourseId,
    ).subscribe({
      next: result => {
        this.results[viz.id] = result;
        this.loading[viz.id] = false;
        this.buildChartOptions(viz, result);
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading[viz.id] = false;
        this.messageService.error(`Erreur calcul "${viz.label}"`);
        this.cdr.markForCheck();
      },
    });
  }

  private buildChartOptions(viz: IndicatorVisualization, result: ViewResult): void {
    if (viz.type === 'line-chart') {
      /*
      Seul cas non couvert par l'utilitaire partagé : dépend de l'historique temporel et de
      l'état de sélection de période (historyPeriodDays/historyCustomRange), propres à cette
      page - une modale de comparaison par snapshots ponctuels n'a pas cette notion.
      */
      const color = viz.color ?? '#5470c6';
      const unit  = viz.unit  ?? '';
      const fullHistory = result.metadata?.['history'] ?? [];
      const history = this.filterHistory(viz, fullHistory);
      this.chartOptions[viz.id] = {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: history.map((h: any) => new Date(h.timestamp).toLocaleDateString()) },
        yAxis: { type: 'value', name: unit },
        series: [{ data: history.map((h: any) => h.value), type: 'line', smooth: true, lineStyle: { color } }],
      };
      return;
    }

    const options = buildIndicatorChartOptions(viz, result, this.indicator?.thresholds);
    if (options) this.chartOptions[viz.id] = options;
  }

  // Change la période affichée pour la courbe d'un viz et reconstruit le graphique.
  onHistoryPeriodChange(viz: IndicatorVisualization, days: number): void {
    this.historyPeriodDays[viz.id] = days;
    const result = this.results[viz.id];
    if (result) this.buildChartOptions(viz, result);
    this.cdr.markForCheck();
  }

  // Change la plage de dates personnalisée pour la courbe d'un viz et reconstruit le graphique.
  onCustomRangeChange(viz: IndicatorVisualization, range: [Date, Date] | null): void {
    this.historyCustomRange[viz.id] = range;
    const result = this.results[viz.id];
    if (result) this.buildChartOptions(viz, result);
    this.cdr.markForCheck();
  }

  // Filtre l'historique selon la période sélectionnée (jours glissants, tout, ou plage personnalisée).
  private filterHistory(viz: IndicatorVisualization, history: { value: number; timestamp: Date }[]): { value: number; timestamp: Date }[] {
    const days = this.historyPeriodDays[viz.id] ?? 7;

    if (days === -1) {
      const range = this.historyCustomRange[viz.id];
      if (!range) return history;
      const start = new Date(range[0]).setHours(0, 0, 0, 0);
      const end = new Date(range[1]).setHours(23, 59, 59, 999);
      return history.filter(h => {
        const t = new Date(h.timestamp).getTime();
        return t >= start && t <= end;
      });
    }

    if (!days) return history;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return history.filter(h => new Date(h.timestamp).getTime() >= cutoff);
  }

  //  Helpers template

  getContextLabel(contextType: string): string {
    const labels: Record<string, string> = {
      learner: 'Apprenant', teacher: 'Enseignant', admin: 'Admin',
      course: 'Cours', activity: 'Activité', group: 'Groupe de TP',
    };
    return labels[contextType] ?? contextType;
  }

  openFeedbackModal(): void {
    this.feedbackRating = 0;
    this.feedbackComment = '';
    this.feedbackModalVisible = true;
  }

  submitFeedback(): void {
    if (!this.indicator || this.feedbackRating === 0) return;
    this.feedbackSubmitting = true;
    this.indicatorService
      .submitFeedback(this.indicator.id, getCurrentUserId(), this.feedbackRating, this.feedbackComment.trim() || undefined)
      .subscribe({
        next: () => {
          this.feedbackSubmitting = false;
          this.feedbackModalVisible = false;
          this.messageService.success('Merci pour votre retour !');
          this.cdr.markForCheck();
        },
        error: () => {
          this.feedbackSubmitting = false;
          this.messageService.error('Erreur lors de l\'envoi du retour.');
          this.cdr.markForCheck();
        },
      });
  }
}
