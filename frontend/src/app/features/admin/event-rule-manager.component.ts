// frontend/src/app/features/admin/event-rule-manager.component.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzModalService, NzModalModule } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { IndicatorService } from '../../core/services/indicator.service';
import { EventRule, EventRuleCondition } from '../../core/models/indicator.model';
import { EventRuleBuilderComponent } from './event-rule-builder.component';
import { EventRuleInstallModalComponent } from './event-rule-install-modal.component';

@Component({
  selector: 'ui-event-rule-manager',
  standalone: true,
  imports: [
    CommonModule, MatIconModule, NzTableModule, NzButtonModule, NzTagModule,
    NzTooltipModule, NzPopconfirmModule, NzEmptyModule, NzSpinModule, NzModalModule,
  ],
  template: `
    <div class="rule-manager">
      <div class="rule-manager-header">
        <p class="rule-manager-intro">
          Chaque règle définit comment un changement réel dans PLaTon produit un événement
          métier. Une règle enregistrée ne fait rien tant que son trigger n'a pas été installé
          explicitement - pour ça, cliquez sur "Installer".
        </p>
        <button nz-button nzType="primary" (click)="openNewRule()" class="icon-btn">
          <mat-icon>add</mat-icon>
          Nouvelle règle
        </button>
      </div>

      <nz-spin [nzSpinning]="loading">
        <nz-table [nzData]="rules" nzBordered nzSize="small" [nzPageSize]="20">
          <thead>
            <tr>
              <th>Événement</th>
              <th>Source</th>
              <th>Opération</th>
              <th>Condition</th>
              <th style="width:120px;text-align:center">Statut</th>
              <th style="width:220px;text-align:center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of rules">
              <td>
                <div style="font-weight:500">{{ r.eventType.name }}</div>
                <div style="font-size:11px;color:#999">{{ r.eventType.label }}</div>
              </td>
              <td>
                {{ r.sourceTable }}<span *ngIf="r.watchedColumn">.{{ r.watchedColumn }}</span>
              </td>
              <td>{{ operationLabel(r.operation) }}</td>
              <td style="font-size:12px">{{ conditionSummary(r.condition, r.watchedColumn) }}</td>
              <td style="text-align:center">
                <nz-tag *ngIf="r.triggerInstalled" nzColor="green">Installé</nz-tag>
                <nz-tag *ngIf="!r.triggerInstalled && !r.lastInstallError" nzColor="orange">Non installé</nz-tag>
                <nz-tag *ngIf="!r.triggerInstalled && r.lastInstallError" nzColor="red"
                  nz-tooltip [nzTooltipTitle]="r.lastInstallError">Erreur</nz-tag>
              </td>
              <td>
                <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
                  <button nz-button nzType="text" nzSize="small"
                    [nz-tooltip]="installTooltip(r)"
                    (click)="openInstall(r)">
                    <mat-icon style="font-size:16px;line-height:1.3">bolt</mat-icon>
                  </button>
                  <button nz-button nzType="text" nzSize="small"
                    nz-tooltip="Modifier"
                    (click)="openEditRule(r)">
                    <mat-icon style="font-size:16px;line-height:1.3">edit</mat-icon>
                  </button>
                  <button nz-button nzType="text" nzDanger nzSize="small"
                    *ngIf="!r.triggerInstalled"
                    nz-tooltip="Supprimer"
                    nz-popconfirm
                    nzPopconfirmTitle="Supprimer cette règle ?"
                    nzPopconfirmPlacement="left"
                    (nzOnConfirm)="deactivate(r)">
                    <mat-icon style="font-size:16px;line-height:1.3">delete</mat-icon>
                  </button>
                  <button nz-button nzType="text" nzDanger nzSize="small"
                    *ngIf="r.triggerInstalled"
                    nz-tooltip="Voir le SQL et supprimer (retire aussi le trigger installé)"
                    (click)="openUninstall(r)">
                    <mat-icon style="font-size:16px;line-height:1.3">delete</mat-icon>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </nz-table>
        <nz-empty *ngIf="!loading && rules.length === 0"
          nzNotFoundContent="Aucune règle - créez-en une avec le bouton ci-dessus.">
        </nz-empty>
      </nz-spin>
    </div>
  `,
  styles: [`
    .rule-manager { display:flex; flex-direction:column; gap:12px; }
    .rule-manager-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .rule-manager-intro { color:#888; font-size:13px; margin:0; max-width:640px; }
    .icon-btn { display: inline-flex !important; align-items: center; gap: 6px; }
    .icon-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }
  `],
})
export class EventRuleManagerComponent implements OnInit {
  private readonly indicatorSvc = inject(IndicatorService);
  private readonly modalSvc = inject(NzModalService);
  private readonly messageSvc = inject(NzMessageService);

