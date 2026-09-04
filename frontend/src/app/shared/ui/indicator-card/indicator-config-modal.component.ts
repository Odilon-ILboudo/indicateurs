import { Component, OnInit, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzColorPickerModule } from 'ng-zorro-antd/color-picker';
import { NzModalRef } from 'ng-zorro-antd/modal';
import { IndicatorVisualization } from '../../../core/models/indicator.model';
import { ModalDataService } from './modal-data.service';

@Component({
  selector: 'app-indicator-config-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, NzFormModule, NzSelectModule, NzColorPickerModule],
  host: { '(ngModelChange)': 'onVisibilityChange()' },
  template: `
    <div class="config-modal">
      <div class="form-group">
        <label>Visualisations possibles à afficher</label>
        <div class="viz-checkboxes">
          <label *ngFor="let v of visibleVisualizations" class="viz-checkbox">
            <input
              type="checkbox"
              [checked]="isVizEnabled(v.id)"
              [disabled]="isLastSelected(v.id)"
              [title]="isLastSelected(v.id) ? 'Au moins une visualisation doit rester sélectionnée' : ''"
              (change)="toggleViz(v.id)" />
            <span>{{ v.label }} ({{ getVizTypeLabel(v.type) }})</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label>Couleur de la carte (icône, valeur, graphique)</label>
        <div class="viz-checkboxes">
          <label *ngFor="let v of enabledVisualizations" class="viz-checkbox">
            <input
              type="checkbox"
              [checked]="isActiveVizSelected(v.id)"
              (change)="selectActiveViz(v.id)" />
            <span class="color-swatch" [style.background]="v.color || '#7f8c8d'"></span>
            <span>{{ v.label }}</span>
          </label>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .config-modal {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 8px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    label {
      font-weight: 500;
      font-size: 13px;
      color: #262626;
      margin: 0;
    }

    .viz-checkboxes {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .viz-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 8px;
      border-radius: 4px;
      transition: background 0.15s;
      font-weight: normal;
      font-size: 13px;
      color: #595959;
    }

    .viz-checkbox:hover {
      background: #f0f5ff;
    }

    .viz-checkbox input[type="checkbox"] {
      cursor: pointer;
    }

    .color-swatch {
      display: inline-block;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 1px solid rgba(0,0,0,0.15);
      flex-shrink: 0;
    }
  `],
})
export class IndicatorConfigModalComponent implements OnInit {
  readonly modalRef = inject(NzModalRef);
  private readonly modalData = inject(ModalDataService);

  @Input() color: string = '#1890ff';
  @Input() vizId: string | null = null;
  @Input() hasMultipleViz: boolean = false;

  visibleVisualizations: IndicatorVisualization[] = [];
  selectedVizIds = new Set<string>();
  /** Visualisation dont la couleur/valeur pilote la carte (icône + valeur + graphique) - un
   seul choix possible, toujours parmi les visualisations actuellement activées.
  */
  private selectedActiveVizId: string | null = null;

  ngOnInit(): void {
    // Récupérer les données du service
    this.visibleVisualizations = this.modalData.visualizations;

    // Initialiser avec les visualisations actuellement activées
    this.modalData.enabledVizIds.forEach(vizId => this.selectedVizIds.add(vizId));

    this.selectedActiveVizId = this.modalData.activeVizId && this.selectedVizIds.has(this.modalData.activeVizId)
      ? this.modalData.activeVizId
      : (this.visibleVisualizations.find(v => this.selectedVizIds.has(v.id))?.id ?? null);
  }

  /** Sous-ensemble de visibleVisualizations réellement cochées - seules celles-ci peuvent
   piloter la couleur/valeur de la carte (pas de sens de choisir une visualisation masquée).
  */
  get enabledVisualizations(): IndicatorVisualization[] {
    return this.visibleVisualizations.filter(v => this.selectedVizIds.has(v.id));
  }

  isVizEnabled(vizId: string): boolean {
    return this.selectedVizIds.has(vizId);
  }

  toggleViz(vizId: string): void {
    if (this.selectedVizIds.has(vizId)) {
      if (this.selectedVizIds.size === 1) return;
      this.selectedVizIds.delete(vizId);
      /*
      La visualisation démasquée ne peut plus piloter la carte - repli sur la première
      visualisation restée activée.
      */
      if (this.selectedActiveVizId === vizId) {
        this.selectedActiveVizId = this.visibleVisualizations.find(v => this.selectedVizIds.has(v.id))?.id ?? null;
      }
    } else {
      this.selectedVizIds.add(vizId);
    }
  }

  isLastSelected(vizId: string): boolean {
    return this.selectedVizIds.size === 1 && this.selectedVizIds.has(vizId);
  }

  isActiveVizSelected(vizId: string): boolean {
    return this.selectedActiveVizId === vizId;
  }

  /** Choix unique (case cochée = celle-ci, les autres se décochent) - pas de retour à un mode
   "automatique" : il y a toujours exactement une visualisation active.
  */
  selectActiveViz(vizId: string): void {
    this.selectedActiveVizId = vizId;
  }

  onVisibilityChange(): void {
    // Callback pour notifier les changements
  }

  getEnabledVizIds(): string[] {
    return Array.from(this.selectedVizIds);
  }

  getSelectedActiveVizId(): string | null {
    return this.selectedActiveVizId;
  }

  getVizTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      card: 'Carte',
      gauge: 'Jauge',
      'line-chart': 'Courbe',
      'bar-chart': 'Barres',
      histogram: 'Histogramme',
    };
    return labels[type] ?? type;
  }
}
