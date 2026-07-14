// frontend/src/app/features/admin/event-rule-install-modal.component.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { IndicatorService } from '../../core/services/indicator.service';
import { EventRule } from '../../core/models/indicator.model';

type ModalMode = 'install' | 'hard-delete';

@Component({
  selector: 'ui-event-rule-install-modal',
  standalone: true,
  imports: [CommonModule, MatIconModule, NzButtonModule, NzAlertModule, NzSpinModule],
  template: `
    <div class="install-modal">
      <p class="install-intro" *ngIf="mode === 'install'">
        Voici le SQL qui serait exécuté sur la base PLaTon pour installer (ou mettre à jour) le
        trigger qui produit réellement l'événement <strong>{{ rule.eventType.label }}</strong>
        ({{ rule.eventType.name }}). <strong>Rien n'est encore exécuté</strong> - vérifiez le SQL
        ci-dessous, puis cliquez sur "Confirmer l'installation" pour l'appliquer réellement.
      </p>
      <p class="install-intro" *ngIf="mode === 'hard-delete'">
        Cette règle sera <strong>supprimée définitivement</strong> (impossible à annuler - il
        faudrait la recréer entièrement). Le trigger de <strong>{{ rule.eventType.label }}</strong>
        ({{ rule.eventType.name }}) sera d'abord retiré (ou réduit s'il est partagé par d'autres
        règles actives sur la même table). <strong>Rien n'est encore exécuté</strong> - vérifiez le
        SQL ci-dessous, puis cliquez sur "Confirmer la suppression définitive".
      </p>

      <nz-spin [nzSpinning]="previewLoading">
        <pre class="sql-block">{{ sql || (previewLoading ? '…' : '(aucun trigger installé - rien à exécuter sur PLaTon)') }}</pre>
      </nz-spin>

      <nz-alert *ngIf="result && result.success"
        nzType="success" nzShowIcon
        [nzMessage]="mode === 'install' ? 'Trigger installé avec succès.' : 'Règle supprimée définitivement.'">
      </nz-alert>

      <nz-alert *ngIf="result && !result.success"
        nzType="error" nzShowIcon
        [nzMessage]="(mode === 'install' ? 'Installation impossible : ' : 'Suppression impossible : ') + result.message"
        nzDescription="Exécutez le SQL ci-dessus manuellement (psql, pgAdmin…) sur la base PLaTon, ou faites élever les droits du rôle applicatif, puis relancez l'action.">
      </nz-alert>

      <div class="install-actions">
        <button nz-button (click)="copySql()" [disabled]="!sql">
          <mat-icon style="font-size:16px;vertical-align:middle">content_copy</mat-icon>
          Copier le SQL
        </button>
        <button nz-button (click)="close()">Fermer</button>
        <button nz-button nzType="primary" [nzDanger]="mode === 'hard-delete'"
          [nzLoading]="working" [disabled]="previewLoading" (click)="confirm()">
          {{ mode === 'install' ? "Confirmer l'installation" : 'Confirmer la suppression définitive' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .install-modal { display:flex; flex-direction:column; gap:12px; }
    .install-intro { color:#888; font-size:13px; margin:0; }
    .sql-block {
      background:#1e1e1e; color:#d4d4d4; padding:12px; border-radius:6px;
      font-size:12px; line-height:1.5; overflow-x:auto; white-space:pre; max-height:320px;
    }
    .install-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:8px; }
  `],
})
export class EventRuleInstallModalComponent implements OnInit {
  private readonly modalRef = inject(NzModalRef);
  private readonly indicatorSvc = inject(IndicatorService);
  private readonly messageSvc = inject(NzMessageService);
  private readonly modalData = inject(NZ_MODAL_DATA) as { rule: EventRule; mode?: ModalMode };

  rule: EventRule = this.modalData.rule;
  mode: ModalMode = this.modalData.mode ?? 'install';
  sql = '';
  previewLoading = true;
  working = false;
  result: { success: boolean; message?: string } | null = null;

  ngOnInit(): void {
    const preview = this.mode === 'install'
      ? this.indicatorSvc.previewInstallSql(this.rule.id)
      : this.indicatorSvc.previewHardDeleteSql(this.rule.id);
    preview.subscribe({
      next: r => { this.sql = r.sql; this.previewLoading = false; },
      error: () => { this.previewLoading = false; },
    });
  }

  copySql(): void {
    navigator.clipboard?.writeText(this.sql);
    this.messageSvc.success('SQL copié dans le presse-papiers.');
  }

  confirm(): void {
    this.working = true;
    const action = this.mode === 'install'
      ? this.indicatorSvc.installTrigger(this.rule.id)
      : this.indicatorSvc.hardDeleteEventRule(this.rule.id);
    action.subscribe({
      next: r => {
        this.working = false;
        this.sql = r.sql || this.sql;
        this.result = { success: r.success, message: r.message };
        if (r.success) {
          this.messageSvc.success(this.mode === 'install' ? 'Trigger installé.' : 'Règle supprimée définitivement.');
          this.close();
        }
      },
      error: err => {
        this.working = false;
        this.result = { success: false, message: err?.error?.message ?? 'Erreur inattendue.' };
      },
    });
  }

  close(): void {
    this.modalRef.close(this.result?.success ? true : null);
  }
}
