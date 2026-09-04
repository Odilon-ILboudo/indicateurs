import { CommonModule, Location } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core'
import { RouterModule } from '@angular/router'
import { combineLatest, Subscription } from 'rxjs'

import { MatIconModule } from '@angular/material/icon'

import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb'
import { NzGridModule } from 'ng-zorro-antd/grid'
import { NzTypographyModule } from 'ng-zorro-antd/typography'
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header'
import { NzDividerModule } from 'ng-zorro-antd/divider'
import { NzEmptyModule } from 'ng-zorro-antd/empty'
import { NzSpinModule } from 'ng-zorro-antd/spin'
import { NzModalService } from 'ng-zorro-antd/modal'

import { DurationPipe, UiLayoutBlockComponent } from '@platon/shared/ui'
import { CourseActivityCardComponent } from '@platon/feature/course/browser'
import { ResultLegendComponent } from '@platon/feature/result/browser'

import { IndicatorService } from '../../../../core/services/indicator.service'
import { RoleService } from '../../../../core/services/role.service'
import { DashboardSettingsService } from '../../../../core/services/dashboard-settings.service'
import { DashboardContext, IndicatorDefinition, IndicatorPin } from '../../../../core/models/indicator.model'
import { IndicatorCardComponent } from '../../../../shared/ui/indicator-card/indicator-card.component'
import { PinIndicatorModalComponent } from '../../../pin-indicator-modal/pin-indicator-modal.component'
import { GroupSnapshotsPanelComponent } from './group-snapshots-panel.component'
import { ActivityPresenter } from './activity.presenter'
import { getCurrentUserId } from '../../../../core/auth/current-user'
import { isActivityAware } from '../../../../shared/utils/indicator-formula.util'

