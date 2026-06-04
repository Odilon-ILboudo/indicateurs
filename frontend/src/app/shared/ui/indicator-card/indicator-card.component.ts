// frontend/src/app/shared/ui/indicator-card/indicator-card.component.ts
import { Component, Input, Output, EventEmitter, OnInit, OnChanges, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { IndicatorService } from '../../../core/services/indicator.service';
import { DashboardContext, IndicatorDefinition, IndicatorValue } from '../../../core/models/indicator.model';

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

  @Output() valueChange = new EventEmitter<IndicatorValue>();

  value: IndicatorValue | null = null;
  isLoading: boolean = true;
  activeViewIndex = 0;

  get currentViews() {
    const scope = this.context?.scope;
    if (scope !== 'course' && scope !== 'group') return [];
    const configs = this.indicator?.contextConfigs ?? [];
    return configs.find(c => c.contextType === scope)?.views ?? [];
  }

  isChartView(index: number): boolean {
    const view = this.currentViews[index];
    return !!view && view.visualization?.type !== 'card';
  }

  onTabClick(event: Event, index: number): void {
    event.stopPropagation();
    if (!this.isChartView(index)) {
      this.selectView(index);
    }
  }

  selectView(index: number): void {
    if (index === this.activeViewIndex) return;
    this.activeViewIndex = index;
    this.loadValue();
  }

  ngOnInit(): void {
    this.loadValue();
  }

  ngOnChanges(): void {
    // Réinitialiser la vue sélectionnée lors d'un changement de contexte
    this.activeViewIndex = 0;
    if (this.indicator && this.context) this.loadValue();
  }

  private loadValue(): void {
    this.isLoading = true;
    const scope = this.context.scope;

    if ((scope === 'course' || scope === 'group') && this.context.activityId) {
      const configs = this.indicator.contextConfigs ?? [];
      const ctxConfig = configs.find(c => c.contextType === scope);
      const views = ctxConfig?.views ?? [];
      const viewId = views[this.activeViewIndex]?.id ?? views[0]?.id;
      if (!viewId) {
        this.isLoading = false;
        this.cdr.detectChanges();
        return;
      }
      this.indicatorService.computeView(
        this.indicator.id, scope, this.context.scopeId, viewId, this.context.activityId,
      ).subscribe({
        next: (result) => {
          this.value = { value: result.value, timestamp: new Date(), metadata: result.metadata };
          this.valueChange.emit(this.value);
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error(`Failed to compute view for indicator ${this.indicator.id}:`, err);
          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
      return;
    }

    // Contexte learner : lecture de la valeur pré-calculée
    this.indicatorService.getIndicatorValue(
      this.indicator.id,
      this.context.scopeId,
    ).subscribe({
      next: (value) => {
        this.value = value;
        this.valueChange.emit(value);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(`Failed to load indicator ${this.indicator.id}:`, err);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }
  
  refresh(): void {
    this.loadValue();
  }
  
  getTrendColor(trend: string): string {
    switch (trend) {
      case 'up': return '#52c41a';
      case 'down': return '#f5222d';
      default: return '#faad14';
    }
  }
  
  getTrendIcon(trend: string): string {
    switch (trend) {
      case 'up': return 'trending_up';
      case 'down': return 'trending_down';
      default: return 'trending_flat';
    }
  }
  
  getThresholdColor(): string {
    if (!this.value) return '#d9d9d9';
    const val = this.value.value;
    // Vue active (teacher) → vue learner → legacy
    const activeView = this.currentViews[this.activeViewIndex];
    const thresholds = activeView?.visualization?.thresholds
      ?? this.indicator.contextConfigs?.find(c => c.contextType === 'learner')?.views?.[0]?.visualization?.thresholds
      ?? this.indicator?.visualization?.thresholds;
    if (!thresholds) return '#d9d9d9';
    if (val <= thresholds.good)    return '#52c41a';
    if (val <= thresholds.warning) return '#fa8c16';
    return '#ff4d4f';
  }

  getFormattedValue(): string {
    if (!this.value) return '0';
    const val = this.value.value;
    if (Math.abs(val) >= 1000) {
      return (val / 1000).toFixed(1) + 'k';
    }
    // Afficher avec une décimale pour 0 aussi
    return val.toFixed(1);
  }

  getCategoryLabel(category?: string): string {
    const labels: Record<string, string> = {
      'performance': 'Performance',
      'progress': 'Progression',
    };
    if (!category) {
      return 'Inconnu';
    }
    return labels[category] || category;
  }
}