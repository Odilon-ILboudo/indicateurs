// frontend/src/app/features/admin/admin-indicator-manager.component.ts
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule, NzModalService, NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { IndicatorService } from '../../core/services/indicator.service';
import { IndicatorDefinition, IndicatorFeedback, IndicatorScope } from '../../core/models/indicator.model';
import { IndicatorConfigComponent } from './indicator-config.component';
import { IndicatorBuilderComponent, CONTEXT_LABELS, IndicatorFamilyPreset } from './indicator-builder.component';
import { EventRuleManagerComponent } from './event-rule-manager.component';
import { buildIndicatorDisplayRows, IndicatorDisplayRow } from '../../shared/utils/indicator-family-grouping';

// ── Modale : logs d'exécution ─────────────────────────────────────────────────

@Component({
  selector: 'ui-logs-modal',
  standalone: true,
  imports: [CommonModule, NzEmptyModule],
  template: `
    <div class="logs-wrap" *ngIf="logs?.length; else empty">
      <table style="width:100%;min-width:900px;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#fafafa;border-bottom:1px solid #f0f0f0">
            <th style="padding:6px 8px;text-align:left">Date</th>
            <th style="padding:6px 8px;text-align:left">userId</th>
            <th style="padding:6px 8px;text-align:right">Valeur</th>
            <th style="padding:6px 8px;text-align:right">Durée</th>
            <th style="padding:6px 8px;text-align:left">Erreur</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let log of logs"
            style="border-bottom:1px solid #f0f0f0"
            [style.background]="log.error ? '#fff2f0' : 'white'">
            <td style="padding:5px 8px;white-space:nowrap">{{ log.executedAt | date:'dd/MM HH:mm:ss' }}</td>
            <td style="padding:5px 8px;font-family:monospace;color:#666;word-break:break-all">
              {{ log.userId }}
            </td>
            <td style="padding:5px 8px;text-align:right;font-weight:500;white-space:nowrap">
              <span *ngIf="log.value !== null && log.value !== undefined">
                {{ log.value | number:'1.0-2' }}
              </span>
              <span *ngIf="log.value === null || log.value === undefined" style="color:#bbb">-</span>
            </td>
            <td style="padding:5px 8px;text-align:right;color:#888;white-space:nowrap">{{ log.durationMs }} ms</td>
            <td style="padding:5px 8px;color:#ff4d4f;font-size:11px;word-break:break-word">
              {{ log.error }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ng-template #empty>
      <nz-empty nzNotFoundContent="Aucun log d'exécution pour cet indicateur."></nz-empty>
    </ng-template>
  `,
  styles: [`.logs-wrap { max-height:65vh; overflow-y:auto; overflow-x:auto; }`],
})
export class LogsModalComponent {
  readonly modalData = inject(NZ_MODAL_DATA) as { logs: any[] };
  get logs() { return this.modalData.logs; }
}

// ── Modale : démarrage du wizard "famille d'indicateurs" ──────────────────────

export interface FamilyStartResult {
  familyName: string;
  description: string;
  contextTypes: IndicatorScope[];
}

