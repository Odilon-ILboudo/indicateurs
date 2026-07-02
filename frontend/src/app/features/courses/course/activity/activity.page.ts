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
import { DashboardContext, IndicatorDefinition } from '../../../../core/models/indicator.model'
import { IndicatorCardComponent } from '../../../../shared/ui/indicator-card/indicator-card.component'
import { GroupSnapshotsPanelComponent } from './group-snapshots-panel.component'
import { ActivityPresenter } from './activity.presenter'

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
  private readonly subscriptions: Subscription[] = []
  private readonly today = new Date()

  protected userDistribution: UserActivityResultsDistribution[] = []
  protected context = this.presenter.defaultContext()
  protected collapsedGlobal = false
  protected collapsedGroup = false

  // Indicateurs par contexte
  protected activityIndicators: IndicatorDefinition[] = []
  protected groupIndicators: IndicatorDefinition[] = []
  protected indicatorsLoading = true
  protected activityContext: DashboardContext | null = null
  protected indicatorQueryParams: Record<string, string> = {}

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
    this.loadActivityIndicators()

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

  private loadActivityIndicators(): void {
    this.indicatorsLoading = true
    this.subscriptions.push(
      combineLatest([
        this.indicatorService.loadIndicators(),
        this.settingsService.getSettings(),
        this.roleService.role$,
      ]).subscribe({
        next: ([indicators, settings]) => {
          const visible = indicators.filter(ind =>
            this.roleService.canSeeIndicatorContext(ind.contextType) &&
            settings.activeIndicators.includes(ind.id))
          this.activityIndicators = visible.filter(ind => ind.contextType === 'activity')
          this.groupIndicators = visible.filter(ind => ind.contextType === 'group')
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
