import { CommonModule, Location } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { combineLatest, firstValueFrom, Subscription } from 'rxjs'

import { MatIconModule } from '@angular/material/icon'
import { MatCardModule } from '@angular/material/card'

import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb'
import { NzGridModule } from 'ng-zorro-antd/grid'
import { NzTypographyModule } from 'ng-zorro-antd/typography'
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header'
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker'
import { NzSelectModule, NzSelectOptionInterface } from 'ng-zorro-antd/select'
import { NzSliderModule } from 'ng-zorro-antd/slider'
import { NzInputNumberModule } from 'ng-zorro-antd/input-number'
import { NzDividerModule } from 'ng-zorro-antd/divider'
import { NzEmptyModule } from 'ng-zorro-antd/empty'
import { NzSpinModule } from 'ng-zorro-antd/spin'
import { NzModalService } from 'ng-zorro-antd/modal'

import { DurationPipe, UiLayoutBlockComponent } from '@platon/shared/ui'
import { CourseActivityCardComponent } from '@platon/feature/course/browser'
import {
  KCileComponent,
  ResultByExercisesComponent,
  ResultByMembersComponent,
  ResultLegendComponent,
  ResultService,
  ResultBoxPlotComponent,
} from '@platon/feature/result/browser'
import { UserActivityResultsDistribution } from '@platon/feature/result/common'
import { PeerTreeComponent } from '@platon/feature/peer/browser'

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
    FormsModule,
    RouterModule,

    MatIconModule,
    MatCardModule,

    NzGridModule,
    NzBreadCrumbModule,
    NzTypographyModule,
    NzPageHeaderModule,
    NzDatePickerModule,
    NzSelectModule,
    NzSliderModule,
    NzInputNumberModule,
    NzDividerModule,
    NzEmptyModule,
    NzSpinModule,

    DurationPipe,

    CourseActivityCardComponent,
    ResultByMembersComponent,
    ResultByExercisesComponent,
    ResultLegendComponent,
    KCileComponent,
    ResultBoxPlotComponent,
    PeerTreeComponent,

    IndicatorCardComponent,
    GroupSnapshotsPanelComponent,
    UiLayoutBlockComponent,
  ],
})
export class CourseActivityPage implements OnInit, OnDestroy {
  protected readonly location = inject(Location)
  private readonly presenter = inject(ActivityPresenter)
  private readonly changeDetectorRef = inject(ChangeDetectorRef)
  private readonly resultService = inject(ResultService)
  private readonly indicatorService = inject(IndicatorService)
  private readonly roleService = inject(RoleService)
  private readonly settingsService = inject(DashboardSettingsService)
  private readonly modal = inject(NzModalService)
  private readonly subscriptions: Subscription[] = []
  private readonly today = new Date()

  protected userDistribution: UserActivityResultsDistribution[] = []
  protected context = this.presenter.defaultContext()
  protected collapsedGlobal = false
  protected collapsedGroup = false
  protected collapsedLearner = false

  // Indicateurs par contexte
  protected activityIndicators: IndicatorDefinition[] = []
  protected groupIndicators: IndicatorDefinition[] = []
  // Indicateurs personnels (learner/teacher/admin) dont la formule filtre par activity_id :
  // n'affichent jamais une valeur "globale" (voir isActivityAware()), seulement celle de
  // cette activité. Mutuellement exclusifs en pratique (un même utilisateur n'a jamais deux
  // de ces rôles à la fois), affichés dans la même section "Mes statistiques" du template.
  protected learnerIndicators: IndicatorDefinition[] = []
  protected teacherIndicators: IndicatorDefinition[] = []
  protected adminIndicators: IndicatorDefinition[] = []
  protected indicatorsLoading = true
  protected activityContext: DashboardContext | null = null
  protected learnerContext: DashboardContext | null = null
  protected teacherContext: DashboardContext | null = null
  protected adminContext: DashboardContext | null = null
  protected indicatorQueryParams: Record<string, string> = {}