  rules: EventRule[] = [];
  loading = false;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.indicatorSvc.getEventRules().subscribe({
      next: rules => { this.rules = rules; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  operationLabel(op: string): string {
    if (op === 'INSERT') return 'Création';
    if (op === 'INSERT_OR_UPDATE') return 'Création ou modification';
    return 'Modification';
  }

  installTooltip(r: EventRule): string {
    if (r.triggerInstalled) return "Voir le SQL et réinstaller si besoin (rien n'est exécuté ici)";
    return "Voir le SQL et installer (rien n'est exécuté ici)";
  }

  conditionSummary(condition: EventRuleCondition, column: string | null): string {
    switch (condition.kind) {
      case 'always': return 'à chaque déclenchement';
      case 'changed': return `${column} a changé`;
      case 'equals': return `${column} = ${condition.value}`;
      case 'not_equals': return `${column} ≠ ${condition.value}`;
      case 'threshold_crossed': return `${column} franchit ${condition.operator} ${condition.threshold}`;
      default: return '-';
    }
  }

  openNewRule(): void {
    const ref = this.modalSvc.create({
      nzTitle: 'Nouvelle règle de déclenchement',
      nzContent: EventRuleBuilderComponent,
      nzFooter: null,
      nzWidth: 640,
      nzCentered: true,
      nzBodyStyle: { 'max-height': '75vh', 'overflow-y': 'auto' },
    });
    ref.afterClose.subscribe(saved => { if (saved) this.load(); });
  }

  openEditRule(rule: EventRule): void {
    const ref = this.modalSvc.create({
      nzTitle: `Modifier : ${rule.eventType.name}`,
      nzContent: EventRuleBuilderComponent,
      nzData: { rule },
      nzFooter: null,
      nzWidth: 640,
      nzCentered: true,
      nzBodyStyle: { 'max-height': '75vh', 'overflow-y': 'auto' },
    });
    ref.afterClose.subscribe(saved => { if (saved) this.load(); });
  }

  openInstall(rule: EventRule): void {
    const ref = this.modalSvc.create({
      nzTitle: `Aperçu du trigger - ${rule.eventType.name}`,
      nzContent: EventRuleInstallModalComponent,
      nzData: { rule },
      nzFooter: null,
      nzWidth: 640,
      nzCentered: true,
    });
    ref.afterClose.subscribe(() => this.load());
  }

  openUninstall(rule: EventRule): void {
    const ref = this.modalSvc.create({
      nzTitle: `Supprimer - ${rule.eventType.name}`,
      nzContent: EventRuleInstallModalComponent,
      nzData: { rule, mode: 'uninstall' },
      nzFooter: null,
      nzWidth: 640,
      nzCentered: true,
    });
    ref.afterClose.subscribe(() => this.load());
  }

  deactivate(rule: EventRule): void {
    this.indicatorSvc.deleteEventRule(rule.id).subscribe({
      next: () => { this.messageSvc.success('Règle supprimée.'); this.load(); },
      error: err => this.messageSvc.error(err?.error?.message ?? 'Erreur lors de la suppression.'),
    });
  }
}
