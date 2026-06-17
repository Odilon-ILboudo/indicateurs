import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
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
import { IndicatorDefinition, IndicatorVisualization, ViewResult } from '../../core/models/indicator.model';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'ui-indicator-detail',
  standalone: true,
  imports: [
    CommonModule, RouterModule, FormsModule,
    MatIconModule, MatCardModule, MatTooltipModule,
    NzBreadCrumbModule, NzTabsModule,
    NzSpinModule, NzTagModule, NzEmptyModule, NzDatePickerModule, NzRadioModule,
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
  private readonly indicatorService = inject(IndicatorService);
  private readonly roleService = inject(RoleService);
  private readonly messageService = inject(NzMessageService);
  private readonly cdr = inject(ChangeDetectorRef);

  indicator: IndicatorDefinition | null = null;

  activeContextType: string = 'learner';
  activeContextId: string = environment.defaultUserId;
  activeActivityId: string | undefined = undefined;

  courseContextCourseName = '';
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

  // Résultats indexés par vizId
  results: Record<string, ViewResult> = {};
  loading: Record<string, boolean> = {};
  chartOptions: Record<string, EChartsOption> = {};

  /** Période affichée pour les graphiques en courbe (jours), par vizId. 7 jours par défaut. -1 = plage personnalisée. */
  historyPeriodDays: Record<string, number> = {};

  /** Plage de dates personnalisée par vizId, utilisée quand historyPeriodDays[vizId] === -1. */
  historyCustomRange: Record<string, [Date, Date] | null> = {};

  readonly historyPeriodOptions: { label: string; value: number }[] = [
    { label: '7 jours', value: 7 },
    { label: '30 jours', value: 30 },
    { label: '90 jours', value: 90 },
    { label: 'Tout', value: 0 },
    { label: 'Personnalisé', value: -1 },
  ];

  isLoading = true;

  /** Visualisation active (choisie par l'utilisateur, persistée en BDD). */
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
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.isLoading = false;
      this.messageService.error('Indicateur non spécifié');
      return;
    }

    const q = this.route.snapshot.queryParams;

    if (q['from'] === 'group-snapshot' && q['groupId'] && q['activityId']) {
      this.activeContextType = 'group';
      this.activeContextId = q['groupId'];
      this.activeActivityId = q['activityId'];
      this.groupSnapshotGroupName = q['groupName'] ?? 'Groupe';
      this.groupSnapshotActivityName = q['activityName'] ?? 'Activité';
      this.groupSnapshotCourseName = q['courseName'] ?? 'Cours';
      this.groupSnapshotCourseId = q['courseId'] ?? '';
      this.groupSnapshotActivityId = q['activityId'];
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

        // Pas de contexte spécifique (clic depuis le tableau de bord) :
        // résout le contexte sur celui de l'indicateur (learner/teacher/admin = userId)
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

  /** Appelé quand l'utilisateur clique sur un autre onglet de visualisation. */
  onVizTabChange(index: number): void {
    const viz = this.visualizations[index];
    if (!viz || viz.id === this.activeVizId) return;
    this.activeVizId = viz.id;
    this.indicatorService.setVizPreference(environment.defaultUserId, this.indicator!.id, viz.id);
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
    const color = viz.color ?? '#5470c6';
    const unit  = viz.unit  ?? '';

    if (viz.type === 'gauge') {
      const max = this.indicator?.thresholds?.good ?? 100;
      this.chartOptions[viz.id] = {
        series: [{
          type: 'gauge', radius: '70%', min: 0, max,
          progress: { show: true, width: 18 },
          axisLine: { lineStyle: { width: 18, color: [[0.4, '#ff4d4f'], [0.7, '#faad14'], [1, '#52c41a']] } },
          axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
          pointer: { show: false },
          detail: { valueAnimation: true, fontSize: 24, formatter: (v: number) => v.toFixed(1) + unit },
          data: [{ value: result.value, name: viz.label }],
        }],
      };
    } else if (viz.type === 'line-chart') {
      const fullHistory = result.metadata?.['history'] ?? [];
      const history = this.filterHistory(viz, fullHistory);
      this.chartOptions[viz.id] = {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: history.map((h: any) => new Date(h.timestamp).toLocaleDateString()) },
        yAxis: { type: 'value', name: unit },
        series: [{ data: history.map((h: any) => h.value), type: 'line', smooth: true, lineStyle: { color } }],
      };
    } else if (viz.type === 'bar-chart') {
      const raw = result.structuredValue ?? {};
      const entries: { key: string; val: number }[] = Array.isArray(raw)
        ? raw.map((e: any) => ({ key: e.key ?? e.label ?? String(e), val: e.value ?? 0 }))
        : Object.entries(raw).map(([k, v]) => ({ key: k, val: v as number }));
      this.chartOptions[viz.id] = {
        tooltip: { trigger: 'axis', formatter: (p: any) => { const x = Array.isArray(p) ? p[0] : p; return `${x.name}<br/>${x.value} ${unit}`; } },
        xAxis: { type: 'value', name: unit, nameLocation: 'end' },
        yAxis: { type: 'category', data: entries.map(e => e.key),
          axisLabel: { width: 180, overflow: 'truncate', formatter: (v: string) => v.length > 25 ? v.slice(0, 25) + '…' : v } },
        series: [{ data: entries.map(e => e.val), type: 'bar', itemStyle: { color },
          label: { show: true, position: 'right', formatter: (p: any) => `${p.value} ${unit}` } }],
        grid: { containLabel: true, right: '15%' },
      };
    } else if (viz.type === 'histogram') {
      const buckets: { bucket: number; count: number; users?: string[] }[] = result.structuredValue ?? [];
      this.chartOptions[viz.id] = {
        tooltip: { trigger: 'axis', enterable: true,
          formatter: (p: any) => {
            const x = Array.isArray(p) ? p[0] : p;
            const item = x.data as { value: number; users?: string[] };
            const names = item?.users ?? [];
            return `<strong>${x.name} ${unit}</strong><br/>${item.value} étudiant(s)${names.length ? '<br/>' + names.map((n: string) => `&nbsp;• ${n}`).join('<br/>') : ''}`;
          },
        },
        xAxis: { type: 'category', data: buckets.map(b => String(b.bucket)), name: unit, nameLocation: 'end' },
        yAxis: { type: 'value', name: 'Effectif' },
        series: [{ data: buckets.map(b => ({ value: b.count, users: b.users ?? [] })),
          type: 'bar', itemStyle: { color }, label: { show: true, position: 'top' } }],
        grid: { containLabel: true },
      };
    }
  }

  /** Change la période affichée pour la courbe d'un viz et reconstruit le graphique. */
  onHistoryPeriodChange(viz: IndicatorVisualization, days: number): void {
    this.historyPeriodDays[viz.id] = days;
    const result = this.results[viz.id];
    if (result) this.buildChartOptions(viz, result);
    this.cdr.markForCheck();
  }

  /** Change la plage de dates personnalisée pour la courbe d'un viz et reconstruit le graphique. */
  onCustomRangeChange(viz: IndicatorVisualization, range: [Date, Date] | null): void {
    this.historyCustomRange[viz.id] = range;
    const result = this.results[viz.id];
    if (result) this.buildChartOptions(viz, result);
    this.cdr.markForCheck();
  }

  /** Filtre l'historique selon la période sélectionnée (jours glissants, tout, ou plage personnalisée). */
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

  // ── Helpers template ──────────────────────────────────────────────────────

  getThresholdColor(_viz: IndicatorVisualization, value: number): string {
    const t = this.indicator?.thresholds;
    if (!t || (t.good == null && t.warning == null)) return '#1890ff';
    if (t.good != null && value <= t.good)       return '#52c41a';
    if (t.warning != null && value <= t.warning) return '#faad14';
    return '#ff4d4f';
  }

  getContextLabel(contextType: string): string {
    const labels: Record<string, string> = {
      learner: 'Apprenant', teacher: 'Enseignant', admin: 'Admin',
      course: 'Cours', activity: 'Activité', group: 'Groupe de TP',
    };
    return labels[contextType] ?? contextType;
  }
}
