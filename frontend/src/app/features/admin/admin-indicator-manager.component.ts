// frontend/src/app/features/admin/admin-indicator-manager.component.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
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
import { IndicatorService } from '../../core/services/indicator.service';
import { IndicatorDefinition, IndicatorScope } from '../../core/models/indicator.model';
import { IndicatorConfigComponent } from './indicator-config.component';
import { IndicatorBuilderComponent, CONTEXT_LABELS, IndicatorFamilyPreset } from './indicator-builder.component';
import { buildIndicatorDisplayRows, IndicatorDisplayRow } from '../../shared/utils/indicator-family-grouping';

// ── Modale : historique des versions de formule ───────────────────────────────

@Component({
  selector: 'ui-history-modal',
  standalone: true,
  imports: [CommonModule, NzTagModule, NzButtonModule, NzEmptyModule, NzPopconfirmModule, MatIconModule],
  template: `
    <div class="history-list" *ngIf="versions?.length; else empty">
      <div *ngFor="let v of versions" class="history-item">
        <div class="history-header">
          <strong>Version {{ v.versionNum }}</strong>
          <span class="history-date">{{ v.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
          <span *ngIf="v.createdBy" class="history-by">par {{ v.createdBy }}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
          <nz-tag *ngFor="let s of v.formula?.pipeline" nzColor="default">{{ s.type }}</nz-tag>
          <span *ngIf="!v.formula?.pipeline?.length" style="color:#bbb;font-size:12px">Pipeline vide</span>
        </div>
        <button nz-button nzSize="small" nzType="dashed"
          nz-popconfirm
          nzPopconfirmTitle="Revenir à cette version ? La formule actuelle sera remplacée."
          (nzOnConfirm)="modalData.onRollback(v.id)">
          <mat-icon style="font-size:14px;line-height:1.4;vertical-align:middle">restore</mat-icon>
          Restaurer cette version
        </button>
      </div>
    </div>
    <ng-template #empty>
      <nz-empty nzNotFoundContent="Aucune version enregistrée pour cet indicateur."></nz-empty>
    </ng-template>
  `,
  styles: [`
    .history-list { display:flex; flex-direction:column; gap:10px; max-height:65vh; overflow-y:auto; }
    .history-item { border:1px solid #e8e8e8; border-radius:8px; padding:12px 14px; }
    .history-header { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
    .history-date { font-size:12px; color:#888; }
    .history-by   { font-size:12px; color:#aaa; }
  `],
})
export class HistoryModalComponent {
  readonly modalData = inject(NZ_MODAL_DATA) as { versions: any[]; onRollback: (id: string) => void };
  get versions() { return this.modalData.versions; }
}

// ── Modale : logs d'exécution ─────────────────────────────────────────────────

@Component({
  selector: 'ui-logs-modal',
  standalone: true,
  imports: [CommonModule, NzEmptyModule],
  template: `
    <div class="logs-wrap" *ngIf="logs?.length; else empty">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
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
            <td style="padding:5px 8px">{{ log.executedAt | date:'dd/MM HH:mm:ss' }}</td>
            <td style="padding:5px 8px;font-family:monospace;color:#666">
              {{ log.userId | slice:0:12 }}{{ (log.userId?.length ?? 0) > 12 ? '…' : '' }}
            </td>
            <td style="padding:5px 8px;text-align:right;font-weight:500">
              <span *ngIf="log.value !== null && log.value !== undefined">
                {{ log.value | number:'1.0-2' }}
              </span>
              <span *ngIf="log.value === null || log.value === undefined" style="color:#bbb">-</span>
            </td>
            <td style="padding:5px 8px;text-align:right;color:#888">{{ log.durationMs }} ms</td>
            <td style="padding:5px 8px;color:#ff4d4f;font-size:11px">
              {{ log.error | slice:0:60 }}{{ (log.error?.length ?? 0) > 60 ? '…' : '' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ng-template #empty>
      <nz-empty nzNotFoundContent="Aucun log d'exécution pour cet indicateur."></nz-empty>
    </ng-template>
  `,
  styles: [`.logs-wrap { max-height:65vh; overflow-y:auto; }`],
})
export class LogsModalComponent {
  readonly modalData = inject(NZ_MODAL_DATA) as { logs: any[] };
  get logs() { return this.modalData.logs; }
}

// ── Modale : démarrage du wizard "famille d'indicateurs" ──────────────────────

