import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzEmptyModule } from 'ng-zorro-antd/empty';

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
