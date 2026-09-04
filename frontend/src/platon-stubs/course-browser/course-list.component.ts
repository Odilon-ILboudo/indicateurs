import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NzEmptyModule } from 'ng-zorro-antd/empty'
import { Course } from '../course-common'
import { CourseItemComponent } from './course-item.component'

@Component({
  standalone: true,
  selector: 'course-list',
  template: `
    <ng-container *ngIf="items.length > 0; else empty">
      <div class="course-grid">
        <course-item *ngFor="let item of items" [item]="item" [simple]="simple" />
      </div>
    </ng-container>
    <ng-template #empty>
      <nz-empty nzNotFoundImage="simple" [nzNotFoundContent]="emptyContent">
        <ng-template #emptyContent>
          <ng-content></ng-content>
        </ng-template>
      </nz-empty>
    </ng-template>
  `,
  styles: [`
    :host { display: block; overflow: hidden; }
    .course-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 2rem;
    }
    @media (max-width: 920px) {
      .course-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 768px) {
      .course-grid { display: block; }
      course-item { display: block; margin-bottom: 1rem; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzEmptyModule, CourseItemComponent],
})
export class CourseListComponent {
  @Input() items: Course[] = []
  @Input() simple = false
}