export interface FamilyStartResult {
  familyName: string;
  description: string;
  requiredEvents: string[];
  contextTypes: IndicatorScope[];
}

@Component({
  selector: 'ui-family-start-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, NzFormModule, NzInputModule, NzSelectModule, NzButtonModule],
  template: `
    <div class="family-start">
      <p style="color:#888;font-size:13px;margin-top:0">
        Une famille regroupe plusieurs indicateurs créés ensemble - un par contexte sélectionné -
        partageant le même nom de base, la même description et les mêmes événements déclencheurs.
        Vous configurerez ensuite la visualisation et la formule de chacun, l'un après l'autre.
      </p>

      <nz-form-item>
        <nz-form-label [nzRequired]="true">Nom de la famille</nz-form-label>
        <nz-form-control>
          <input nz-input [(ngModel)]="familyName" placeholder="ex: Tentatives avant première réussite" />
        </nz-form-control>
      </nz-form-item>

      <nz-form-item>
        <nz-form-label>Description</nz-form-label>
        <nz-form-control>
          <textarea nz-input [(ngModel)]="description" rows="3"
            placeholder="Décrivez ce que mesure cette famille d'indicateurs…"></textarea>
        </nz-form-control>
      </nz-form-item>

      <nz-form-item>
        <nz-form-label [nzRequired]="true">Événements déclencheurs</nz-form-label>
        <nz-form-control>
          <nz-select [(ngModel)]="requiredEvents" nzMode="tags"
            nzPlaceHolder="ex: exercise.answered" style="width:100%">
            <nz-option nzValue="exercise.answered"  nzLabel="exercise.answered"></nz-option>
            <nz-option nzValue="exercise.viewed"    nzLabel="exercise.viewed"></nz-option>
            <nz-option nzValue="activity.completed" nzLabel="activity.completed"></nz-option>
            <nz-option nzValue="activity.started"   nzLabel="activity.started"></nz-option>
          </nz-select>
        </nz-form-control>
      </nz-form-item>

      <nz-form-item>
        <nz-form-label [nzRequired]="true">Contextes à couvrir</nz-form-label>
        <nz-form-control>
          <nz-select [(ngModel)]="contextTypes" nzMode="multiple"
            nzPlaceHolder="Sélectionnez un ou plusieurs contextes" style="width:100%">
            <nz-option *ngFor="let c of contextOptions" [nzValue]="c.value" [nzLabel]="c.label"></nz-option>
          </nz-select>
        </nz-form-control>
      </nz-form-item>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <button nz-button (click)="cancel()">Annuler</button>
        <button nz-button nzType="primary" [disabled]="!canStart" (click)="start()">
          Configurer les indicateurs
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
  requiredEvents: string[] = [];
  contextTypes: IndicatorScope[] = [];

  readonly contextOptions: { value: IndicatorScope; label: string }[] =
    (Object.keys(CONTEXT_LABELS) as IndicatorScope[]).map(value => ({ value, label: CONTEXT_LABELS[value] }));

  get canStart(): boolean {
    return !!this.familyName.trim() && this.requiredEvents.length > 0 && this.contextTypes.length > 0;
  }

  start(): void {
    if (!this.canStart) return;
    const result: FamilyStartResult = {
      familyName: this.familyName.trim(),
      description: this.description.trim(),
      requiredEvents: this.requiredEvents,
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
    NzEmptyModule, NzSpinModule, NzTabsModule,
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
                  <mat-icon style="vertical-align:text-bottom;color:#722ed1">{{ row.expanded ? 'expand_more' : 'chevron_right' }}</mat-icon>
                  <mat-icon style="font-size:16px;vertical-align:text-bottom;color:#722ed1">folder_special</mat-icon>
                  <strong>{{ row.familyName }}</strong>
                  <nz-tag nzColor="purple">{{ row.members.length }} indicateur{{ row.members.length > 1 ? 's' : '' }}</nz-tag>
                  <mat-icon class="family-edit-icon" (click)="renameFamily(row); $event.stopPropagation()" nz-tooltip="Renommer la famille">edit</mat-icon>
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

              <!--
              <button nz-button nzType="default" nzSize="small"
                nz-tooltip="Paramètres d'affichage"
                (click)="openConfig(ind)">
                <mat-icon style="font-size:16px;line-height:1.3">settings</mat-icon>
              </button>
              -->

              <!-- Historique des versions (seulement si DSL) -->
              <button *ngIf="hasFormula(ind)"
                nz-button nzType="default" nzSize="small"
                nz-tooltip="Historique des versions de formule"
                [nzLoading]="historyLoading.has(ind.id)"
                (click)="openHistory(ind)">
                <mat-icon *ngIf="!historyLoading.has(ind.id)" style="font-size:16px;line-height:1.3">history</mat-icon>
              </button>

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

              <button nz-button nzType="text" nzDanger nzSize="small"
                nz-tooltip="Supprimer définitivement"
                nz-popconfirm
                nzPopconfirmTitle="Supprimer cet indicateur ?"
                nzPopconfirmPlacement="left"
                (nzOnConfirm)="deleteIndicator(ind)">
                <mat-icon style="font-size:16px;line-height:1.3">delete</mat-icon>
              </button>

            </div>
          </td>
        </tr>
      </ng-template>


    </div>

  <ng-template #renameFamilyTpl>
    <input nz-input [(ngModel)]="renameFamilyInput" placeholder="Nouveau nom de la famille" style="width:100%;margin-top:4px" />
  </ng-template>
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
  `],
})
export class AdminIndicatorManagerComponent implements OnInit {
  private readonly indicatorSvc = inject(IndicatorService);
  private readonly modalSvc     = inject(NzModalService);
  private readonly messageSvc   = inject(NzMessageService);
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
  historyLoading = new Set<string>();
  logsLoading    = new Set<string>();

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
    if ((ind as any).formula?.pipeline?.length) return true;
    return (ind.visualizations ?? []).some(v => v.formula?.pipeline?.length);
  }

  // ── Modales ───────────────────────────────────────────────────────────────

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

  /** Ouvre la modale de démarrage d'une famille, puis enchaîne le builder pour chaque contexte sélectionné. */
  openFamilyWizard(): void {
    const startRef = this.modalSvc.create({
      nzTitle: 'Créer une famille d\'indicateurs',
      nzContent: IndicatorFamilyStartModalComponent,
      nzFooter: null,
      nzWidth: 520,
    });
    startRef.afterClose.subscribe((result: FamilyStartResult | null) => {
      if (!result || !result.contextTypes.length) return;
      const [first, ...queue] = result.contextTypes;
      this.openFamilyMember(result, first, queue);
    });
  }

  /** Ouvre le builder pré-rempli pour un membre de la famille, puis enchaîne sur le suivant à la fermeture. */
  private openFamilyMember(start: FamilyStartResult, contextType: IndicatorScope, queue: IndicatorScope[]): void {
    const preset: IndicatorFamilyPreset = {
      familyName: start.familyName,
      description: start.description,
      requiredEvents: start.requiredEvents,
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

  openHistory(indicator: IndicatorDefinition): void {
    this.historyLoading.add(indicator.id);
    this.indicatorSvc.getFormulaHistory(indicator.id).subscribe({
      next: versions => {
        this.historyLoading.delete(indicator.id);
        this.modalSvc.create({
          nzTitle: `Historique des formules - ${indicator.name}`,
          nzContent: HistoryModalComponent,
          nzData: {
            versions,
            onRollback: (versionId: string) => {
              this.indicatorSvc.rollbackFormula(indicator.id, versionId).subscribe({
                next: () => {
                  this.messageSvc.success('Formule restaurée avec succès');
                  this.load();
                },
                error: err => this.messageSvc.error(err?.error?.message ?? 'Erreur lors du rollback'),
              });
            },
          },
          nzFooter: null,
          nzWidth: 680,
        });
      },
      error: () => {
        this.historyLoading.delete(indicator.id);
        this.messageSvc.error('Impossible de charger l\'historique');
      },
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
          nzWidth: 720,
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
      next: () => this.messageSvc.success(`Indicateur ${indicator.isActive ? 'activé' : 'désactivé'}`),
      error: () => {
        indicator.isActive = !indicator.isActive;
        this.messageSvc.error('Erreur lors de la mise à jour du statut');
      },
    });
  }

  deleteIndicator(indicator: IndicatorDefinition): void {
    this.indicatorSvc.deleteIndicator(indicator.id).subscribe({
      next: () => {
        this.messageSvc.success(`Indicateur "${indicator.name}" supprimé`);
        this.indicators = this.indicators.filter(i => i.id !== indicator.id);
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
}
