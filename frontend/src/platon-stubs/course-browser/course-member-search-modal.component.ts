import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NzButtonModule } from 'ng-zorro-antd/button'
import { CourseMember } from '../course-common'

@Component({
  standalone: true,
  selector: 'course-member-search-modal',
  template: `
    <div *ngIf="visible" class="modal-backdrop" (click)="close()">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <h3>{{ title }}</h3>
        <ng-content></ng-content>
        <div class="modal-footer">
          <button nz-button nzType="primary" (click)="confirm()">{{ okTitle }}</button>
          <button nz-button (click)="close()">Annuler</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
    .modal-box { background: #fff; border-radius: 8px; padding: 1.5rem; min-width: 400px; }
    h3 { margin: 0 0 1rem; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzButtonModule],
})
export class CourseMemberSearchModalComponent {
  @Input() title = 'Ajouter des membres'
  @Input() okTitle = 'OK'
  @Input() multi = false
  @Input() excludes: string[] = []
  @Input() courseId = ''
  @Input() allowGroup = false

  @Output() closed = new EventEmitter<CourseMember[]>()

  protected visible = false

  open(): void { this.visible = true }
  close(): void { this.visible = false; this.closed.emit([]) }
  confirm(): void { this.visible = false; this.closed.emit([]) }
}
