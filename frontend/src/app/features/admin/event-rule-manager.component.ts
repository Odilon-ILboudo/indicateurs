import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzModalService, NzModalModule, NzModalRef } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { forkJoin } from 'rxjs';
import { IndicatorService } from '../../core/services/indicator.service';
import { EventRule, EventRuleCondition, EventTypeOption } from '../../core/models/indicator.model';
import { EventRuleBuilderComponent } from './event-rule-builder.component';
import { EventRuleInstallModalComponent } from './event-rule-install-modal.component';

@Component({
  selector: 'ui-event-rule-manager',
  standalone: true,
  imports: [
    CommonModule, MatIconModule, NzTableModule, NzButtonModule, NzTagModule,
    NzToolTipModule, NzPopconfirmModule, NzEmptyModule, NzSpinModule, NzDividerModule, NzModalModule,
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
              <th style="width:260px;text-align:center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of rules" [class.rule-row--inactive]="!r.isActive">
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
                <nz-tag *ngIf="!r.isActive" nzColor="default">Désactivée</nz-tag>
                <nz-tag *ngIf="r.isActive && r.triggerInstalled" nzColor="green">Installé</nz-tag>
                <nz-tag *ngIf="r.isActive && !r.triggerInstalled && !r.lastInstallError" nzColor="orange">Non installé</nz-tag>
                <nz-tag *ngIf="r.isActive && !r.triggerInstalled && r.lastInstallError" nzColor="red"
                  nz-tooltip [nzTooltipTitle]="r.lastInstallError">Erreur</nz-tag>
              </td>
              <td>
                <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
                  <button nz-button nzType="text" nzSize="small"
                    *ngIf="!r.isActive"
                    nz-tooltip="Réactiver cette règle"
                    (click)="reactivate(r)">
                    <mat-icon style="font-size:16px;line-height:1.3">restore</mat-icon>
                  </button>
                  <ng-container *ngIf="r.isActive">
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
                    <button nz-button nzType="text" nzSize="small"
                      nz-tooltip="Désactiver (le trigger, si installé, reste tel quel sur PLaTon)"
                      nz-popconfirm
                      nzPopconfirmTitle="Désactiver cette règle ?"
                      nzPopconfirmPlacement="left"
                      (nzOnConfirm)="deactivate(r)">
                      <mat-icon style="font-size:16px;line-height:1.3">visibility_off</mat-icon>
                    </button>
                  </ng-container>
                  <button nz-button nzType="text" nzDanger nzSize="small"
                    *ngIf="!r.triggerInstalled"
                    nz-tooltip="Supprimer définitivement"
                    nz-popconfirm
                    nzPopconfirmTitle="Supprimer cette règle définitivement ? Impossible à annuler."
                    nzPopconfirmPlacement="left"
                    (nzOnConfirm)="hardDelete(r)">
                    <mat-icon style="font-size:16px;line-height:1.3">delete_forever</mat-icon>
                  </button>
                  <button nz-button nzType="text" nzDanger nzSize="small"
                    *ngIf="r.triggerInstalled"
                    nz-tooltip="Voir le SQL et supprimer définitivement (retire aussi le trigger)"
                    (click)="openHardDelete(r)">
                    <mat-icon style="font-size:16px;line-height:1.3">delete_forever</mat-icon>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </nz-table>
        <nz-empty *ngIf="!loading && rules.length === 0"
          nzNotFoundContent="Aucune règle - créez-en une avec le bouton ci-dessus.">
        </nz-empty>

        <ng-container *ngIf="orphanTypes.length">
          <nz-divider nzText="Types d'événements sans règle"></nz-divider>
          <p class="rule-manager-intro rule-manager-intro--wide">
            Ces noms existent dans le catalogue mais aucune règle ne les produit - ils ne sont pas
            sélectionnables dans le wizard d'indicateur tant qu'aucune règle n'est créée et installée
            pour eux.
          </p>
          <div class="orphan-list">
            <div class="orphan-item" *ngFor="let t of orphanTypes">
              <div>
                <div style="font-weight:500">{{ t.name }}</div>
                <div style="font-size:11px;color:#999">{{ t.label }}</div>
              </div>
              <div class="orphan-item-actions">
                <button nz-button nzSize="small" (click)="openNewRuleForType(t)" class="icon-btn">
                  <mat-icon>add</mat-icon>
                  Créer une règle
                </button>
                <button nz-button nzType="text" nzDanger nzSize="small"
                  nz-tooltip="Supprimer définitivement ce type"
                  nz-popconfirm
                  nzPopconfirmTitle="Supprimer ce type d'événement définitivement ? Impossible à annuler."
                  nzPopconfirmPlacement="left"
                  (nzOnConfirm)="deleteType(t)">
                  <mat-icon style="font-size:16px;line-height:1.3">delete_forever</mat-icon>
                </button>
              </div>
            </div>
          </div>
        </ng-container>
      </nz-spin>
    </div>
  `,
  styles: [`
    .rule-manager { display:flex; flex-direction:column; gap:12px; }
    .rule-manager-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .rule-manager-intro { color:#888; font-size:13px; margin:0; max-width:640px; }
    .rule-manager-intro--wide { max-width:none; }
    .icon-btn { display: inline-flex !important; align-items: center; gap: 6px; }
    .icon-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .rule-row--inactive { opacity: 0.6; }
    .orphan-list { display:flex; flex-direction:column; gap:8px; }
    .orphan-item {
      display:flex; justify-content:space-between; align-items:center;
      padding:8px 12px; border:1px solid #f0f0f0; border-radius:8px; background:#fafafa;
    }
    .orphan-item-actions { display:flex; align-items:center; gap:4px; }
  `],
})
export class EventRuleManagerComponent implements OnInit {
  private readonly indicatorSvc = inject(IndicatorService);
  private readonly modalSvc = inject(NzModalService);
  private readonly messageSvc = inject(NzMessageService);
  private readonly selfRef = inject(NzModalRef, { optional: true });

  /* Referme cette modale, attend la FIN réelle de son animation de fermeture (via
   `afterClose`, pas un simple `setTimeout`) avant d'ouvrir la modale imbriquée - sinon les
   deux overlays se chevauchent brièvement pendant que celui de la première s'estompe.
   Rouvre celle-ci à la fermeture de la modale imbriquée.
  */
  private openNested(factory: () => Parameters<NzModalService['create']>[0]): void {
    const openNext = () => {
      const ref = this.modalSvc.create(factory());
      ref.afterClose.subscribe(() => {
        this.modalSvc.create({
          nzTitle: 'Événements & déclencheurs',
          nzContent: EventRuleManagerComponent,
          nzFooter: null,
          nzWidth: '80vw',
          nzCentered: true,
          nzBodyStyle: { 'max-height': '80vh', 'overflow-y': 'auto' },
        });
      });
    };

    if (this.selfRef) {
      this.selfRef.afterClose.subscribe(openNext);
      this.selfRef.close();
    } else {
      openNext();
    }
  }

  rules: EventRule[] = [];
  orphanTypes: EventTypeOption[] = [];
  loading = false;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    forkJoin({
      rules: this.indicatorSvc.getEventRules(),
      types: this.indicatorSvc.getEventTypes(),
    }).subscribe({
      next: ({ rules, types }) => {
        this.rules = rules;
        const usedTypeIds = new Set(rules.map(r => r.eventTypeId));
        this.orphanTypes = types.filter(t => !usedTypeIds.has(t.id));
        this.loading = false;
      },
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
    this.openNested(() => ({
      nzTitle: 'Nouvelle règle de déclenchement',
      nzContent: EventRuleBuilderComponent,
      nzFooter: null,
      nzWidth: 640,
      nzCentered: true,
      nzBodyStyle: { 'max-height': '75vh', 'overflow-y': 'auto' },
    }));
  }

  openNewRuleForType(type: EventTypeOption): void {
    this.openNested(() => ({
      nzTitle: `Nouvelle règle pour ${type.name}`,
      nzContent: EventRuleBuilderComponent,
      nzData: { presetEventTypeId: type.id },
      nzFooter: null,
      nzWidth: 640,
      nzCentered: true,
      nzBodyStyle: { 'max-height': '75vh', 'overflow-y': 'auto' },
    }));
  }

  openEditRule(rule: EventRule): void {
    this.openNested(() => ({
      nzTitle: `Modifier : ${rule.eventType.name}`,
      nzContent: EventRuleBuilderComponent,
      nzData: { rule },
      nzFooter: null,
      nzWidth: 640,
      nzCentered: true,
      nzBodyStyle: { 'max-height': '75vh', 'overflow-y': 'auto' },
    }));
  }

  openInstall(rule: EventRule): void {
    this.openNested(() => ({
      nzTitle: `Aperçu du trigger - ${rule.eventType.name}`,
      nzContent: EventRuleInstallModalComponent,
      nzData: { rule },
      nzFooter: null,
      nzWidth: 640,
      nzCentered: true,
    }));
  }

  openHardDelete(rule: EventRule): void {
    this.openNested(() => ({
      nzTitle: `Supprimer définitivement - ${rule.eventType.name}`,
      nzContent: EventRuleInstallModalComponent,
      nzData: { rule, mode: 'hard-delete' },
      nzFooter: null,
      nzWidth: 640,
      nzCentered: true,
    }));
  }

  deactivate(rule: EventRule): void {
    this.indicatorSvc.deleteEventRule(rule.id).subscribe({
      next: () => { this.messageSvc.success('Règle désactivée.'); this.load(); },
      error: err => this.messageSvc.error(err?.error?.message ?? 'Erreur lors de la désactivation.'),
    });
  }

  reactivate(rule: EventRule): void {
    this.indicatorSvc.reactivateEventRule(rule.id).subscribe({
      next: () => { this.messageSvc.success('Règle réactivée.'); this.load(); },
      error: err => this.messageSvc.error(err?.error?.message ?? 'Erreur lors de la réactivation.'),
    });
  }

  hardDelete(rule: EventRule): void {
    this.indicatorSvc.hardDeleteEventRule(rule.id).subscribe({
      next: () => { this.messageSvc.success('Règle supprimée définitivement.'); this.load(); },
      error: err => this.messageSvc.error(err?.error?.message ?? 'Erreur lors de la suppression.'),
    });
  }

  deleteType(type: EventTypeOption): void {
    this.indicatorSvc.deleteEventType(type.id).subscribe({
      next: () => { this.messageSvc.success('Type supprimé définitivement.'); this.load(); },
      error: err => this.messageSvc.error(err?.error?.message ?? 'Erreur lors de la suppression.'),
    });
  }
}
