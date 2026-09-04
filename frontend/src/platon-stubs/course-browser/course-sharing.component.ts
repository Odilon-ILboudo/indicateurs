import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'

@Component({
  standalone: true,
  selector: 'course-sharing',
  template: `<p style="padding: 0.5rem;">Partage du cours {{ courseId }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class CourseSharingComponent {
  @Input() courseId?: string
}
