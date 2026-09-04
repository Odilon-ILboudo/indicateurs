import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'

@Component({
  standalone: true,
  selector: 'ui-file-preview',
  template: `<div class="file-preview"><ng-content></ng-content></div>`,
  styles: [`.file-preview { width: 100%; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class UiFilePreviewComponent {
  @Input() url?: string
  @Input() language?: string
}
