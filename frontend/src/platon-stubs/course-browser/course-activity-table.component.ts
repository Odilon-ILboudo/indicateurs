import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NzProgressModule } from 'ng-zorro-antd/progress'
import { NzTagModule } from 'ng-zorro-antd/tag'
import { Activity, CourseSection } from '../course-common'

@Component({
  standalone: true,
  selector: 'course-activity-table',
  template: `
    <table class="activity-table" *ngIf="activities.length">
      <thead>
        <tr>
          <th>Activité</th>
          <th>Section</th>
          <th>État</th>
          <th>Avancement</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let activity of activities">
          <td>{{ activity.title }}</td>
          <td>{{ getSectionName(activity.sectionId) }}</td>
          <td>
            <nz-tag [nzColor]="getStateColor(activity.state)">{{ getStateLabel(activity.state) }}</nz-tag>
          </td>
          <td><nz-progress [nzPercent]="activity.progression" nzSize="small" /></td>
        </tr>
      </tbody>
    </table>
  `,
  styles: [`
    .activity-table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid var(--brand-border, #f0f0f0); }
    th { font-weight: 600; background: var(--brand-surface-secondary, #fafafa); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzProgressModule, NzTagModule],
})
export class CourseActivityTableComponent {
  @Input() activities: Activity[] = []
  @Input() sections: CourseSection[] = []

  protected getSectionName(sectionId: string): string {
    return this.sections.find((s) => s.id === sectionId)?.name ?? ''
  }

  protected getStateColor(state: string): string {
    return state === 'opened' ? 'green' : state === 'closed' ? 'red' : 'orange'
  }

  protected getStateLabel(state: string): string {
    return state === 'opened' ? 'Ouvert' : state === 'closed' ? 'Fermé' : 'À venir'
  }
}
