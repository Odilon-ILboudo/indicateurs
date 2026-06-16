import { Component, Input, Output, EventEmitter, OnInit, OnChanges, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzColorPickerModule } from 'ng-zorro-antd/color-picker';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMessageService } from 'ng-zorro-antd/message';
import { FormsModule } from '@angular/forms';
import { IndicatorService } from '../../../core/services/indicator.service';
import { DashboardContext, IndicatorDefinition, IndicatorValue, IndicatorVisualization } from '../../../core/models/indicator.model';
import { environment } from '../../../../environments/environment';
import { IndicatorConfigModalComponent } from './indicator-config-modal.component';
import { ModalDataService } from './modal-data.service';

@Component({
  selector: 'ui-indicator-card',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule, MatCardModule, MatTooltipModule, MatButtonModule, RouterModule,
    NzModalModule, NzFormModule, NzSelectModule, NzColorPickerModule, NzButtonModule
  ],
  templateUrl: './indicator-card.component.html',
  styleUrls: ['./indicator-card.component.scss']
})
export class IndicatorCardComponent implements OnInit, OnChanges {
  private readonly indicatorService = inject(IndicatorService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly modal = inject(NzModalService);
  private readonly message = inject(NzMessageService);
  private readonly modalData = inject(ModalDataService);

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
  userColorPreference: string | null = null;

  // Configuration modal
  configColor: string = '';
  configVizId: string | null = null;
  isSavingConfig: boolean = false;

  ngOnInit(): void {
    this.initActiveViz();
    this.loadUserColorPreference();
    this.loadValue();
  }

  ngOnChanges(): void {
    if (this.indicator && this.context) {
      this.initActiveViz();
      this.loadUserColorPreference();
      this.loadValue();
    }
  }

  private loadUserColorPreference(): void {
    const userId = environment.defaultUserId;
    this.indicatorService.getUserPreference(userId, this.indicator.id).subscribe({
      next: (preference) => {
        this.applyUserColorForActiveViz(preference?.displayPreferences);
      },
    });
  }

  private applyUserColorForActiveViz(displayPreferences?: any): void {
    if (displayPreferences && this.activeVizId) {
      // Couleur personnalisée pour cette visualisation spécifique
      const colorKey = `viz_${this.activeVizId}`;
      this.userColorPreference = displayPreferences[colorKey] || null;
    } else {
      this.userColorPreference = null;
    }
    this.cdr.detectChanges();
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

  get activeViz(): IndicatorVisualization | undefined {
    return this.visibleVisualizations.find(v => v.id === this.activeVizId)
      ?? this.visibleVisualizations[0];
  }

  private loadValue(): void {
    this.isLoading = true;
    const scope = this.context.scope;

    if (scope === 'course' || scope === 'group' || scope === 'activity') {
      if (scope === 'group' && !this.context.activityId) {
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
    if (!this.value) return '-';
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

  getTrendLabel(trend: string): string {
    switch (trend) {
      case 'up': return 'En hausse par rapport aux dernières valeurs';
      case 'down': return 'En baisse par rapport aux dernières valeurs';
      default: return 'Stable par rapport aux dernières valeurs';
    }
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

  openConfigModal(event: Event): void {
    event.stopPropagation();

    // Passer les données via le service
    this.modalData.setData(
      this.indicator?.visualizations || [],
      this.visibleVisualizations.map(v => v.id)
    );

    const modal = this.modal.create({
      nzTitle: `Configuration - ${this.indicator.name}`,
      nzWidth: 500,
      nzClosable: true,
      nzContent: IndicatorConfigModalComponent,
      nzOkText: 'Sauvegarder',
      nzCancelText: 'Annuler',
      nzOnOk: (componentInstance: IndicatorConfigModalComponent) => {
        return this.saveVizVisibility(componentInstance, modal);
      },
    });
  }

  private saveVizVisibility(componentInstance: IndicatorConfigModalComponent, modal: any): Promise<void> {
    this.isSavingConfig = true;
    const userId = environment.defaultUserId;
    const enabledVizIds = componentInstance.getEnabledVizIds();
    const allVizIds = enabledVizIds.length === this.visibleVisualizations.length ? null : enabledVizIds;

    this.indicatorService.setEnabledVizIds(userId, this.indicator.id, allVizIds);
    this.message.success('Visualisations sauvegardées');
    this.isSavingConfig = false;
    this.cdr.detectChanges();

    return Promise.resolve();
  }

  private savePreferences(modal: any): Promise<void> {
    this.isSavingConfig = true;
    const userId = environment.defaultUserId;

    // Construire displayPreferences avec la clé viz_{vizId}
    const vizIdToSave = this.configVizId || this.activeVizId;
    const displayPreferences = {
      [`viz_${vizIdToSave}`]: this.configColor,
    };

    return new Promise((resolve, reject) => {
      // Appeler l'API pour sauvegarder les préférences
      this.indicatorService.updateUserPreference(userId, this.indicator.id, {
        displayPreferences,
        activeVizId: this.configVizId ?? undefined,
      }).subscribe({
        next: () => {
          this.message.success('Préférences sauvegardées');

          // Mettre à jour la couleur de l'icône immédiatement pour cette viz
          this.userColorPreference = this.configColor;

          // Mettre à jour la visualisation active si elle a changé
          if (this.configVizId && this.configVizId !== this.activeVizId) {
            this.activeVizId = this.configVizId;
          }

          this.isSavingConfig = false;
          this.cdr.detectChanges();
          this.loadValue();
          resolve();
        },
        error: (err) => {
          this.message.error('Erreur lors de la sauvegarde');
          this.isSavingConfig = false;
          reject(err);
        },
      });
    });
  }
}
