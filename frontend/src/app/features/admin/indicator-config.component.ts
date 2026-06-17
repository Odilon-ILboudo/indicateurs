// web/src/app/shared/components/admin-indicator-manager/indicator-config.component.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzColorPickerModule } from 'ng-zorro-antd/color-picker';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { IndicatorService } from '../../core/services/indicator.service';
import { IndicatorDefinition } from '../../core/models/indicator.model';

@Component({
  selector: 'ui-indicator-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    NzFormModule,
    NzInputModule,
    NzInputNumberModule,
    NzColorPickerModule,
    NzSelectModule,
    NzButtonModule,
  ],
  template: `
    <div class="indicator-config">
      <div class="config-header">
        <mat-icon>settings</mat-icon>
        <span>Personnalisation de l'affichage</span>
      </div>
      <p class="info">Ces paramètres ne modifient pas le calcul de l'indicateur, uniquement son apparence.</p>
      
      <!-- Nom personnalisé -->
      <nz-form-item>
        <nz-form-label>Nom affiché</nz-form-label>
        <nz-form-control>
          <input nz-input [(ngModel)]="config.name" placeholder="Nom de l'indicateur" />
        </nz-form-control>
      </nz-form-item>
      
      <!-- Description -->
      <nz-form-item>
        <nz-form-label>Description</nz-form-label>
        <nz-form-control>
          <textarea nz-input [(ngModel)]="config.description" rows="2" placeholder="Description"></textarea>
        </nz-form-control>
      </nz-form-item>
      
      <!-- Icône -->
      <nz-form-item>
        <nz-form-label>Icône</nz-form-label>
        <nz-form-control>
          <div class="icon-selector">
            <button *ngFor="let icon of availableIcons" 
                    type="button" 
                    [class.selected]="config.icon === icon.value"
                    (click)="config.icon = icon.value"
                    class="icon-btn">
              <mat-icon>{{ icon.value }}</mat-icon>
            </button>
          </div>
        </nz-form-control>
      </nz-form-item>
      
      <!-- Couleur -->
      <nz-form-item>
        <nz-form-label>Couleur</nz-form-label>
        <nz-form-control>
          <nz-color-picker [(ngModel)]="config.color" [nzFormat]="'hex'"></nz-color-picker>
          <span class="color-preview" [style.backgroundColor]="config.color"></span>
        </nz-form-control>
      </nz-form-item>
      
      <!-- Unité -->
      <nz-form-item>
        <nz-form-label>Unité</nz-form-label>
        <nz-form-control>
          <input nz-input [(ngModel)]="config.unit" placeholder="ex: %, tentatives, points" />
        </nz-form-control>
      </nz-form-item>
      
      <h4>Seuils de performance</h4>
      
      <!-- Excellent -->
      <nz-form-item>
        <nz-form-label>Excellent (≥)</nz-form-label>
        <nz-form-control>
          <nz-input-number [(ngModel)]="config.thresholds.good" [nzMin]="0" [nzMax]="100" style="width: 100%"></nz-input-number>
        </nz-form-control>
      </nz-form-item>
      
      <!-- Attention -->
      <nz-form-item>
        <nz-form-label>Attention (≥)</nz-form-label>
        <nz-form-control>
          <nz-input-number [(ngModel)]="config.thresholds.warning" [nzMin]="0" [nzMax]="100" style="width: 100%"></nz-input-number>
        </nz-form-control>
      </nz-form-item>
      
      
      <!-- Actions -->
      <div class="form-actions">
        <button nz-button (click)="close()">Annuler</button>
        <button nz-button nzType="primary" (click)="save()">Enregistrer</button>
      </div>
    </div>
  `,
  styles: [`
    .indicator-config { padding: 16px; max-height: 70vh; overflow-y: auto; }
    .config-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .config-header mat-icon { font-size: 24px; color: #1890ff; }
    .info { font-size: 12px; color: #666; margin-bottom: 24px; padding: 8px; background: #e6f7ff; border-radius: 4px; }
    h4 { margin: 16px 0 12px 0; }
    nz-form-item { margin-bottom: 16px; }
    nz-form-label { width: 120px; }
    .color-preview { display: inline-block; width: 32px; height: 32px; border-radius: 4px; margin-left: 12px; border: 1px solid #d9d9d9; vertical-align: middle; }
    .icon-selector { display: flex; flex-wrap: wrap; gap: 8px; }
    .icon-btn { width: 40px; height: 40px; border-radius: 8px; border: 1px solid #d9d9d9; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
    .icon-btn:hover { border-color: #1890ff; transform: scale(1.05); }
    .icon-btn.selected { border-color: #1890ff; background: #e6f7ff; box-shadow: 0 0 0 2px rgba(24,144,255,0.2); }
    .form-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e8e8e8; }
  `]
})
export class IndicatorConfigComponent implements OnInit {
  private readonly modalData = inject(NZ_MODAL_DATA, { optional: true }) as { indicator?: IndicatorDefinition } | null;
  private modalRef = inject(NzModalRef);
  private indicatorService = inject(IndicatorService);
  private messageService = inject(NzMessageService);
  
  indicator!: IndicatorDefinition;
  
  protected availableIcons = [
    { value: 'star', label: 'Étoile' },
    { value: 'repeat', label: 'Répéter' },
    { value: 'check_circle', label: 'Vérifié' },
    { value: 'access_time', label: 'Temps' },
    { value: 'trending_up', label: 'Tendance' },
    { value: 'analytics', label: 'Analyse' },
    { value: 'speed', label: 'Vitesse' },
    { value: 'emoji_events', label: 'Classement' }
  ];
  
  protected config = {
    name: '',
    description: '',
    icon: 'analytics',
    color: '#1890ff',
    unit: '',
    thresholds: { good: null as number | null, warning: null as number | null }
  };

  ngOnInit(): void {
    if (this.modalData?.indicator) {
      this.indicator = this.modalData.indicator;

      const viz0 = this.indicator.visualizations?.[0];
      this.config.name = this.indicator.name;
      this.config.description = this.indicator.description || '';
      this.config.icon = viz0?.icon || 'analytics';
      this.config.color = viz0?.color || '#1890ff';
      this.config.unit = viz0?.unit || '';
      this.config.thresholds = {
        good: this.indicator.thresholds?.good ?? null,
        warning: this.indicator.thresholds?.warning ?? null,
      };
    }
  }

  save(): void {
    const viz0 = this.indicator.visualizations?.[0];
    const updatedVizs = this.indicator.visualizations?.map((v, i) =>
      i === 0 ? { ...v, icon: this.config.icon, color: this.config.color, unit: this.config.unit } : v
    ) ?? [];
    const hasThresholds = this.config.thresholds.good != null || this.config.thresholds.warning != null;
    const updates = {
      name: this.config.name,
      description: this.config.description,
      thresholds: hasThresholds ? { good: this.config.thresholds.good ?? undefined, warning: this.config.thresholds.warning ?? undefined } : null,
      visualizations: updatedVizs.length ? updatedVizs : [{
        id: viz0?.id ?? crypto.randomUUID(),
        label: viz0?.label ?? 'Vue',
        type: viz0?.type ?? 'card',
        icon: this.config.icon,
        color: this.config.color,
        unit: this.config.unit,
      }],
    };
    
    this.indicatorService.updateIndicator(this.indicator.id, updates).subscribe({
      next: () => {
        this.messageService.success('Configuration mise à jour');
        this.modalRef.close(true);
      },
      error: () => this.messageService.error('Erreur lors de la mise à jour')
    });
  }
  
  close(): void {
    this.modalRef.close();
  }
}