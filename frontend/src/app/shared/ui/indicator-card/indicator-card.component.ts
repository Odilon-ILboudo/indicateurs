import { Component, Input, Output, EventEmitter, OnInit, OnChanges, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { IndicatorService } from '../../../core/services/indicator.service';
import { DashboardContext, IndicatorDefinition, IndicatorValue, IndicatorVisualization, ViewVisualizationType } from '../../../core/models/indicator.model';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'ui-indicator-card',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatCardModule, MatTooltipModule, RouterModule],
  templateUrl: './indicator-card.component.html',
  styleUrls: ['./indicator-card.component.scss']
})
export class IndicatorCardComponent implements OnInit, OnChanges {
  private readonly indicatorService = inject(IndicatorService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() indicator!: IndicatorDefinition;
  @Input() context!: DashboardContext;
  @Input() clickable: boolean = true;
  @Input() queryParams?: Record<string, string>;
  /** Surcharge le titre affiché dans la card (ex : snapshot.title pour les groupes). */
  @Input() displayTitle?: string;

  @Output() valueChange = new EventEmitter<IndicatorValue>();

  value: IndicatorValue | null = null;
  isLoading: boolean = true;
  activeVizId: string | null = null;

  ngOnInit(): void {
    this.initActiveViz();
    this.loadValue();
  }

  ngOnChanges(): void {
    if (this.indicator && this.context) {
      this.initActiveViz();
      this.loadValue();
    }
  }

  /** Visualisations que l'utilisateur a choisi de voir (toutes par défaut). */
  get visibleVisualizations(): IndicatorVisualization[] {
    const all = this.indicator?.visualizations ?? [];
    const visible = all.filter(v => this.indicatorService.isVizEnabled(this.indicator.id, v.id));
    return visible.length ? visible : all;
  }

  private initActiveViz(): void {
    if (!this.visibleVisualizations.length) return;
    const saved = this.indicatorService.getVizPreference(this.indicator.id);
    const valid = this.visibleVisualizations.find(v => v.id === saved);
    this.activeVizId = valid?.id ?? this.visibleVisualizations[0].id;
  }

  selectViz(viz: IndicatorVisualization, event: Event): void {
    event.stopPropagation();
    if (viz.id === this.activeVizId) return;
    this.activeVizId = viz.id;
    this.indicatorService.setVizPreference(environment.defaultUserId, this.indicator.id, viz.id);
    this.loadValue();
  }

  get activeViz(): IndicatorVisualization | undefined {
    return this.visibleVisualizations.find(v => v.id === this.activeVizId)
      ?? this.visibleVisualizations[0];
  }

  get hasMultipleViz(): boolean {
    return this.visibleVisualizations.length > 1;
  }

  private loadValue(): void {
    this.isLoading = true;
    const scope = this.context.scope;

    if (scope === 'course' || scope === 'group' || scope === 'activity') {
      if ((scope === 'course' || scope === 'group') && !this.context.activityId) {
        this.isLoading = false;
        this.cdr.detectChanges();
        return;
      }

      const activityId = scope === 'activity' ? undefined : this.context.activityId;
      const vizId = this.activeViz?.id;

      this.indicatorService.computeView(
        this.indicator.id, scope, this.context.scopeId, activityId, vizId,
      ).subscribe({
        next: (result) => {
          this.value = { value: result.value, timestamp: new Date(), metadata: result.metadata };
          this.valueChange.emit(this.value);
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
      return;
    }

    // learner/teacher/admin : lecture de la valeur pré-calculée
    this.indicatorService.getIndicatorValue(
      this.indicator.id,
      scope,
      this.context.scopeId,
    ).subscribe({
      next: (value) => {
        this.value = value;
        this.valueChange.emit(value);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  refresh(): void {
    this.loadValue();
  }

  get viz() { return this.activeViz; }

  getThresholdColor(): string {
    if (!this.value) return '#d9d9d9';
    const val = this.value.value;
    const thresholds = this.activeViz?.thresholds;
    if (!thresholds) return '#d9d9d9';
    if (val <= thresholds.good)    return '#52c41a';
    if (val <= thresholds.warning) return '#fa8c16';
    return '#ff4d4f';
  }

  isChartVisualization(): boolean {
    const t = this.activeViz?.type;
    return t === 'bar-chart' || t === 'histogram' || t === 'line-chart' || t === 'gauge';
  }

  getFormattedValue(): string {
    if (!this.value) return '—';
    if (this.isChartVisualization()) return '···';
    const val = this.value.value;
    if (Math.abs(val) >= 1000) {
      return (val / 1000).toFixed(1) + 'k';
    }
    return val.toFixed(1);
  }

  getTrendIcon(trend: string): string {
    switch (trend) {
      case 'up': return 'trending_up';
      case 'down': return 'trending_down';
      default: return 'trending_flat';
    }
  }

  getVizTypeIcon(type: ViewVisualizationType): string {
    const icons: Record<ViewVisualizationType, string> = {
      card: 'credit_card',
      gauge: 'speed',
      'line-chart': 'show_chart',
      'bar-chart': 'bar_chart',
      histogram: 'equalizer',
    };
    return icons[type] ?? 'analytics';
  }

  getVizTypeLabel(type: ViewVisualizationType): string {
    const labels: Record<ViewVisualizationType, string> = {
      card: 'Carte',
      gauge: 'Jauge',
      'line-chart': 'Courbe',
      'bar-chart': 'Barres',
      histogram: 'Histogramme',
    };
    return labels[type] ?? type;
  }

  getContextLabel(scope: string): string {
    const labels: Record<string, string> = {
      learner: 'Apprenant',
      teacher: 'Enseignant',
      admin: 'Admin',
      course: 'Cours',
      activity: 'Activité',
      group: 'Groupe',
    };
    return labels[scope] ?? scope;
  }
}
