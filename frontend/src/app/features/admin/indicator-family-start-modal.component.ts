import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzModalRef } from 'ng-zorro-antd/modal';
import { IndicatorScope } from '../../core/models/indicator.model';
import { CONTEXT_LABELS } from './indicator-builder.component';

export interface FamilyStartResult {
  familyName: string;
  description: string;
  contextTypes: IndicatorScope[];
}

@Component({
  selector: 'ui-family-start-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, NzFormModule, NzInputModule, NzSelectModule, NzButtonModule, MatIconModule, NzToolTipModule],
  template: `
    <div class="family-start">
      <p style="color:#888;font-size:13px;margin-top:0">
        Une famille regroupe plusieurs indicateurs créés ensemble, un par contexte sélectionné,
        partageant le même nom de base et la même description - et bien sûr, on peut les modifier
        sur chaque indicateur. Les événements déclencheurs se définissent individuellement, pour
        chaque indicateur, à l'étape suivante. Vous configurerez ensuite la visualisation et la
        formule de chacun, l'un après l'autre.
      </p>

      <nz-form-item>
        <nz-form-label [nzRequired]="true">
          Nom de la famille
          <mat-icon style="font-size:14px;width:14px;height:14px;vertical-align:middle;margin-left:4px;color:#8c8c8c;cursor:help"
            nz-tooltip="Nom commun à tous les indicateurs de la famille. Il sera affiché comme titre du groupe dans le tableau de bord."
            nzTooltipPlacement="right">info_outline</mat-icon>
        </nz-form-label>
        <nz-form-control>
          <input nz-input [(ngModel)]="familyName" placeholder="ex: Tentatives avant première réussite" />
        </nz-form-control>
      </nz-form-item>

      <nz-form-item>
        <nz-form-label>
          Description
          <mat-icon style="font-size:14px;width:14px;height:14px;vertical-align:middle;margin-left:4px;color:#8c8c8c;cursor:help"
            nz-tooltip="Explication de ce que mesure cette famille. Partagée par tous les indicateurs, visible dans la page de sélection."
            nzTooltipPlacement="right">info_outline</mat-icon>
        </nz-form-label>
        <nz-form-control>
          <textarea nz-input [(ngModel)]="description" rows="3"
            placeholder="Décrivez ce que mesure cette famille d'indicateurs…"></textarea>
        </nz-form-control>
      </nz-form-item>

      <nz-form-item>
        <nz-form-label>
          Contextes à couvrir
          <mat-icon style="font-size:14px;width:14px;height:14px;vertical-align:middle;margin-left:4px;color:#8c8c8c;cursor:help"
            nz-tooltip="Sélectionnez les rôles ou niveaux pour lesquels cet indicateur sera disponible. Un indicateur distinct sera créé pour chaque contexte choisi. Laissez vide pour créer la famille sans indicateur pour l'instant - vous pourrez lui en ajouter plus tard."
            nzTooltipPlacement="right">info_outline</mat-icon>
        </nz-form-label>
        <nz-form-control>
          <nz-select [(ngModel)]="contextTypes" nzMode="multiple"
            nzPlaceHolder="Optionnel - laissez vide pour une famille sans indicateur" style="width:100%">
            <nz-option *ngFor="let c of contextOptions" [nzValue]="c.value" [nzLabel]="c.label"></nz-option>
          </nz-select>
        </nz-form-control>
      </nz-form-item>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <button nz-button (click)="cancel()">Annuler</button>
        <button nz-button nzType="primary" [disabled]="!canStart" (click)="start()">
          {{ contextTypes.length ? 'Configurer les indicateurs' : 'Créer la famille vide' }}
        </button>
      </div>
    </div>
  `,
  styles: [`.family-start { display:flex; flex-direction:column; }`],
})
export class IndicatorFamilyStartModalComponent {
  private readonly modalRef = inject(NzModalRef);

  familyName = '';
  description = '';
  contextTypes: IndicatorScope[] = [];

  readonly contextOptions: { value: IndicatorScope; label: string }[] =
    (Object.keys(CONTEXT_LABELS) as IndicatorScope[]).map(value => ({ value, label: CONTEXT_LABELS[value] }));

  get canStart(): boolean {
    return !!this.familyName.trim();
  }

  start(): void {
    if (!this.canStart) return;
    const result: FamilyStartResult = {
      familyName: this.familyName.trim(),
      description: this.description.trim(),
      contextTypes: this.contextTypes,
    };
    this.modalRef.close(result);
  }

  cancel(): void { this.modalRef.close(null); }
}
