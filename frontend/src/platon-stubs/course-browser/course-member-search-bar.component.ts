import { ChangeDetectorRef, Component, ChangeDetectionStrategy, Input, OnInit, forwardRef, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { Course, CourseMember, CourseMemberFilters } from '../course-common'
import { CourseService } from './course.service'

@Component({
  standalone: true,
  selector: 'course-member-search-bar',
  template: `
    <div class="search-bar-wrap">
      <span nz-icon nzType="search" nzTheme="outline" style="color:#bbb;margin-right:6px"></span>
      <input
        class="search-input"
        [placeholder]="placeholder"
        (input)="onSearch($event)"
      />
    </div>
    <ng-content></ng-content>
  `,
  styles: [`
    :host { display: block; }
    .search-bar-wrap { display: flex; align-items: center; border: 1px solid #d9d9d9; border-radius: 4px; padding: 6px 10px; background: #fff; }
    .search-input { border: none; outline: none; flex: 1; font-size: 0.9rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CourseMemberSearchBarComponent), multi: true }],
  imports: [CommonModule, NzIconModule],
})
export class CourseMemberSearchBarComponent implements ControlValueAccessor, OnInit {
  @Input() placeholder = 'Rechercher...'
  @Input() filters: CourseMemberFilters = {}
  @Input() courseId = ''
  @Input() autoSelect = false

  total = 0
  searching = false

  private allMembers: CourseMember[] = []
  private onChange = (_: CourseMember[]) => {}
  private onTouched = () => {}
  private courseService = inject(CourseService)
  private changeDetectorRef = inject(ChangeDetectorRef)

  writeValue(_val: CourseMember[]): void {}
  registerOnChange(fn: (_: CourseMember[]) => void): void { this.onChange = fn }
  registerOnTouched(fn: () => void): void { this.onTouched = fn }

  ngOnInit(): void {
    this.refresh()
  }

  /** Recharge la liste depuis le serveur - à appeler après tout ajout/suppression/changement
   de rôle, ce composant ne se rafraîchit jamais tout seul. Public car appelé depuis
   members.page.ts via une référence de template (#searchbar).
  */
  refresh(): void {
    if (!this.courseId) return
    this.searching = true
    this.changeDetectorRef.markForCheck()
    const fakeCourse = { id: this.courseId } as Course
    this.courseService.searchMembers(fakeCourse, this.filters).subscribe({
      next: (res) => {
        this.allMembers = res.resources
        this.total = res.total ?? res.resources.length
        this.searching = false
        this.onChange(this.allMembers)
        this.changeDetectorRef.markForCheck()
      },
      error: () => {
        this.searching = false
        this.changeDetectorRef.markForCheck()
      },
    })
  }

  protected onSearch(event: Event): void {
    const q = (event.target as HTMLInputElement).value.toLowerCase()
    const filtered = q
      ? this.allMembers.filter((m) =>
          (m.user?.username ?? '').toLowerCase().includes(q) ||
          ((m.user as any)?.firstName ?? '').toLowerCase().includes(q) ||
          ((m.user as any)?.lastName ?? '').toLowerCase().includes(q)
        )
      : this.allMembers
    this.onChange(filtered)
  }
}
