// frontend/src/app/features/admin/admin-indicator-manager.component.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule, NzModalService, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { IndicatorService } from '../../core/services/indicator.service';
import { IndicatorDefinition } from '../../core/models/indicator.model';
import { IndicatorConfigComponent } from './indicator-config.component';
import { IndicatorBuilderComponent } from './indicator-builder.component';

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

// ── Composant principal ───────────────────────────────────────────────────────

@Component({
  selector: 'ui-admin-indicator-manager',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule,
    NzTableModule, NzButtonModule, NzModalModule,
    NzSwitchModule, NzTagModule, NzTooltipModule,
    NzPopconfirmModule, NzBadgeModule, NzDividerModule,
    NzEmptyModule, NzSpinModule,
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
        <button nz-button nzType="primary" (click)="openBuilder()">
          <mat-icon style="font-size:18px;line-height:1.4">add</mat-icon>
          Nouvel indicateur
        </button>
      </div>

      <nz-spin [nzSpinning]="loading">
        <nz-table
          #table
          [nzData]="indicators"
          nzBordered
          [nzPageSize]="20"
          nzSize="small">

          <thead>
            <tr>
              <th>Nom</th>
              <th>Contextes</th>
              <th>Événements</th>
              <th style="width:80px;text-align:center">Statut</th>
              <th style="width:200px;text-align:center">Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr *ngFor="let ind of table.data">
              <!-- Nom + description -->
              <td>
                <div style="font-weight:500">{{ ind.name }}</div>
                <div style="font-size:11px;color:#999;margin-top:2px">
                  {{ ind.description | slice:0:80 }}{{ (ind.description?.length ?? 0) > 80 ? '…' : '' }}
                </div>
              </td>

              <!-- Contextes -->
              <td>
                <nz-tag *ngFor="let ctx of ind.supportedContexts" nzColor="blue">{{ ctx }}</nz-tag>
                <span *ngIf="!ind.supportedContexts?.length" style="color:#bbb">-</span>
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

                  <button nz-button nzType="default" nzSize="small"
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

                  <!-- Logs d'exécution (seulement si DSL) -->
                  <button *ngIf="hasFormula(ind)"
                    nz-button nzType="default" nzSize="small"
                    nz-tooltip="Logs d'exécution"
                    [nzLoading]="logsLoading.has(ind.id)"
                    (click)="openLogs(ind)">
                    <mat-icon *ngIf="!logsLoading.has(ind.id)" style="font-size:16px;line-height:1.3">receipt_long</mat-icon>
                  </button>

                  <!-- Recalcul (seulement si DSL) -->
                  <button *ngIf="hasFormula(ind)"
                    nz-button nzType="default" nzSize="small"
                    nz-tooltip="Recalculer pour tous les utilisateurs"
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
          </tbody>

        </nz-table>

        <nz-empty *ngIf="!loading && indicators.length === 0"
          nzNotFoundContent="Aucun indicateur - créez-en un avec le bouton ci-dessus.">
        </nz-empty>
      </nz-spin>

    </div>
  `,
  styles: [`
    .admin-manager { padding: 16px; }
    .header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 20px; gap: 16px; flex-wrap: wrap;
    }
    .header button mat-icon { vertical-align: middle; }
  `],
})
export class AdminIndicatorManagerComponent implements OnInit {
  private readonly indicatorSvc = inject(IndicatorService);
  private readonly modalSvc     = inject(NzModalService);
  private readonly messageSvc   = inject(NzMessageService);

  indicators: IndicatorDefinition[] = [];
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
      next: list => { this.indicators = list; this.loading = false; },
      error: ()  => { this.loading = false; },
    });
  }

  hasFormula(ind: IndicatorDefinition): boolean {
    return !!(ind as any).formula?.pipeline?.length;
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
