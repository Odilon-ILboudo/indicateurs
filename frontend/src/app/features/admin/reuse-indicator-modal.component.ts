// frontend/src/app/features/admin/reuse-indicator-modal.component.ts
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { IndicatorDefinition } from '../../core/models/indicator.model';

export interface ReuseIndicatorResult {
  useGroupContext: boolean;
  contextFields: string[];
}

@Component({
  selector: 'ui-reuse-indicator-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, NzButtonModule, NzSelectModule, NzSwitchModule, NzDividerModule, NzTagModule],
  template: `
    <div class="reuse-modal">
      <p class="section-hint">
        Copie <strong>{{ source.name }}</strong> comme point de départ (nom, description,
        contexte, événements déclencheurs, seuils, visualisations et pipeline), pour
        éviter de tout reconstruire à la main. Tout reste modifiable ensuite, y compris
        le nom (une copie ne peut pas garder exactement le même nom).
      </p>

      <div class="reuse-preview">
        <span class="prev-label">Pipeline source ({{ source.formula?.pipeline?.length ?? 0 }} étapes)</span>
        <div class="reuse-step-chips">
          <nz-tag *ngFor="let s of source.formula?.pipeline">{{ s.label || s.type }}</nz-tag>
        </div>
      </div>

      <nz-divider nzDashed nzText="Redéfinir la récupération des données (optionnel)"></nz-divider>
      <div class="param-row">
        <label>Requête groupe de TP</label>
        <nz-switch [(ngModel)]="useGroupContext"
          nzCheckedChildren="Groupe" nzUnCheckedChildren="Non"></nz-switch>
      </div>
      <div class="param-row">
        <label>Filtrer par contexte</label>
        <nz-select [(ngModel)]="contextFields" nzMode="multiple" style="width:300px">
          <nz-option *ngFor="let f of contextFilterCols" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
        </nz-select>
      </div>

      <div class="reuse-modal-actions">
        <button nz-button (click)="cancel()">Annuler</button>
        <button nz-button nzType="primary" (click)="confirm()">
          <span nz-icon nzType="copy"></span>
          Utiliser ce pipeline comme point de départ
        </button>
      </div>
    </div>
  `,
  styles: [`
    .reuse-modal { display:flex; flex-direction:column; }
    .section-hint { color:#888; font-size:12px; margin:0 0 10px; }
    .param-row { display:flex; align-items:center; gap:10px; margin-top:8px; }
    .reuse-preview { margin:4px 0; }
    .prev-label { font-size:13px; font-weight:500; color:#444; }
    .reuse-step-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
    .reuse-modal-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:20px; }
  `],
})
export class ReuseIndicatorModalComponent {
  private readonly modalRef = inject(NzModalRef);
  private readonly modalData = inject(NZ_MODAL_DATA) as { source: IndicatorDefinition };

  readonly source = this.modalData.source;
  readonly contextFilterCols = [
    { value: 'user_id',     label: 'user_id - apprenant courant' },
    { value: 'activity_id', label: 'activity_id - activité sélectionnée' },
    { value: 'course_id',   label: 'course_id - cours sélectionné' },
  ];

  useGroupContext = false;
  contextFields: string[] = [];

  constructor() {
    const fetchStep: any = this.source.formula?.pipeline?.find((s: any) => s.type === 'fetch');
    const fields: string[] = fetchStep?.params?.contextFields ?? [];
    this.useGroupContext = fields.includes('group_id');
    this.contextFields = fields.filter((f: string) => f !== 'group_id');
  }

  cancel(): void {
    this.modalRef.close(null);
  }

  confirm(): void {
    const result: ReuseIndicatorResult = { useGroupContext: this.useGroupContext, contextFields: this.contextFields };
    this.modalRef.close(result);
  }
}
