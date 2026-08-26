import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core'
import { Subscription, combineLatest } from 'rxjs'

import { MatIconModule } from '@angular/material/icon'
import { NzDividerModule } from 'ng-zorro-antd/divider'
import { NzEmptyModule } from 'ng-zorro-antd/empty'
import { NzGridModule } from 'ng-zorro-antd/grid'
import { NzSpinModule } from 'ng-zorro-antd/spin'

import { CoursePresenter } from '../course.presenter'
import { IndicatorService } from '../../../../core/services/indicator.service'
import { RoleService } from '../../../../core/services/role.service'
import { DashboardSettingsService } from '../../../../core/services/dashboard-settings.service'
import { DashboardContext, IndicatorDefinition } from '../../../../core/models/indicator.model'
import { IndicatorCardComponent } from '../../../../shared/ui/indicator-card/indicator-card.component'
import { GroupSnapshotsPanelComponent } from '../activity/group-snapshots-panel.component'
import { isCourseAware } from '../../../../shared/utils/indicator-formula.util'
import { getCurrentUserId } from '../../../../core/auth/current-user'

@Component({
  standalone: true,
  selector: 'app-course-my-stats',
  templateUrl: './my-stats.page.html',
  styleUrls: ['./my-stats.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    NzDividerModule,
    NzEmptyModule,
    NzGridModule,
    NzSpinModule,
    IndicatorCardComponent,
    GroupSnapshotsPanelComponent,
  ],
})
export class CourseMyStatsPage implements OnInit, OnDestroy {
  private readonly presenter = inject(CoursePresenter)
  private readonly changeDetectorRef = inject(ChangeDetectorRef)
  private readonly indicatorService = inject(IndicatorService)
  private readonly roleService = inject(RoleService)
  private readonly settingsService = inject(DashboardSettingsService)
  private readonly subscriptions: Subscription[] = []

  protected context = this.presenter.defaultContext()

  // Indicateurs personnels (learner/teacher/admin) course-aware : n'affichent jamais une
  // valeur "globale" (voir isCourseAware()), seulement celle de ce cours.
  protected learnerIndicators: IndicatorDefinition[] = []
  protected teacherIndicators: IndicatorDefinition[] = []
  protected adminIndicators: IndicatorDefinition[] = []
  protected loading = true
  protected learnerContext: DashboardContext | null = null
  protected teacherContext: DashboardContext | null = null
  protected adminContext: DashboardContext | null = null
  // Objets stables (calculés une fois par chargement, pas à chaque cycle de détection) : un
  // [queryParams]="uneMethode()" recréerait un nouvel objet à chaque vérification, ce qui
  // ferait recharger la carte indicateur en boucle (voir ngOnChanges de ui-indicator-card).
  protected learnerQueryParams: Record<string, string> = {}
  protected teacherQueryParams: Record<string, string> = {}
  protected adminQueryParams: Record<string, string> = {}
  private indicatorQueryParams: Record<string, string> = {}

  // Indicateurs 'group' course-aware (filtrés par course_id, agrègent toutes les activités du
  // cours pour un groupe) - voir isCourseAware(). Rendus via GroupSnapshotsPanelComponent sans
  // [activityId] (mode cours entier). Sous-section distincte des stats personnelles ci-dessus.
  protected groupIndicators: IndicatorDefinition[] = []
  protected collapsedGroup = false

  ngOnInit(): void {
    this.subscriptions.push(
      this.presenter.contextChange.subscribe((context) => {
        this.context = context
        if (context.course) {
          const courseId = context.course.id
          const courseName = context.course.name
          this.indicatorQueryParams = { from: 'course', courseId, courseName }
          this.loadIndicators(courseId)
        }
        this.changeDetectorRef.markForCheck()
      })
    )
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  private loadIndicators(courseId: string): void {
    this.loading = true
    this.subscriptions.push(
      combineLatest([this.indicatorService.loadIndicators(), this.settingsService.getSettings()]).subscribe({
        next: ([indicators, settings]) => {
          const isVisiblePersonal = (ind: IndicatorDefinition) =>
            isCourseAware(ind.formula) &&
            this.roleService.canSeeIndicatorContext(ind.contextType, ind.visibilityRoles) &&
            settings.activeIndicators.includes(ind.id)

          this.learnerIndicators = indicators.filter(ind => ind.contextType === 'learner' && isVisiblePersonal(ind))
          this.teacherIndicators = indicators.filter(ind => ind.contextType === 'teacher' && isVisiblePersonal(ind))
          this.adminIndicators = indicators.filter(ind => ind.contextType === 'admin' && isVisiblePersonal(ind))

          this.groupIndicators = indicators.filter(ind =>
            ind.contextType === 'group' &&
            isCourseAware(ind.formula) &&
            this.roleService.canSeeIndicatorContext(ind.contextType, ind.visibilityRoles) &&
            settings.activeIndicators.includes(ind.id))

          const personalContext = (scope: 'learner' | 'teacher' | 'admin'): DashboardContext => ({
            scope, scopeId: getCurrentUserId(), userId: getCurrentUserId(), courseId,
          })
          this.learnerContext = personalContext('learner')
          this.teacherContext = personalContext('teacher')
          this.adminContext = personalContext('admin')
          this.learnerQueryParams = this.personalIndicatorQueryParams('learner')
          this.teacherQueryParams = this.personalIndicatorQueryParams('teacher')
          this.adminQueryParams = this.personalIndicatorQueryParams('admin')

          this.loading = false
          this.changeDetectorRef.markForCheck()
        },
        error: () => {
          this.loading = false
          this.changeDetectorRef.markForCheck()
        },
      }),
    )
  }

  /**
   * queryParams distincts : le contextType n'est pas fixe (dépend de l'indicateur cliqué),
   * indicator-detail.component.ts a besoin de le recevoir explicitement plutôt que de le
   * déduire de `from` (voir la branche `course-personal`).
   */
  protected personalIndicatorQueryParams(contextType: string): Record<string, string> {
    return { ...this.indicatorQueryParams, from: 'course-personal', contextType }
  }

  protected get hasIndicators(): boolean {
    return this.learnerIndicators.length > 0 || this.teacherIndicators.length > 0 || this.adminIndicators.length > 0
  }
}
