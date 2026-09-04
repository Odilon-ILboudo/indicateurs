import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NzSegmentedModule } from 'ng-zorro-antd/segmented'
import { NzGridModule } from 'ng-zorro-antd/grid'
import { NzEmptyModule } from 'ng-zorro-antd/empty'
import { Activity } from '../course-common'
import { CourseActivityCardComponent } from './course-activity-card.component'

@Component({
  standalone: true,
  selector: 'course-activity-grid',
  template: `
    @if (!empty) {
      <nz-segmented [(ngModel)]="selectedIndex" [nzOptions]="tabOptions" style="margin-bottom:1rem" />
      <ng-container *ngIf="tabs[selectedIndex] as tab">
        <ng-container *ngIf="tab.items.length; else emptyTab">
          <nz-row [nzGutter]="[24, 24]" nzAlign="top">
            <nz-col
              *ngFor="let item of tab.items; trackBy: trackActivity"
              nzXs="24" nzSm="24" nzMd="24" nzLg="12" nzXl="12" nzXXl="8"
            >
              <course-activity-card [item]="item" />
            </nz-col>
          </nz-row>
        </ng-container>
        <ng-template #emptyTab>
          <nz-empty [nzNotFoundContent]="emptyTabContent">
            <ng-template #emptyTabContent>Aucune activité dans cet état.</ng-template>
          </nz-empty>
        </ng-template>
      </ng-container>
    } @else {
      <ng-content></ng-content>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, NzSegmentedModule, NzGridModule, NzEmptyModule, CourseActivityCardComponent],
})
export class CourseActivityGridComponent {
  protected tabs: { title: string; items: Activity[] }[] = []
  protected readonly tabOptions = [
    { label: 'Tout', value: 0 },
    { label: 'Ouvert', value: 1 },
    { label: 'À venir', value: 2 },
    { label: 'Fermé', value: 3 },
  ]
  protected selectedIndex = 0
  protected empty = true

  @Input() editmode = false

  @Input()
  set items(value: Activity[]) {
    this.empty = !value?.length
    this.tabs = [
      { title: 'Tout', items: value ?? [] },
      { title: 'Ouvert', items: (value ?? []).filter((a) => a.state === 'opened') },
      { title: 'À venir', items: (value ?? []).filter((a) => a.state === 'planned') },
      { title: 'Fermé', items: (value ?? []).filter((a) => a.state === 'closed') },
    ]
  }

  protected trackActivity(_: number, item: Activity): string {
    return item.id
  }
}
