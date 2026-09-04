import { ChangeDetectionStrategy, Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NzIconModule } from 'ng-zorro-antd/icon'

@Component({
  standalone: true,
  selector: 'ui-error-403',
  template: `
    <div class="error-403">
      <span nz-icon nzType="lock" nzTheme="outline" style="font-size:3rem;color:#ccc"></span>
      <p>Vous n'avez pas les droits nécessaires pour accéder à cette section.</p>
    </div>
  `,
  styles: [`.error-403 { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem; color: #888; text-align: center; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzIconModule],
})
export class UiError403Component {}
