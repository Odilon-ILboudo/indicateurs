// Stub: @platon/feature/peer/browser
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'

@Component({
  standalone: true,
  selector: 'peer-tree',
  template: `
    <div *ngIf="activityId" style="padding:1rem;color:#888;text-align:center;border:1px solid var(--brand-border-color-light,#f0f0f0);border-radius:8px">
      Arbre des pairs — activité {{ activityId }}
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class PeerTreeComponent {
  @Input() activityId?: string
}
