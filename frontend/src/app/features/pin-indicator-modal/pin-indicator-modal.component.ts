import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { IndicatorService } from '../../core/services/indicator.service';
import { IndicatorDefinition, IndicatorPinContextType, IndicatorPin } from '../../core/models/indicator.model';

export interface PinIndicatorModalData {
  indicator: IndicatorDefinition;
  contextType: IndicatorPinContextType;
  contextId: string;
  /** Présent si l'indicateur est déjà figé sur cette ressource - bascule la modale en mode
   *  édition (seuils pré-remplis avec CE pin, pas les seuils par défaut de l'indicateur) et
   *  affiche le bouton "Défiger". */
  existingPin?: IndicatorPin | null;
}

/** Figer un indicateur sur un cours/une activité précis, ou modifier/retirer un pin déjà posé
 *  (mode édition si `data.existingPin` est fourni). N'écrit jamais dans les préférences perso. */
@Component({
  selector: 'ui-pin-indicator-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, NzFormModule, NzInputNumberModule, NzButtonModule, NzPopconfirmModule],
  template: `
    <div class="pin-indicator-modal">
      <p class="info">
        <mat-icon>lock</mat-icon>
        Tous les membres de cette ressource auront "{{ data.indicator.name }}" actif dans leur
        tableau de bord, sans pouvoir le désactiver.
      </p>

      <h4>Seuils de performance pour cette ressource</h4>

      <nz-form-item>
        <nz-form-label>Bon ≤</nz-form-label>
        <nz-form-control>
          <nz-input-number [(ngModel)]="thresholds.good" [nzMin]="0" style="width: 100%"></nz-input-number>
        </nz-form-control>
      </nz-form-item>

      <nz-form-item>
        <nz-form-label>Moyen ≤</nz-form-label>
        <nz-form-control>
          <nz-input-number [(ngModel)]="thresholds.warning" [nzMin]="0" style="width: 100%"></nz-input-number>
        </nz-form-control>
      </nz-form-item>

      <nz-form-item>
        <nz-form-label>Critique &gt;</nz-form-label>
        <nz-form-control>
          <nz-input-number [(ngModel)]="thresholds.critical" [nzMin]="0" style="width: 100%"></nz-input-number>
        </nz-form-control>
      </nz-form-item>

      <div class="form-actions">
        <button *ngIf="isEditMode"
          nz-button nzDanger
          nz-popconfirm
          nzPopconfirmTitle="Les étudiants ne seront plus obligés d'avoir cet indicateur sur cette ressource."
          nzPopconfirmPlacement="top"
          (nzOnConfirm)="unpin()"
          [nzLoading]="unpinning"
          style="margin-right: auto">
          Défiger
        </button>
        <button nz-button (click)="close()">Annuler</button>
        <button nz-button nzType="primary" [nzLoading]="saving" (click)="save()">
          {{ isEditMode ? 'Enregistrer les seuils' : "Figer l'indicateur" }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .pin-indicator-modal { padding: 16px; }
    .info { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #666; margin-bottom: 20px; padding: 8px; background: #fff7e6; border-radius: 4px; }
    .info mat-icon { color: #fa8c16; font-size: 20px; flex-shrink: 0; }
    h4 { margin: 0 0 12px 0; }
    nz-form-item { margin-bottom: 16px; }
    nz-form-label { width: 90px; }
    .form-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e8e8e8; }
  `],
})
export class PinIndicatorModalComponent implements OnInit {
  protected readonly data = inject(NZ_MODAL_DATA) as PinIndicatorModalData;
  private readonly modalRef = inject(NzModalRef);
  private readonly indicatorService = inject(IndicatorService);
  private readonly messageService = inject(NzMessageService);

  protected thresholds: { good: number | null; warning: number | null; critical: number | null } = {
    good: null,
    warning: null,
    critical: null,
  };
  protected saving = false;
  protected unpinning = false;
  protected readonly isEditMode = !!this.data.existingPin;

  ngOnInit(): void {
    // En édition, on repart des seuils du pin déjà posé (pas des seuils par défaut de
    // l'indicateur) - sinon rouvrir la modale écraserait silencieusement une personnalisation
    // déjà faite pour cette ressource.
    const source = this.data.existingPin?.thresholdsOverride ?? this.data.indicator.thresholds;
    this.thresholds = {
      good: source?.good ?? null,
      warning: source?.warning ?? null,
      critical: source?.critical ?? null,
    };
  }

  save(): void {
    this.saving = true;
    const hasThresholds = this.thresholds.good != null || this.thresholds.warning != null || this.thresholds.critical != null;
    this.indicatorService.createPin(
      this.data.indicator.id,
      this.data.contextType,
      this.data.contextId,
      hasThresholds
        ? { good: this.thresholds.good ?? undefined, warning: this.thresholds.warning ?? undefined, critical: this.thresholds.critical ?? undefined }
        : null,
    ).subscribe({
      next: () => {
        this.messageService.success(
          this.isEditMode ? `Seuils mis à jour pour "${this.data.indicator.name}"` : `"${this.data.indicator.name}" figé pour cette ressource`,
        );
        this.modalRef.close(true);
      },
      error: () => {
        this.messageService.error(this.isEditMode ? "Erreur lors de la mise à jour des seuils" : "Erreur lors de la création du pin");
        this.saving = false;
      },
    });
  }

  unpin(): void {
    this.unpinning = true;
    this.indicatorService.deletePin(this.data.indicator.id, this.data.contextType, this.data.contextId).subscribe({
      next: () => {
        this.messageService.success(`"${this.data.indicator.name}" défigé pour cette ressource`);
        this.modalRef.close(true);
      },
      error: () => {
        this.messageService.error('Erreur lors du défigeage');
        this.unpinning = false;
      },
    });
  }

  close(): void {
    this.modalRef.close();
  }
}