@Component({
  standalone: true,
  selector: 'app-course-activity',
  templateUrl: './activity.page.html',
  styleUrls: ['./activity.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ActivityPresenter],
  imports: [
    CommonModule,
    RouterModule,

    MatIconModule,

    NzGridModule,
    NzBreadCrumbModule,
    NzTypographyModule,
    NzPageHeaderModule,
    NzDividerModule,
    NzEmptyModule,
    NzSpinModule,

    DurationPipe,

    CourseActivityCardComponent,
    ResultLegendComponent,

    IndicatorCardComponent,
    GroupSnapshotsPanelComponent,
    UiLayoutBlockComponent,
  ],
})
export class CourseActivityPage implements OnInit, OnDestroy {
  protected readonly location = inject(Location)
  private readonly presenter = inject(ActivityPresenter)
  private readonly changeDetectorRef = inject(ChangeDetectorRef)
  private readonly indicatorService = inject(IndicatorService)
  private readonly roleService = inject(RoleService)
  private readonly settingsService = inject(DashboardSettingsService)
  private readonly modal = inject(NzModalService)
  private readonly subscriptions: Subscription[] = []

  protected context = this.presenter.defaultContext()
  protected collapsedGlobal = false
  protected collapsedGroup = false
  protected collapsedLearner = false

  // Indicateurs par contexte
  protected activityIndicators: IndicatorDefinition[] = []
  protected groupIndicators: IndicatorDefinition[] = []
  // Indicateurs personnels activity-aware (learner/teacher/admin)
  protected learnerIndicators: IndicatorDefinition[] = []
  protected teacherIndicators: IndicatorDefinition[] = []
  protected adminIndicators: IndicatorDefinition[] = []
  protected indicatorsLoading = true
  protected activityContext: DashboardContext | null = null
  protected learnerContext: DashboardContext | null = null
  protected teacherContext: DashboardContext | null = null
  protected adminContext: DashboardContext | null = null
  protected indicatorQueryParams: Record<string, string> = {}

  /*
  Indicateurs figés (pins enseignant) sur cette activité - indépendant des
  préférences perso, cf. IndicatorPinsService côté backend.
  */
  protected pinsByIndicatorId = new Map<string, IndicatorPin>()
  protected canManagePins = false
  private currentActivityId: string | null = null

  ngOnInit(): void {
    this.subscriptions.push(
      this.presenter.contextChange.subscribe((context) => {
        this.context = context
        this.changeDetectorRef.markForCheck()

        if (context.activity) {
          const activityId = context.activity.id
          const courseId = context.course?.id ?? ''
          const activityName = context.activity.title ?? ''
          const courseName = context.course?.name ?? ''

          this.currentActivityId = activityId
          this.canManagePins = context.activity.permissions?.update ?? false
          this.loadActivityIndicators(activityId)

          // Contexte pour les indicator cards
          this.activityContext = {
            scope: 'activity',
            scopeId: activityId,
            userId: '',
          }

          // Query params pour la navigation vers le détail
          this.indicatorQueryParams = {
            from: 'activity',
            activityId,
            courseId,
            activityName,
            courseName,
          }

          this.changeDetectorRef.markForCheck()
        }
      }),
    )
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  private loadActivityIndicators(activityId: string): void {
    this.indicatorsLoading = true
    this.subscriptions.push(
      combineLatest([
        this.indicatorService.loadIndicators(),
        this.settingsService.getSettings(),
        this.roleService.role$,
        this.indicatorService.listPins('activity', activityId),
      ]).subscribe({
        next: ([indicators, settings, , pins]) => {
          this.pinsByIndicatorId = new Map(pins.map(p => [p.indicatorId, p]))

          const visible = indicators.filter(ind =>
            this.roleService.canSeeIndicatorContext(ind.contextType, ind.visibilityRoles) &&
            settings.activeIndicators.includes(ind.id))
          // Seuls les indicateurs group activity-aware ont leur sens ici
          this.groupIndicators = visible.filter(ind =>
            ind.contextType === 'group' && isActivityAware(ind.formula))
          this.learnerIndicators = visible.filter(ind =>
            ind.contextType === 'learner' && isActivityAware(ind.formula))
          this.learnerContext = {
            scope: 'learner',
            scopeId: getCurrentUserId(),
            userId: getCurrentUserId(),
            activityId,
          }
          this.teacherIndicators = visible.filter(ind =>
            ind.contextType === 'teacher' && isActivityAware(ind.formula))
          this.teacherContext = {
            scope: 'teacher',
            scopeId: getCurrentUserId(),
            userId: getCurrentUserId(),
            activityId,
          }
          this.adminIndicators = visible.filter(ind =>
            ind.contextType === 'admin' && isActivityAware(ind.formula))
          this.adminContext = {
            scope: 'admin',
            scopeId: getCurrentUserId(),
            userId: getCurrentUserId(),
            activityId,
          }

          // Union des indicateurs activés perso et de ceux déjà figés par un enseignant
          const byId = new Map<string, IndicatorDefinition>()
          for (const ind of visible.filter(ind => ind.contextType === 'activity')) byId.set(ind.id, ind)
          for (const ind of indicators) {
            if (ind.contextType === 'activity' && this.pinsByIndicatorId.has(ind.id)) byId.set(ind.id, ind)
          }
          this.activityIndicators = Array.from(byId.values())

          this.indicatorsLoading = false
          this.changeDetectorRef.markForCheck()
        },
        error: () => {
          this.indicatorsLoading = false
          this.changeDetectorRef.markForCheck()
        },
      }),
    )
  }

  /** contextType passé explicitement : contrairement aux indicateurs `activity`, celui d'une
   carte personnelle dépend de l'indicateur cliqué, pas fixe.
  */
  protected personalIndicatorQueryParams(contextType: string): Record<string, string> {
    return { ...this.indicatorQueryParams, from: 'activity-personal', contextType }
  }

  protected onPinToggle(indicator: IndicatorDefinition): void {
    const activityId = this.currentActivityId
    if (!activityId) return

    const existingPin = this.pinsByIndicatorId.get(indicator.id) ?? null

    const modalRef = this.modal.create({
      nzTitle: existingPin ? `Seuils figés - "${indicator.name}"` : `Figer "${indicator.name}"`,
      nzContent: PinIndicatorModalComponent,
      nzData: { indicator, contextType: 'activity', contextId: activityId, existingPin },
      nzFooter: null,
      nzWidth: 480,
    })
    modalRef.afterClose.subscribe((result) => {
      if (result) this.loadActivityIndicators(activityId)
    })
  }

}
