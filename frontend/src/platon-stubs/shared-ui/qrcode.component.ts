import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NzIconModule } from 'ng-zorro-antd/icon'

@Component({
  standalone: true,
  selector: 'ui-qrcode',
  template: `
    <div class="qrcode-placeholder" [title]="value">
      <span nz-icon nzType="qrcode" nzTheme="outline" style="font-size:4rem;color:#888"></span>
      <p class="qrcode-value" *ngIf="value">{{ value }}</p>
    </div>
  `,
  styles: [`
    .qrcode-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .qrcode-value { font-size: 0.7rem; color: #888; word-break: break-all; text-align: center; max-width: 160px; margin-top: 0.5rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzIconModule],
})
export class UiQRCodeComponent {
  @Input() value = ''
}