  // Indicateurs figés (pins enseignant) sur cette activité - indépendant des
  // préférences perso, cf. IndicatorPinsService côté backend.
  protected pinsByIndicatorId = new Map<string, IndicatorPin>()
  protected canManagePins = false
  private currentActivityId: string | null = null

  protected KCileInsightsOption: { selectedBucket: number; possibleBucket: NzSelectOptionInterface[] } = {
    selectedBucket: 10,
    possibleBucket: [
      { label: '2', value: 2 },
      { label: '5', value: 5 },
      { label: '10', value: 10 },
      { label: '15', value: 15 },
      { label: '20', value: 20 },
    ],
  }
  protected dates: Date[] = []
  protected cursorValue = 100
  protected lastDate: Date = this.today
  protected splitDate: Date = this.today
  protected columnOrder?: string[]

  ngOnInit(): void {
    this.subscriptions.push(
      this.presenter.contextChange.subscribe((context) => {
        this.context = context
        this.columnOrder = this.context.results?.exercises.map((e) => e.title)
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

          // Dates from JSON are ISO strings - convert them to Date objects
          const toDate = (v: unknown): Date => v instanceof Date ? v : v ? new Date(v as string) : this.today
          this.onDateChange([
            toDate(context.activity.createdAt),
            toDate(context.activity.closeAt),
          ]).catch(console.error)
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
          this.groupIndicators = visible.filter(ind => ind.contextType === 'group')
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

          // Union : indicateurs activés perso par l'utilisateur (il faut d'abord
          // l'activer soi-même, comme n'importe quel indicateur, pour le voir ici)
          // + indicateurs déjà figés par un enseignant sur cette activité précise
          // (jamais l'inverse - les deux sources restent indépendantes, cf.
          // IndicatorPinsService côté backend). Le bouton "Figer" n'apparaît donc
          // que sur un indicateur déjà visible, pas sur tout le catalogue.
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

  /**
   * queryParams distincts de `indicatorQueryParams` pour les cartes personnelles (learner/
   * teacher/admin) : contrairement aux indicateurs `activity`, leur contextType n'est pas fixe
   * (dépend de l'indicateur cliqué), indicator-detail.component.ts a donc besoin de le recevoir
   * explicitement plutôt que de le déduire de `from` (voir la branche `activity-personal`).
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

  protected async onDateChange(dates: Date[]): Promise<void> {
    this.dates = dates
    this.lastDate = dates[1] ?? this.today
    if (!this.context.activity?.id || this.dates.length !== 2) return
    this.userDistribution = await firstValueFrom(
      this.resultService.activityResultsForDate(this.context.activity.id, this.dates[0], this.dates[1]),
    )
    const nbperson = this.userDistribution.filter((u) => Object.keys(u.nbSuccess).length !== 0).length
    this.KCileInsightsOption.possibleBucket = this.KCileInsightsOption.possibleBucket.filter(
      (b) => nbperson / b.value >= 1,
    )
    this.KCileInsightsOption.selectedBucket =
      this.KCileInsightsOption.possibleBucket[this.KCileInsightsOption.possibleBucket.length - 1]?.value ?? 0
    this.changeDetectorRef.markForCheck()
  }

  protected disabledDate = (current: Date): boolean => {
    return (this.context.activity?.createdAt ?? 0) > current
  }

  protected formatterDate = (value: number): string => {
    return this.convertNumberToDate(value).toLocaleDateString()
  }

  protected splitDateChange(event: number): void {
    this.splitDate = this.convertNumberToDate(event)
    this.changeDetectorRef.markForCheck()
  }

  private convertNumberToDate(value: number): Date {
    const startDate = this.context.activity?.createdAt?.getTime?.() ?? Date.now()
    const endDate = this.context.activity?.closeAt
      ? new Date(this.context.activity.closeAt).getTime()
      : this.today.getTime()
    return new Date(startDate + (endDate - startDate) * (value / 100))
  }
}
