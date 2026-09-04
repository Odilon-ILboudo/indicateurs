import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'

@Component({
  standalone: true,
  selector: 'ui-layout-block',
  template: `
    @if (state === 'LOADING') {
      <div style="display:flex;align-items:center;justify-content:center;padding:2rem;color:#888">Chargement…</div>
    } @else if (state === 'ERROR') {
      <div style="display:flex;align-items:center;justify-content:center;padding:2rem;color:#f44">Erreur de chargement</div>
    } @else {
      <ng-content></ng-content>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class UiLayoutBlockComponent {
  @Input() state: string = 'READY'
}