@Component({
  selector: 'ui-family-start-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, NzFormModule, NzInputModule, NzSelectModule, NzButtonModule, MatIconModule, NzTooltipModule],
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

// ── Composant principal ───────────────────────────────────────────────────────

@Component({
  selector: 'ui-admin-indicator-manager',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule,
    NzTableModule, NzButtonModule, NzModalModule,
    NzSwitchModule, NzTagModule, NzTooltipModule,
    NzPopconfirmModule, NzBadgeModule, NzDividerModule,
    NzEmptyModule, NzSpinModule, NzTabsModule, NzRateModule,
  ],
  template: `
    <div class="admin-manager">

      <!-- En-tête -->
      <div class="header">
        <div>
          <h2 style="margin:0">Gestion des indicateurs</h2>
          <p style="margin:4px 0 0;color:#888;font-size:13px">
            Créez et configurez des indicateurs sans toucher au code source.
          </p>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap">
          <button nz-button (click)="openEventRuleManager()" class="icon-btn">
            <mat-icon>bolt</mat-icon>
            Événements &amp; déclencheurs
          </button>
          <button nz-button (click)="openFamilyWizard()" class="icon-btn">
            <mat-icon>folder_special</mat-icon>
            Créer une famille
          </button>
          <button nz-button nzType="primary" (click)="openBuilder()" class="icon-btn">
            <mat-icon>add</mat-icon>
            Nouvel indicateur
          </button>
        </div>
      </div>

      <nz-tabs [nzSelectedIndex]="groupingFilter === 'standalone' ? 0 : 1" (nzSelectedIndexChange)="onTabChange($event)">
        <nz-tab nzTitle="Indicateurs uniques"></nz-tab>
        <nz-tab nzTitle="Familles"></nz-tab>
      </nz-tabs>

      <nz-spin [nzSpinning]="loading">
        <nz-table
          #table
          [nzData]="displayRows"
          nzBordered
          [nzPageSize]="20"
          nzSize="small">

          <thead>
            <tr>
              <th>Nom</th>
              <th>Contexte</th>
              <th>Événements</th>
              <th style="width:80px;text-align:center">Statut</th>
              <th style="width:200px;text-align:center">Actions</th>
            </tr>
          </thead>

          <tbody>
            <ng-container *ngFor="let row of table.data" [ngSwitch]="row.kind">

              <!-- Ligne d'en-tête de famille, repliable -->
              <tr *ngSwitchCase="'family'" class="family-row" (click)="toggleFamily(row.familyName)">
                <td colspan="5">
                  <span style="display:inline-flex;align-items:center;gap:6px;line-height:1;width:100%">
                    <mat-icon style="font-size:18px;width:18px;height:18px;line-height:1;color:#722ed1">{{ row.expanded ? 'expand_more' : 'chevron_right' }}</mat-icon>
                    <mat-icon style="font-size:16px;width:16px;height:16px;line-height:1;color:#722ed1">folder_special</mat-icon>
                    <strong>{{ row.familyName }}</strong>
                    <nz-tag nzColor="purple">{{ row.members.length }} indicateur{{ row.members.length > 1 ? 's' : '' }}</nz-tag>
                    <span style="margin-left:auto;display:inline-flex;gap:4px" (click)="$event.stopPropagation()">
                      <mat-icon class="family-edit-icon" (click)="renameFamily(row)" nz-tooltip="Renommer la famille">edit</mat-icon>
                      <mat-icon class="family-edit-icon" (click)="openAddExistingToFamily(row.familyName)" nz-tooltip="Ajouter un indicateur existant">playlist_add</mat-icon>
                      <mat-icon class="family-edit-icon" (click)="createNewInFamily(row.familyName)" nz-tooltip="Créer un nouvel indicateur dans cette famille">add_circle_outline</mat-icon>
                    </span>
                  </span>
                </td>
              </tr>

              <!-- Indicateur autonome ou membre d'une famille dépliée : même rendu et fonctionnalités qu'un indicateur unique -->
              <ng-container *ngSwitchCase="'standalone'" [ngTemplateOutlet]="indicatorRow" [ngTemplateOutletContext]="{ $implicit: row.indicator, isMember: false }" />
              <ng-container *ngSwitchCase="'member'" [ngTemplateOutlet]="indicatorRow" [ngTemplateOutletContext]="{ $implicit: row.indicator, isMember: true }" />

            </ng-container>
          </tbody>

        </nz-table>

        <nz-empty *ngIf="!loading && displayRows.length === 0"
          nzNotFoundContent="Aucun indicateur - créez-en un avec le bouton ci-dessus.">
        </nz-empty>
      </nz-spin>

      <ng-template #indicatorRow let-ind let-isMember="isMember">
        <tr [class.member-row]="isMember">
          <!-- Nom + description -->
          <td>
            <div style="display:flex;align-items:flex-start;gap:6px">
              <mat-icon *ngIf="isMember" style="font-size:16px;color:#bbb;margin-top:2px">subdirectory_arrow_right</mat-icon>
              <div>
                <div style="font-weight:500">{{ ind.name }}</div>
                <div style="font-size:11px;color:#999;margin-top:2px">
                  {{ ind.description | slice:0:80 }}{{ (ind.description?.length ?? 0) > 80 ? '…' : '' }}
                </div>
              </div>
            </div>
          </td>

          <!-- Contexte -->
          <td>
            <nz-tag *ngIf="ind.contextType" nzColor="blue">{{ ind.contextType }}</nz-tag>
            <span *ngIf="!ind.contextType" style="color:#bbb">-</span>
            <span *ngIf="ind.visualizations?.length" style="font-size:11px;color:#999;margin-left:6px">
              {{ ind.visualizations.length }} vue{{ ind.visualizations.length > 1 ? 's' : '' }}
            </span>
          </td>

          <!-- Événements -->
          <td>
            <nz-tag *ngFor="let ev of ind.requiredEvents" nzColor="purple">{{ ev }}</nz-tag>
            <span *ngIf="!ind.requiredEvents?.length" style="color:#bbb">-</span>
          </td>

          <!-- Switch actif/inactif -->
          <td style="text-align:center">
            <nz-switch
              [(ngModel)]="ind.isActive"
              (ngModelChange)="toggleActive(ind)"
              [nzCheckedChildren]="'ON'"
              [nzUnCheckedChildren]="'OFF'">
            </nz-switch>
          </td>

          <!-- Actions -->
          <td>
            <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">

              <button nz-button nzType="text" nzSize="small"
                nz-tooltip="Modifier la formule et la définition"
                (click)="openBuilder(ind)">
                <mat-icon style="font-size:16px;line-height:1.3">edit</mat-icon>
              </button>

              <!-- Retours d'expérience -->
              <button nz-button nzType="text" nzSize="small"
                nz-tooltip="Voir les retours d'expérience"
                (click)="openFeedbacks(ind)">
                <mat-icon style="font-size:16px;line-height:1.3">rate_review</mat-icon>
              </button>

              <!--
              <button nz-button nzType="default" nzSize="small"
                nz-tooltip="Paramètres d'affichage"
                (click)="openConfig(ind)">
                <mat-icon style="font-size:16px;line-height:1.3">settings</mat-icon>
              </button>
              -->

              <!-- Logs d'exécution -->
              <button
                nz-button nzType="text" nzSize="small"
                nz-tooltip="Logs d'exécution"
                [nzLoading]="logsLoading.has(ind.id)"
                (click)="openLogs(ind)">
                <mat-icon *ngIf="!logsLoading.has(ind.id)" style="font-size:16px;line-height:1.3">description</mat-icon>
              </button>

              <!-- Recalcul -->
              <button
                nz-button nzType="text" nzSize="small"
                nz-tooltip="Recalculer pour tous les utilisateurs ayant ajouté cet indicateur"
                [nzLoading]="recalculating.has(ind.id)"
                nz-popconfirm
                nzPopconfirmTitle="Recalculer les valeurs pour tous les utilisateurs actifs ?"
                nzPopconfirmPlacement="left"
                (nzOnConfirm)="recalculate(ind)">
                <mat-icon *ngIf="!recalculating.has(ind.id)" style="font-size:16px;line-height:1.3">replay</mat-icon>
              </button>

              <!-- Retrait de la famille (membres) vs suppression définitive (tous) -->
              <ng-container *ngIf="isMember; else deleteBtn">
                <button nz-button nzType="text" nzDanger nzSize="small"
                  nz-tooltip="Retirer de la famille ou supprimer"
                  (click)="openRemoveFromFamily(ind)">
                  <mat-icon style="font-size:16px;line-height:1.3">remove_circle_outline</mat-icon>
                </button>
              </ng-container>
              <ng-template #deleteBtn>
                <button nz-button nzType="text" nzDanger nzSize="small"
                  nz-tooltip="Supprimer définitivement"
                  nz-popconfirm
                  nzPopconfirmTitle="Supprimer cet indicateur ?"
                  nzPopconfirmPlacement="left"
                  (nzOnConfirm)="deleteIndicator(ind)">
                  <mat-icon style="font-size:16px;line-height:1.3">delete</mat-icon>
                </button>
              </ng-template>

            </div>
          </td>
        </tr>
      </ng-template>


    </div>

  <ng-template #renameFamilyTpl>
    <input nz-input [(ngModel)]="renameFamilyInput" placeholder="Nouveau nom de la famille" style="width:100%;margin-top:4px" />
  </ng-template>

  <!-- Modal : prévisualisation d'un indicateur unique (s'affiche au-dessus) -->
  <nz-modal
    [nzVisible]="!!previewedStandaloneId"
    [nzTitle]="previewedStandaloneIndicator?.name || ''"
    [nzFooter]="null"
    [nzWidth]="520"
    nzCentered
    (nzOnCancel)="previewedStandaloneId = null; addExistingModalVisible = true">
    <ng-container *nzModalContent>
      <ng-container *ngIf="previewedStandaloneIndicator as ind">
        <div class="prev-card">

          <div class="prev-row">
            <span class="prev-label">Description</span>
            <p class="prev-value">{{ ind.description || '-' }}</p>
          </div>

          <div class="prev-row prev-meta">
            <div class="prev-meta-cell">
              <span class="prev-label">Contexte</span>
              <p class="prev-value">{{ ind.contextType }}</p>
            </div>
            <div class="prev-meta-cell prev-meta-sep">
              <span class="prev-label">Statut</span>
              <nz-tag [nzColor]="ind.isActive ? 'green' : 'default'" style="margin-top:2px">
                {{ ind.isActive ? 'Actif' : 'Inactif' }}
              </nz-tag>
            </div>
          </div>

          <div class="prev-row" *ngIf="ind.interpretationHint">
            <span class="prev-label">Aide à l'analyse</span>
            <p class="prev-value prev-hint">{{ ind.interpretationHint }}</p>
          </div>

          <div class="prev-row" *ngIf="ind.visualizations?.length">
            <span class="prev-label">Visualisations</span>
            <div class="prev-vizs">
              <div *ngFor="let v of ind.visualizations" class="prev-viz-chip">
                <mat-icon [style.color]="v.color || '#8c8c8c'">{{ v.icon || 'bar_chart' }}</mat-icon>
                {{ v.label }}
              </div>
            </div>
          </div>

          <div class="prev-row prev-row--last">
            <span class="prev-label">Événements déclencheurs</span>
            <div class="prev-tags">
              <ng-container *ngIf="ind.requiredEvents?.length; else noEvtP">
                <nz-tag *ngFor="let e of ind.requiredEvents" nzColor="blue">{{ e }}</nz-tag>
              </ng-container>
              <ng-template #noEvtP>
                <span class="prev-empty">Aucun événement configuré</span>
              </ng-template>
            </div>
          </div>

        </div>
      </ng-container>
    </ng-container>
  </nz-modal>

  <!-- Modal : ajouter un indicateur existant à une famille -->
  <nz-modal
    [(nzVisible)]="addExistingModalVisible"
    [nzTitle]="'Ajouter à la famille « ' + addExistingFamilyName + ' »'"
    [nzFooter]="addExistingFooter"
    [nzWidth]="480"
    (nzOnCancel)="addExistingModalVisible = false">
    <ng-container *nzModalContent>
      <p style="color:#595959;margin-bottom:10px">Cliquez sur un indicateur pour le sélectionner.</p>
      <p *ngIf="standaloneOptions.length === 0" style="color:#8c8c8c;font-style:italic">
        Aucun indicateur unique disponible.
      </p>
      <div *ngIf="standaloneOptions.length > 0" class="standalone-picker">
        <div *ngFor="let opt of standaloneOptions"
          class="standalone-picker-item"
          [class.standalone-picker-item--selected]="addExistingSelectedId === opt.value"
          (click)="addExistingSelectedId = opt.value; previewedStandaloneId = null">
          <span class="standalone-picker-label">{{ opt.label }}</span>
          <div class="standalone-picker-actions" (click)="$event.stopPropagation()">
            <button nz-button nzType="text" nzSize="small" class="standalone-eye-btn"
              nz-tooltip="Voir les détails"
              (click)="addExistingModalVisible = false; previewedStandaloneId = opt.value">
              <mat-icon>visibility</mat-icon>
            </button>
            <mat-icon *ngIf="addExistingSelectedId === opt.value"
              style="font-size:16px;width:16px;height:16px;line-height:1;color:#1677ff">check_circle</mat-icon>
          </div>
        </div>
      </div>

    </ng-container>
    <ng-template #addExistingFooter>
      <button nz-button (click)="addExistingModalVisible = false">Annuler</button>
      <button nz-button nzType="primary"
        [disabled]="!addExistingSelectedId"
        [nzLoading]="addExistingLoading"
        (click)="confirmAddExistingToFamily()">
        Ajouter à la famille
      </button>
    </ng-template>
  </nz-modal>

  <!-- Modal : retirer un indicateur d'une famille -->
  <nz-modal
    [(nzVisible)]="removeModalVisible"
    nzTitle="Retirer de la famille"
    [nzFooter]="null"
    [nzWidth]="460"
    (nzOnCancel)="removeModalVisible = false">
    <ng-container *nzModalContent>
      <p style="margin-bottom:16px;color:#262626">
        Que souhaitez-vous faire avec <strong>« {{ removeModalIndicator?.name }} »</strong> ?
      </p>
      <div class="remove-options">
        <div class="remove-option" (click)="confirmRemoveFromFamily('detach')" [class.remove-option--loading]="removeLoading">
          <mat-icon style="color:#1677ff;font-size:22px;width:22px;height:22px;line-height:1">link_off</mat-icon>
          <div>
            <p class="remove-option-title">Retirer de la famille</p>
            <p class="remove-option-desc">L'indicateur reste actif et devient un indicateur unique.</p>
          </div>
        </div>
        <div class="remove-option remove-option--danger" (click)="confirmRemoveFromFamily('delete')" [class.remove-option--loading]="removeLoading">
          <mat-icon style="color:#cf1322;font-size:22px;width:22px;height:22px;line-height:1">delete_forever</mat-icon>
          <div>
            <p class="remove-option-title">Supprimer définitivement</p>
            <p class="remove-option-desc">L'indicateur est supprimé et ne peut pas être récupéré.</p>
          </div>
        </div>
      </div>
    </ng-container>
  </nz-modal>

  <!-- Modal notification -->
  <nz-modal
    [(nzVisible)]="notifModalVisible"
    nzTitle="Envoyer une notification"
    [nzFooter]="notifFooter"
    (nzOnCancel)="notifModalVisible = false">
    <ng-container *nzModalContent>
      <div class="notif-modal-body">
        <div class="notif-banner">
          <div class="notif-banner-icon-wrap">
            <mat-icon>check_circle</mat-icon>
          </div>
          <div class="notif-banner-text">
            <p class="notif-banner-title">Indicateur activé</p>
            <p class="notif-banner-sub">Souhaitez-vous envoyer une notification pour informer les utilisateurs de la disponibilité de <strong>{{ notifIndicator?.name }}</strong> ?</p>
          </div>
        </div>
        <label class="notif-label">Titre</label>
        <input nz-input [(ngModel)]="notifTitle" placeholder="Titre de la notification" style="margin-bottom:12px" />
        <label class="notif-label">Message</label>
        <textarea nz-input [(ngModel)]="notifMessage"
          rows="8"
          placeholder="Contenu de la notification...">
        </textarea>
      </div>
    </ng-container>
    <ng-template #notifFooter>
      <button nz-button (click)="notifModalVisible = false">Ignorer</button>
      <button nz-button nzType="primary"
        [disabled]="!notifTitle.trim() || !notifMessage.trim()"
        [nzLoading]="notifSending"
        (click)="sendNotification()">
        <mat-icon style="font-size:16px;width:16px;height:16px;line-height:1;vertical-align:middle">send</mat-icon>
        Envoyer
      </button>
    </ng-template>
  </nz-modal>

  <!-- Modal retours d'expérience -->
  <nz-modal
    [(nzVisible)]="feedbackModalVisible"
    [nzTitle]="feedbackIndicator ? 'Retours - ' + feedbackIndicator.name : 'Retours'"
    [nzWidth]="600"
    [nzFooter]="null"
    (nzOnCancel)="feedbackModalVisible = false">
    <ng-container *nzModalContent>
      <div *ngIf="feedbacksLoading" style="text-align:center;padding:32px">
        <nz-spin nzSimple></nz-spin>
      </div>
      <ng-container *ngIf="!feedbacksLoading">
        <div *ngIf="feedbacksCount === 0" style="padding:24px 0">
          <nz-empty nzNotFoundContent="Aucun retour d'expérience pour l'instant"></nz-empty>
        </div>
        <ng-container *ngIf="feedbacksCount > 0">
          <div class="feedbacks-summary">
            <span class="feedbacks-avg">{{ feedbacksAverage }}<span style="font-size:14px;color:#8c8c8c">/5</span></span>
            <nz-rate [ngModel]="feedbacksAverage" nzAllowHalf [nzDisabled]="true"></nz-rate>
            <span class="feedbacks-count">{{ feedbacksCount }} avis</span>
          </div>
          <nz-divider></nz-divider>
          <div class="feedback-list">
            <div *ngFor="let fb of feedbacks" class="feedback-item">
              <div class="feedback-item-header">
                <mat-icon style="font-size:16px;width:16px;height:16px;line-height:1;color:#8c8c8c">person</mat-icon>
                <span class="feedback-username">{{ fb.userName }}</span>
                <nz-rate [ngModel]="fb.rating" nzAllowHalf [nzDisabled]="true" style="font-size:13px"></nz-rate>
                <span class="feedback-date">{{ fb.createdAt | date:'dd/MM/yyyy' }}</span>
                <button nz-button nzType="text" nzDanger nzSize="small"
                  nz-tooltip="Supprimer ce retour"
                  nz-popconfirm
                  nzPopconfirmTitle="Supprimer ce retour d'expérience ?"
                  nzPopconfirmPlacement="left"
                  [nzLoading]="deletingFeedback.has(fb.id)"
                  (nzOnConfirm)="deleteFeedback(fb.id)">
                  <mat-icon style="font-size:14px;line-height:1.3">delete</mat-icon>
                </button>
              </div>
              <p *ngIf="fb.comment" class="feedback-comment">{{ fb.comment }}</p>
            </div>
          </div>
        </ng-container>
      </ng-container>
    </ng-container>
  </nz-modal>
  `,
  styles: [`
    .admin-manager { padding: 16px; }
    .header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 20px; gap: 16px; flex-wrap: wrap;
    }
    .icon-btn { display: inline-flex !important; align-items: center; gap: 6px; }
    .icon-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .family-row { cursor: pointer; background: #f9f0ff; }
    .family-row:hover { background: #efdbff; }
    .family-row td { display: flex; align-items: center; gap: 6px; }
    .member-row { background: #fafafa; }
    .member-row td:first-child { padding-left: 28px; }
    .family-edit-icon { font-size:16px; width:16px; height:16px; color:#bbb; cursor:pointer; }
    .family-edit-icon:hover { color:#722ed1; }
    .standalone-picker {
      max-height: 280px; overflow-y: auto;
      border: 1px solid #f0f0f0; border-radius: 6px;
    }
    .standalone-picker-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; cursor: pointer;
      border-bottom: 1px solid #f5f5f5; font-size: 13px; color: #262626;
      transition: background .12s;
    }
    .standalone-picker-item:last-child { border-bottom: none; }
    .standalone-picker-item:hover { background: #f5f5f5; }
    .standalone-picker-item--selected { background: #e6f4ff; font-weight: 500; }
    .standalone-picker-item--selected:hover { background: #bae0ff; }
    .standalone-picker-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .standalone-picker-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .standalone-eye-btn { display: inline-flex !important; align-items: center; padding: 0 4px; color: #8c8c8c; }
    .standalone-eye-btn mat-icon { font-size: 15px; width: 15px; height: 15px; line-height: 1; }
    .standalone-eye-btn:hover { color: #1677ff; }
    .prev-card { border: 1px solid #f0f0f0; border-radius: 8px; overflow: hidden; }
    .prev-row { padding: 10px 14px; border-bottom: 1px solid #f0f0f0; background: #fff; }
    .prev-row--last { border-bottom: none; }
    .prev-row:nth-child(even) { background: #fafafa; }
    .prev-label { display: block; margin-bottom: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #8c8c8c; }
    .prev-value { margin: 0; font-size: 12px; color: #262626; line-height: 1.5; }
    .prev-hint { font-style: italic; color: #595959; }
    .prev-empty { font-size: 12px; color: #8c8c8c; font-style: italic; }
    .prev-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .prev-meta { display: flex; padding: 0; }
    .prev-meta-cell { flex: 1; padding: 10px 14px; }
    .prev-meta-sep { border-left: 1px solid #f0f0f0; }
    .prev-vizs { display: flex; flex-wrap: wrap; gap: 4px; }
    .prev-viz-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: #f5f5f5; border-radius: 4px; font-size: 11px; color: #262626; border: 1px solid #e8e8e8; }
    .prev-viz-chip mat-icon { font-size: 13px; width: 13px; height: 13px; line-height: 1; }
    .remove-options { display: flex; flex-direction: column; gap: 10px; }
    .remove-option {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 14px 16px; border: 1px solid #f0f0f0; border-radius: 8px;
      cursor: pointer; transition: background .15s, border-color .15s;
    }
    .remove-option:hover { background: #f5f5f5; border-color: #d9d9d9; }
    .remove-option--danger:hover { background: #fff2f0; border-color: #ffccc7; }
    .remove-option--loading { opacity: .6; pointer-events: none; }
    .remove-option-title { margin: 0 0 2px; font-weight: 600; font-size: 14px; color: #262626; }
    .remove-option-desc  { margin: 0; font-size: 12px; color: #8c8c8c; }
    .notif-modal-body { display: flex; flex-direction: column; gap: 4px; }
    .notif-banner {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 12px 14px; background: #e6f4ff; border-radius: 8px;
      margin-bottom: 16px;
    }
    .notif-banner-icon-wrap mat-icon {
      font-size: 22px; width: 22px; height: 22px; line-height: 1;
      color: #1677ff; margin-top: 1px;
    }
    .notif-banner-text { display: flex; flex-direction: column; gap: 2px; }
    .notif-banner-title { margin: 0; font-weight: 600; font-size: 14px; color: #0958d9; }
    .notif-banner-sub { margin: 0; font-size: 13px; color: #262626; line-height: 1.5; }
    .notif-label { font-weight: 600; font-size: 13px; color: #262626; margin-bottom: 4px; display: block; }
    .feedbacks-summary {
      display: flex; align-items: center; gap: 12px; padding: 8px 0 16px;
    }
    .feedbacks-avg {
      font-size: 32px; font-weight: 700; color: #262626; line-height: 1;
    }
    .feedbacks-count { color: #8c8c8c; font-size: 13px; }
    .feedback-list { display: flex; flex-direction: column; gap: 12px; }
    .feedback-item {
      padding: 12px; background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0;
    }
    .feedback-item-header {
      display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
    }
    .feedback-username { font-weight: 600; font-size: 13px; color: #262626; }
    .feedback-date { color: #8c8c8c; font-size: 12px; margin-left: auto; }
    .feedback-comment { margin: 6px 0 0; color: #595959; font-size: 13px; }
  `],
})
export class AdminIndicatorManagerComponent implements OnInit {
  private readonly indicatorSvc = inject(IndicatorService);
  private readonly modalSvc     = inject(NzModalService);
  private readonly messageSvc   = inject(NzMessageService);
  private readonly cdr          = inject(ChangeDetectorRef);
  @ViewChild('renameFamilyTpl') private renameFamilyTplRef!: TemplateRef<any>;
  renameFamilyInput = '';

  renameFamily(row: { familyName: string; members: IndicatorDefinition[] }): void {
    this.renameFamilyInput = row.familyName;
    this.modalSvc.create({
      nzTitle: 'Renommer la famille',
      nzContent: this.renameFamilyTplRef,
      nzWidth: 420,
      nzCentered: true,
      nzOkText: 'Renommer',
      nzCancelText: 'Annuler',
      nzOnOk: () => {
        const newName = this.renameFamilyInput.trim();
        if (!newName || newName === row.familyName) return Promise.resolve();
        return Promise.all(row.members.map(m =>
          this.indicatorSvc.updateIndicator(m.id, { familyName: newName }).toPromise()
        )).then(() => {
          this.indicators = this.indicators.map(i =>
            i.familyName === row.familyName ? { ...i, familyName: newName } : i
          );
          if (this.expandedFamilies.has(row.familyName)) {
            this.expandedFamilies.delete(row.familyName);
            this.expandedFamilies.add(newName);
          }
          this.applyGroupingFilter();
          this.messageSvc.success(`Famille renommée en « ${newName} »`);
        }).catch(() => this.messageSvc.error('Erreur lors du renommage'));
      },
    });
  }

  indicators: IndicatorDefinition[] = [];
  displayRows: IndicatorDisplayRow[] = [];
  expandedFamilies = new Set<string>();
  groupingFilter: 'families' | 'standalone' = 'standalone';
  loading = false;
  recalculating = new Set<string>();
  logsLoading    = new Set<string>();

  // ── Gestion membres de famille ─────────────────────────────────────────────

  openAddExistingToFamily(familyName: string): void {
    this.addExistingFamilyName = familyName;
    this.addExistingSelectedId = null;
    this.standaloneIndicators = this.indicators.filter(i => !i.familyName);
    this.standaloneOptions = this.standaloneIndicators.map(i => ({ label: i.name, value: i.id }));
    this.addExistingModalVisible = true;
  }

  confirmAddExistingToFamily(): void {
    if (!this.addExistingSelectedId) return;
    this.addExistingLoading = true;
    this.indicatorSvc.updateIndicator(this.addExistingSelectedId, { familyName: this.addExistingFamilyName }).subscribe({
      next: updated => {
        this.cleanupFamilyPlaceholder(this.addExistingFamilyName);
        this.indicators = this.indicators.map(i => i.id === updated.id ? { ...i, familyName: this.addExistingFamilyName } : i);
        this.expandedFamilies.add(this.addExistingFamilyName);
        this.applyGroupingFilter();
        this.addExistingLoading = false;
        this.addExistingModalVisible = false;
        this.cdr.markForCheck();
        this.messageSvc.success(`Indicateur ajouté à la famille « ${this.addExistingFamilyName} »`);
      },
      error: () => { this.addExistingLoading = false; this.messageSvc.error('Erreur lors de l\'ajout'); },
    });
  }

  createNewInFamily(familyName: string): void {
    const ref = this.modalSvc.create({
      nzTitle: `Nouvel indicateur dans « ${familyName} »`,
      nzContent: IndicatorBuilderComponent,
      nzData: { familyPreset: { familyName, contextType: 'learner', name: '', description: '', requiredEvents: [] } },
      nzFooter: null,
      nzWidth: '90vw',
      nzCentered: true,
      nzBodyStyle: { 'max-height': '80vh', 'overflow-y': 'auto' },
    });
    ref.afterClose.subscribe(created => {
      if (created) {
        this.cleanupFamilyPlaceholder(familyName);
        this.load();
        this.expandedFamilies.add(familyName);
      }
    });
  }

  openRemoveFromFamily(ind: IndicatorDefinition): void {
    this.removeModalIndicator = ind;
    this.removeModalVisible = true;
  }

  confirmRemoveFromFamily(action: 'detach' | 'delete'): void {
    const ind = this.removeModalIndicator;
    if (!ind) return;
    this.removeLoading = true;

    if (action === 'detach') {
      this.indicatorSvc.updateIndicator(ind.id, { familyName: null }).subscribe({
        next: () => {
          this.indicators = this.indicators.map(i => i.id === ind.id ? { ...i, familyName: null as any } : i);
          this.applyGroupingFilter();
          this.removeLoading = false;
          this.removeModalVisible = false;
          this.cdr.markForCheck();
          this.messageSvc.success(`« ${ind.name} » retiré de la famille - maintenant indicateur unique`);
        },
        error: () => { this.removeLoading = false; this.messageSvc.error('Erreur'); },
      });
    } else {
      this.indicatorSvc.deleteIndicator(ind.id).subscribe({
        next: () => {
          this.indicators = this.indicators.filter(i => i.id !== ind.id);
          this.applyGroupingFilter();
          this.removeLoading = false;
          this.removeModalVisible = false;
          this.cdr.markForCheck();
          this.messageSvc.success(`« ${ind.name} » supprimé définitivement`);
        },
        error: () => { this.removeLoading = false; this.messageSvc.error('Erreur'); },
      });
    }
  }

  // Ajout d'un indicateur existant à une famille
  addExistingModalVisible = false;
  addExistingFamilyName = '';
  addExistingSelectedId: string | null = null;
  addExistingLoading = false;
  standaloneIndicators: IndicatorDefinition[] = [];
  standaloneOptions: { label: string; value: string }[] = [];
  previewedStandaloneId: string | null = null;
  get previewedStandaloneIndicator(): IndicatorDefinition | null {
    return this.standaloneIndicators.find(i => i.id === this.previewedStandaloneId) ?? null;
  }

  // Retrait d'un indicateur d'une famille
  removeModalVisible = false;
  removeModalIndicator: IndicatorDefinition | null = null;
  removeLoading = false;

  // ── Notification ──────────────────────────────────────────────────────────
  notifModalVisible = false;
  notifIndicator: IndicatorDefinition | null = null;
  notifTitle = '';
  notifMessage = '';
  notifSending = false;

  // ── Feedbacks ─────────────────────────────────────────────────────────────
  feedbackModalVisible = false;
  feedbackIndicator: IndicatorDefinition | null = null;
  feedbacks: IndicatorFeedback[] = [];
  feedbacksCount = 0;
  feedbacksAverage = 0;
  feedbacksLoading = false;
  deletingFeedback = new Set<string>();

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.indicatorSvc.loadAllForAdmin().subscribe({
      next: list => { this.indicators = list; this.applyGroupingFilter(); this.loading = false; },
      error: ()  => { this.loading = false; },
    });
  }

  /** Bascule entre l'onglet "Indicateurs uniques" (0) et "Familles" (1). */
  onTabChange(index: number): void {
    this.groupingFilter = index === 0 ? 'standalone' : 'families';
    this.applyGroupingFilter();
  }

  /** Reconstruit `displayRows` (familles repliables ou indicateurs uniques) selon l'onglet courant. */
  applyGroupingFilter(): void {
    const filtered = this.groupingFilter === 'families'
      ? this.indicators.filter(ind => !!ind.familyName)
      : this.indicators.filter(ind => !ind.familyName);
    this.displayRows = buildIndicatorDisplayRows(filtered, this.expandedFamilies);
  }

  toggleFamily(familyName: string): void {
    if (this.expandedFamilies.has(familyName)) {
      this.expandedFamilies.delete(familyName);
    } else {
      this.expandedFamilies.add(familyName);
    }
    this.applyGroupingFilter();
  }

  hasFormula(ind: IndicatorDefinition): boolean {
    return !!ind.formula?.pipeline?.length;
  }

  // ── Modales ───────────────────────────────────────────────────────────────

  openEventRuleManager(): void {
    this.modalSvc.create({
      nzTitle: 'Événements & déclencheurs',
      nzContent: EventRuleManagerComponent,
      nzFooter: null,
      nzWidth: '80vw',
      nzCentered: true,
      nzBodyStyle: { 'max-height': '80vh', 'overflow-y': 'auto' },
    });
  }

  openBuilder(indicator?: IndicatorDefinition): void {
    const ref = this.modalSvc.create({
      nzTitle: indicator ? `Modifier : ${indicator.name}` : 'Nouvel indicateur',
      nzContent: IndicatorBuilderComponent,
      nzData: indicator ? { indicator } : {},
      nzFooter: null,
      nzWidth: '90vw',
      nzCentered: true,
      nzBodyStyle: { 'max-height': '80vh', 'overflow-y': 'auto' },
    });
    ref.afterClose.subscribe(saved => { if (saved) this.load(); });
  }

  /** Ouvre la modale de démarrage d'une famille, puis enchaîne le builder pour chaque contexte
   *  sélectionné - ou crée directement une famille vide si aucun contexte n'a été choisi. */
  openFamilyWizard(): void {
    const startRef = this.modalSvc.create({
      nzTitle: 'Créer une famille d\'indicateurs',
      nzContent: IndicatorFamilyStartModalComponent,
      nzFooter: null,
      nzWidth: 520,
    });
    startRef.afterClose.subscribe((result: FamilyStartResult | null) => {
      if (!result) return;
      if (!result.contextTypes.length) { this.createEmptyFamily(result); return; }
      const [first, ...queue] = result.contextTypes;
      this.openFamilyMember(result, first, queue);
    });
  }

  /** Crée une famille sans indicateur réel pour l'instant (ligne technique isFamilyPlaceholder,
   *  toujours isActive=false donc invisible des utilisateurs finaux) - à compléter plus tard via
   *  "Ajouter un indicateur" sur la ligne de famille. */
  private createEmptyFamily(result: FamilyStartResult): void {
    this.indicatorSvc.createIndicator({
      name: `${result.familyName} (famille)`,
      familyName: result.familyName,
      description: result.description,
      isActive: false,
      isFamilyPlaceholder: true,
      requiredEvents: [],
      visualizations: [],
    }).subscribe({
      next: () => {
        this.messageSvc.success(`Famille "${result.familyName}" créée, sans indicateur pour l'instant.`);
        this.load();
      },
      error: () => this.messageSvc.error('Impossible de créer la famille.'),
    });
  }

  /** Supprime le placeholder de famille vide dès qu'un premier vrai indicateur la rejoint. */
  private cleanupFamilyPlaceholder(familyName: string): void {
    const placeholder = this.indicators.find(i => i.familyName === familyName && i.isFamilyPlaceholder);
    if (placeholder) this.indicatorSvc.deleteIndicator(placeholder.id).subscribe();
  }

  /** Ouvre le builder pré-rempli pour un membre de la famille, puis enchaîne sur le suivant à la
   *  fermeture. Supprime au passage le placeholder de famille vide si c'est le premier vrai membre. */
  private openFamilyMember(start: FamilyStartResult, contextType: IndicatorScope, queue: IndicatorScope[]): void {
    const preset: IndicatorFamilyPreset = {
      familyName: start.familyName,
      description: start.description,
      requiredEvents: [],
      contextType,
      name: `${start.familyName} - ${CONTEXT_LABELS[contextType]}`,
    };
    const ref = this.modalSvc.create({
      nzTitle: preset.name,
      nzContent: IndicatorBuilderComponent,
      nzData: { familyPreset: preset, familyQueue: queue },
      nzFooter: null,
      nzWidth: '90vw',
      nzCentered: true,
      nzBodyStyle: { 'max-height': '80vh', 'overflow-y': 'auto' },
    });
    ref.afterClose.subscribe(saved => {
      if (saved) this.cleanupFamilyPlaceholder(start.familyName);
      this.load();
      if (saved && queue.length) {
        const [next, ...rest] = queue;
        this.openFamilyMember(start, next, rest);
      }
    });
  }

  openConfig(indicator: IndicatorDefinition): void {
    this.modalSvc.create({
      nzTitle: `Paramètres d'affichage : ${indicator.name}`,
      nzContent: IndicatorConfigComponent,
      nzData: { indicator },
      nzFooter: null,
      nzWidth: 600,
    });
  }



  openLogs(indicator: IndicatorDefinition): void {
    this.logsLoading.add(indicator.id);
    this.indicatorSvc.getExecutionLogs(indicator.id, 100).subscribe({
      next: logs => {
        this.logsLoading.delete(indicator.id);
        this.modalSvc.create({
          nzTitle: `Logs d'exécution - ${indicator.name}`,
          nzContent: LogsModalComponent,
          nzData: { logs },
          nzFooter: null,
          nzWidth: 1000,
        });
      },
      error: () => {
        this.logsLoading.delete(indicator.id);
        this.messageSvc.error('Impossible de charger les logs');
      },
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  toggleActive(indicator: IndicatorDefinition): void {
    this.indicatorSvc.updateIndicatorStatus(indicator.id, indicator.isActive).subscribe({
      next: () => {
        this.messageSvc.success(`Indicateur ${indicator.isActive ? 'activé' : 'désactivé'}`);
        if (indicator.isActive) {
          this.notifIndicator = indicator;
          this.notifTitle = `Nouvel indicateur disponible : ${indicator.name}`;
          this.notifMessage = indicator.description
            ? `Cet indicateur est désormais disponible dans votre tableau de bord.\n\n${indicator.description}`
            : `Cet indicateur est désormais disponible dans votre tableau de bord.`;
          this.notifModalVisible = true;
        }
      },
      error: () => {
        indicator.isActive = !indicator.isActive;
        this.messageSvc.error('Erreur lors de la mise à jour du statut');
      },
    });
  }

  sendNotification(): void {
    if (!this.notifIndicator || !this.notifTitle.trim() || !this.notifMessage.trim()) return;
    this.notifSending = true;
    this.indicatorSvc.sendNotification(this.notifIndicator.id, this.notifTitle, this.notifMessage).subscribe({
      next: () => {
        this.notifSending = false;
        this.notifModalVisible = false;
        this.cdr.markForCheck();
        this.messageSvc.success('Notification envoyée');
      },
      error: () => {
        this.notifSending = false;
        this.cdr.markForCheck();
        this.messageSvc.error('Erreur lors de l\'envoi de la notification');
      },
    });
  }

  deleteIndicator(indicator: IndicatorDefinition): void {
    this.indicatorSvc.deleteIndicator(indicator.id).subscribe({
      next: () => {
        this.messageSvc.success(`Indicateur "${indicator.name}" supprimé`);
        this.indicators = this.indicators.filter(i => i.id !== indicator.id);
        this.applyGroupingFilter();
      },
      error: () => this.messageSvc.error('Erreur lors de la suppression'),
    });
  }

  recalculate(indicator: IndicatorDefinition): void {
    this.recalculating.add(indicator.id);
    this.indicatorSvc.recalculateIndicator(indicator.id).subscribe({
      next: ({ processed, updated, failed }) => {
        this.recalculating.delete(indicator.id);
        this.messageSvc.success(
          `Recalcul terminé - ${updated}/${processed} valeurs mises à jour` +
          (failed ? ` (${failed} erreurs)` : ''),
        );
      },
      error: err => {
        this.recalculating.delete(indicator.id);
        this.messageSvc.error(err?.error?.message ?? 'Erreur lors du recalcul');
      },
    });
  }

  openFeedbacks(ind: IndicatorDefinition): void {
    this.feedbackIndicator = ind;
    this.feedbacks = [];
    this.feedbacksCount = 0;
    this.feedbacksAverage = 0;
    this.feedbacksLoading = true;
    this.feedbackModalVisible = true;
    this.indicatorSvc.getFeedbacks(ind.id).subscribe({
      next: ({ feedbacks, count, averageRating }) => {
        this.feedbacks = feedbacks;
        this.feedbacksCount = count;
        this.feedbacksAverage = averageRating;
        this.feedbacksLoading = false;
      },
      error: () => { this.feedbacksLoading = false; },
    });
  }

  deleteFeedback(feedbackId: string): void {
    if (!this.feedbackIndicator) return;
    this.deletingFeedback.add(feedbackId);
    this.indicatorSvc.deleteFeedback(this.feedbackIndicator.id, feedbackId).subscribe({
      next: () => {
        this.feedbacks = this.feedbacks.filter(f => f.id !== feedbackId);
        this.feedbacksCount = this.feedbacks.length;
        this.feedbacksAverage = this.feedbacksCount > 0
          ? Math.round(this.feedbacks.reduce((s, f) => s + f.rating, 0) / this.feedbacksCount * 10) / 10
          : 0;
        this.deletingFeedback.delete(feedbackId);
      },
      error: () => { this.deletingFeedback.delete(feedbackId); },
    });
  }
}
