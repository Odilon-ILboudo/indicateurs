import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { NgxEchartsModule, NGX_ECHARTS_CONFIG } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';

import { IndicatorService } from '../../core/services/indicator.service';
import { DashboardSettingsService } from '../../core/services/dashboard-settings.service';
import { RoleService } from '../../core/services/role.service';
import { ContextConfig, IndicatorDefinition, ViewConfig, ViewResult } from '../../core/models/indicator.model';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'ui-indicator-detail',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    MatIconModule, MatCardModule, MatTooltipModule,
    NzBreadCrumbModule, NzTabsModule,
    NzSpinModule, NzTagModule, NzEmptyModule,
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
  private readonly settingsService = inject(DashboardSettingsService);
  private readonly roleService = inject(RoleService);
  private readonly messageService = inject(NzMessageService);
  private readonly cdr = inject(ChangeDetectorRef);

  indicator: IndicatorDefinition | null = null;
  contextConfigs: ContextConfig[] = [];

  activeContextType: string = 'learner';
  activeContextId: string = environment.defaultUserId;
  activeActivityId: string | undefined = undefined;

  // Contexte teacher affiché en lecture seule
  teacherCourseName = '';
  teacherActivityName = '';
  teacherScopeName = '';
  hasTeacherContext = false;

  viewResults: Record<string, ViewResult> = {};
  viewLoading: Record<string, boolean> = {};
  chartOptions: Record<string, EChartsOption> = {};

  isLoading = true;

  get isTeacher(): boolean { return this.roleService.isTeacher(); }

  get activeContextConfig(): ContextConfig | undefined {
    return this.contextConfigs.find(c => c.contextType === this.activeContextType);
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.isLoading = false;
      this.messageService.error('Indicateur non spécifié');
      return;
    }

    if (this.isTeacher) {
      const state = this.settingsService.getTeacherState();
      if (state.context) {
        this.activeContextType = state.context.scope;
        this.activeContextId = state.context.scopeId;
        this.activeActivityId = state.context.activityId ?? undefined;
        this.teacherCourseName = state.courseName ?? '';
        this.teacherActivityName = state.activityName ?? '';
        this.teacherScopeName = state.scopeName ?? '';
        this.hasTeacherContext = true;
      } else {
        this.hasTeacherContext = false;
      }
    }

    this.loadIndicator(id);
  }

  private loadIndicator(id: string): void {
    this.indicatorService.loadIndicators().subscribe({
      next: indicators => {
        this.indicator = indicators.find(i => i.id === id) ?? null;
        if (!this.indicator) {
          this.messageService.error('Indicateur non trouvé');
          this.isLoading = false;
          this.cdr.markForCheck();
          return;
        }
        this.loadContextConfigs(id);
      },
      error: () => {
        this.messageService.error('Erreur lors du chargement');
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private loadContextConfigs(indicatorId: string): void {
    this.indicatorService.getContextConfigs(indicatorId).subscribe({
      next: configs => {
        this.contextConfigs = configs;
        this.isLoading = false;
        this.cdr.markForCheck();
        const canCompute = !this.isTeacher || this.hasTeacherContext;
        if (canCompute) this.computeAllViews();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private computeAllViews(): void {
    if (!this.indicator || !this.activeContextId) return;
    const config = this.activeContextConfig;
    if (!config) return;
    for (const view of config.views) {
      this.computeView(view);
    }
  }

  computeView(view: ViewConfig): void {
    if (!this.indicator || !this.activeContextId) return;
    this.viewLoading[view.id] = true;
    this.cdr.markForCheck();

    this.indicatorService.computeView(
      this.indicator.id,
      this.activeContextType,
      this.activeContextId,
      view.id,
      this.activeActivityId,
    ).subscribe({
      next: result => {
        this.viewResults[view.id] = result;
        this.viewLoading[view.id] = false;
        this.buildChartOptions(view, result);
        this.cdr.markForCheck();
      },
      error: () => {
        this.viewLoading[view.id] = false;
        this.messageService.error(`Erreur calcul vue "${view.label}"`);
        this.cdr.markForCheck();
      },
    });
  }

  private buildChartOptions(view: ViewConfig, result: ViewResult): void {
    const vizType = view.visualization.type;
    const color = view.visualization.color ?? '#5470c6';
    const unit = view.visualization.unit ?? '';

    if (vizType === 'gauge') {
      const value = result.value;
      const max = view.visualization.thresholds?.good ?? 100;
      this.chartOptions[view.id] = {
        series: [{
          type: 'gauge', radius: '70%',
          min: 0, max,
          progress: { show: true, width: 18 },
          axisLine: { lineStyle: { width: 18, color: [[0.4, '#ff4d4f'], [0.7, '#faad14'], [1, '#52c41a']] } },
          axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
          pointer: { show: false },
          detail: { valueAnimation: true, fontSize: 24, formatter: (v: number) => v.toFixed(1) + unit },
          data: [{ value, name: view.label }],
        }],
      };
    }

    if (vizType === 'line-chart') {
      const history = result.metadata?.['history'] ?? [];
      this.chartOptions[view.id] = {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: history.map((h: any) => new Date(h.timestamp).toLocaleDateString()) },
        yAxis: { type: 'value', name: unit },
        series: [{ data: history.map((h: any) => h.value), type: 'line', smooth: true, lineStyle: { color } }],
      };
    }

    if (vizType === 'bar-chart') {
      // structuredValue: { key: string, value: number }[] ou Record<string,number>
      const raw = result.structuredValue ?? {};
      const entries: { key: string; val: number }[] = Array.isArray(raw)
        ? raw.map((e: any) => ({ key: e.key ?? e.label ?? String(e), val: e.value ?? 0 }))
        : Object.entries(raw).map(([k, v]) => ({ key: k, val: v as number }));

      this.chartOptions[view.id] = {
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params;
            return `${p.name}<br/>${p.value} ${unit}`;
          },
        },
        xAxis: { type: 'value', name: unit, nameLocation: 'end' },
        yAxis: {
          type: 'category',
          data: entries.map(e => e.key),
          axisLabel: {
            width: 180,
            overflow: 'truncate',
            formatter: (val: string) => val.length > 25 ? val.slice(0, 25) + '…' : val,
          },
        },
        series: [{
          data: entries.map(e => e.val),
          type: 'bar',
          itemStyle: { color },
          label: { show: true, position: 'right', formatter: (p: any) => `${p.value} ${unit}` },
        }],
        grid: { containLabel: true, right: '15%' },
      };
    }

    if (vizType === 'histogram') {
      // structuredValue: { bucket: number, count: number, users?: string[] }[]
      const buckets: { bucket: number; count: number; users?: string[] }[] = result.structuredValue ?? [];
      this.chartOptions[view.id] = {
        tooltip: {
          trigger: 'axis',
          enterable: true,
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params;
            const item = p.data as { value: number; users?: string[] };
            const names = item?.users ?? [];
            const namesHtml = names.length
              ? '<br/>' + names.map((n: string) => `&nbsp;• ${n}`).join('<br/>')
              : '';
            return `<strong>${p.name} ${unit}</strong><br/>${item.value} étudiant(s)${namesHtml}`;
          },
        },
        xAxis: { type: 'category', data: buckets.map(b => String(b.bucket)), name: unit, nameLocation: 'end' },
        yAxis: { type: 'value', name: 'Effectif' },
        series: [{
          data: buckets.map(b => ({ value: b.count, users: b.users ?? [] })),
          type: 'bar',
          itemStyle: { color },
          label: { show: true, position: 'top' },
        }],
        grid: { containLabel: true },
      };
    }
  }

  // ── Helpers template ──────────────────────────────────────────────────────

  getThresholdColor(view: ViewConfig, value: number): string {
    const t = view.visualization.thresholds;
    if (!t) return '#1890ff';
    if (value <= t.good) return '#52c41a';
    if (value <= t.warning) return '#faad14';
    return '#ff4d4f';
  }

  getContextLabel(contextType: string): string {
    const labels: Record<string, string> = {
      learner: 'Apprenant', group: 'Groupe de TP', course: 'Cours', activity: 'Activité', global: 'Global',
    };
    return labels[contextType] ?? contextType;
  }
}
