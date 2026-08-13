/* eslint-disable @typescript-eslint/no-explicit-any */
import Fuse from 'fuse.js'

import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core'
import { RouterModule } from '@angular/router'
import { Subscription, combineLatest, of } from 'rxjs'

import { MatIconModule } from '@angular/material/icon'
import { NzButtonModule } from 'ng-zorro-antd/button'
import { NzCollapseModule } from 'ng-zorro-antd/collapse'
import { NzDividerModule } from 'ng-zorro-antd/divider'
import { NzEmptyModule } from 'ng-zorro-antd/empty'
import { NzGridModule } from 'ng-zorro-antd/grid'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { NzSegmentedModule } from 'ng-zorro-antd/segmented'
import { NzSpinModule } from 'ng-zorro-antd/spin'
import { NzTypographyModule } from 'ng-zorro-antd/typography'

import {
  CourseActivityGridComponent,
  CourseActivityTableComponent,
  CsvDownloadButtonComponent,
} from '@platon/feature/course/browser'
import { Activity, CourseSection } from '@platon/feature/course/common'
import { CourseSectionActionsComponent } from './section-actions/section-actions.component'
import { CourseManagementTutorialService } from '@platon/feature/tuto/browser'

import {
  SearchBar,
  UiSearchBarComponent,
  UiViewModeComponent,
} from '@platon/shared/ui'
import { NzTooltipModule } from 'ng-zorro-antd/tooltip'
import { NzModalService } from 'ng-zorro-antd/modal'
import { CoursePresenter } from '../course.presenter'

import { IndicatorService } from '../../../../core/services/indicator.service'
import { RoleService } from '../../../../core/services/role.service'
import { DashboardSettingsService } from '../../../../core/services/dashboard-settings.service'
import { DashboardContext, IndicatorDefinition, IndicatorPin } from '../../../../core/models/indicator.model'
import { IndicatorCardComponent } from '../../../../shared/ui/indicator-card/indicator-card.component'
import { PinIndicatorModalComponent } from '../../../pin-indicator-modal/pin-indicator-modal.component'
import { GroupSnapshotsPanelComponent } from '../activity/group-snapshots-panel.component'
import { isCourseAware } from '../../../../shared/utils/indicator-formula.util'
import { getCurrentUserId } from '../../../../core/auth/current-user'

@Component({
  standalone: true,
  selector: 'app-course-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,

    MatIconModule,
    NzIconModule,
    NzGridModule,
    NzEmptyModule,
    NzButtonModule,
    NzTooltipModule,
    NzCollapseModule,
    NzDividerModule,
    NzSegmentedModule,
    NzSpinModule,
    NzTypographyModule,

    CourseActivityGridComponent,
    CourseActivityTableComponent,
    CourseSectionActionsComponent,
    CsvDownloadButtonComponent,

    UiViewModeComponent,
    UiSearchBarComponent,

    IndicatorCardComponent,
    GroupSnapshotsPanelComponent,
  ],
})
export class CourseDashboardPage implements OnInit, OnDestroy {
  private readonly presenter = inject(CoursePresenter)
  private readonly changeDetectorRef = inject(ChangeDetectorRef)
  private readonly indicatorService = inject(IndicatorService)
  private readonly roleService = inject(RoleService)
  private readonly settingsService = inject(DashboardSettingsService)
  private readonly modal = inject(NzModalService)
  private readonly subscriptions: Subscription[] = []

  protected context = this.presenter.defaultContext()

  // Indicateurs de contexte 'course'
  protected courseIndicators: IndicatorDefinition[] = []
  // Indicateurs 'group' course-aware (filtrés par course_id, agrègent toutes les activités
  // du cours pour un groupe) - voir isCourseAware(). Rendus via GroupSnapshotsPanelComponent
  // sans [activityId] (mode cours entier).
  protected groupIndicators: IndicatorDefinition[] = []
  // Indicateurs personnels (learner/teacher/admin) course-aware : n'affichent jamais une
  // valeur "globale" (voir isCourseAware()), seulement celle de ce cours. Mutuellement
  // exclusifs en pratique, affichés dans la même section "Mes statistiques".
  protected learnerIndicators: IndicatorDefinition[] = []
  protected teacherIndicators: IndicatorDefinition[] = []
  protected adminIndicators: IndicatorDefinition[] = []
  protected indicatorsLoading = true
  protected courseContext: DashboardContext | null = null
  protected learnerContext: DashboardContext | null = null
  protected teacherContext: DashboardContext | null = null
  protected adminContext: DashboardContext | null = null
  protected indicatorQueryParams: Record<string, string> = {}
  protected collapsedGroup = false
  protected collapsedLearner = false

  // Indicateurs figés (pins enseignant) sur ce cours - indépendant des
  // préférences perso, cf. IndicatorPinsService côté backend.
  protected pinsByIndicatorId = new Map<string, IndicatorPin>()
  protected canManagePins = false
  private currentCourseId: string | null = null
  protected viewModes = [
    {
      icon: 'appstore',
      label: '',
      value: 'cards',
    },
    {
      icon: 'table',
      label: '',
      value: 'table',
    },
  ]

  protected sections: CourseSection[] = []
  protected activities: Activity[] = []

  protected filteredActivities: Activity[] = []
  protected sectionWithActivities: SectionWithActivities[] = []

  protected readonly searchbar: SearchBar<string> = {
    placeholder: `Essayez un nom d'activité, de section...`,
    filterer: {
      run: (query) => {
        const suggestions = new Set<string>([
          ...this.activities.map((activity) => activity.title),
          ...this.sections.map((section) => section.name),
        ])
        return of(
          new Fuse(Array.from(suggestions), {
            includeMatches: true,
            findAllMatches: false,
            threshold: 0.4,
          })
            .search(query)
            .map((e) => e.item)
        )
      },
    },
    onSearch: this.search.bind(this),
  }

  constructor(private readonly courseManagementTutorialService: CourseManagementTutorialService) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.presenter.contextChange.subscribe(async (context) => {
        this.context = context
        await this.refresh()
        this.checkForCourseTutorial()

        if (context.course) {
          const courseId = context.course.id
          const courseName = context.course.name

          this.currentCourseId = courseId
          this.canManagePins = context.course.permissions?.update ?? false
          this.loadCourseIndicators(courseId)

          this.courseContext = { scope: 'course', scopeId: courseId, userId: '' }
          this.indicatorQueryParams = { from: 'course', courseId, courseName }
          this.changeDetectorRef.markForCheck()
        }
      }),
      this.presenter.onDeletedActivity.subscribe((activity) => {
        this.onDeleteActivity(activity)
      })
    )
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  private loadCourseIndicators(courseId: string): void {
    this.indicatorsLoading = true
    this.subscriptions.push(
      combineLatest([
        this.indicatorService.loadIndicators(),
        this.settingsService.getSettings(),
        this.indicatorService.listPins('course', courseId),
      ]).subscribe({
        next: ([indicators, settings, pins]) => {
          this.pinsByIndicatorId = new Map(pins.map(p => [p.indicatorId, p]))

          // Union : indicateurs activés perso par l'utilisateur (il faut d'abord
          // l'activer soi-même, comme n'importe quel indicateur, pour le voir ici)
          // + indicateurs déjà figés par un enseignant sur ce cours précis (jamais
          // l'inverse - les deux sources restent indépendantes, cf.
          // IndicatorPinsService côté backend). Le bouton "Figer" n'apparaît donc
          // que sur un indicateur déjà visible, pas sur tout le catalogue.
          const byId = new Map<string, IndicatorDefinition>()
          for (const ind of indicators) {
            if (ind.contextType !== 'course') continue
            const personallyActive =
              this.roleService.canSeeIndicatorContext(ind.contextType, ind.visibilityRoles) &&
              settings.activeIndicators.includes(ind.id)
            if (personallyActive || this.pinsByIndicatorId.has(ind.id)) byId.set(ind.id, ind)
          }
          this.courseIndicators = Array.from(byId.values())

          this.groupIndicators = indicators.filter(ind =>
            ind.contextType === 'group' &&
            isCourseAware(ind.formula) &&
            this.roleService.canSeeIndicatorContext(ind.contextType, ind.visibilityRoles) &&
            settings.activeIndicators.includes(ind.id))

          const isVisiblePersonal = (ind: IndicatorDefinition) =>
            isCourseAware(ind.formula) &&
            this.roleService.canSeeIndicatorContext(ind.contextType, ind.visibilityRoles) &&
            settings.activeIndicators.includes(ind.id)
          this.learnerIndicators = indicators.filter(ind => ind.contextType === 'learner' && isVisiblePersonal(ind))
          this.teacherIndicators = indicators.filter(ind => ind.contextType === 'teacher' && isVisiblePersonal(ind))
          this.adminIndicators = indicators.filter(ind => ind.contextType === 'admin' && isVisiblePersonal(ind))
          const personalContext = (scope: 'learner' | 'teacher' | 'admin'): DashboardContext => ({
            scope, scopeId: getCurrentUserId(), userId: getCurrentUserId(), courseId,
          })
          this.learnerContext = personalContext('learner')
          this.teacherContext = personalContext('teacher')
          this.adminContext = personalContext('admin')

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
   * teacher/admin) : leur contextType n'est pas fixe (dépend de l'indicateur cliqué),
   * indicator-detail.component.ts a besoin de le recevoir explicitement plutôt que de le
   * déduire de `from` (voir la branche `course-personal`).
   */
  protected personalIndicatorQueryParams(contextType: string): Record<string, string> {
    return { ...this.indicatorQueryParams, from: 'course-personal', contextType }
  }

  protected onPinToggle(indicator: IndicatorDefinition): void {
    const courseId = this.currentCourseId
    if (!courseId) return

    const existingPin = this.pinsByIndicatorId.get(indicator.id) ?? null

    const modalRef = this.modal.create({
      nzTitle: existingPin ? `Seuils figés - "${indicator.name}"` : `Figer "${indicator.name}"`,
      nzContent: PinIndicatorModalComponent,
      nzData: { indicator, contextType: 'course', contextId: courseId, existingPin },
      nzFooter: null,
      nzWidth: 480,
    })
    modalRef.afterClose.subscribe((result) => {
      if (result) this.loadCourseIndicators(courseId)
    })
  }

  private checkForCourseTutorial(): void {
    const urlParams = new URLSearchParams(window.location.search)
    const startTutorial = urlParams.get('tutorial') === 'course-details'

    if (startTutorial && this.context.course) {
      setTimeout(() => {
        this.startCourseDetailsTutorial()
      }, 1000)
    }
  }

  protected startCourseDetailsTutorial(): void {
    if (!this.context.course) return
    this.courseManagementTutorialService.startCourseDetailsTutorial(this.context.course)
  }

  protected async addSection(after?: CourseSection): Promise<void> {
    await this.presenter.addSection({
      name: 'Section ' + (this.sections.length + 1),
      order: after ? after.order + 1 : 0,
    })
    await this.refresh()
  }

  protected async renameSection(section: CourseSection, newName: string): Promise<void> {
    await this.presenter.updateSection(section, { name: newName })
    this.sectionWithActivities = this.sectionWithActivities.map((item) => {
      if (item.section.id === section.id) {
        return {
          ...item,
          section: {
            ...item.section,
            name: newName,
          },
        }
      }
      return item
    })
    this.changeDetectorRef.markForCheck()
  }

  protected async moveUpSection(section: CourseSection): Promise<void> {
    await this.presenter.updateSection(section, { order: section.order - 1 })
    await this.refresh()
  }

  protected async moveDownSection(section: CourseSection): Promise<void> {
    await this.presenter.updateSection(section, { order: section.order + 1 })
    await this.refresh()
  }

  protected async editModeOn(section: SectionWithActivities): Promise<void> {
    section.editMode = true
    this.changeDetectorRef.markForCheck()
  }

  protected async saveSection(section: SectionWithActivities): Promise<void> {
    section.editMode = false
    await this.presenter.updateActivityOrder(section.activities.map((a) => a.id))
  }

  protected async deleteSection(section: CourseSection): Promise<void> {
    await this.presenter.deleteSection(section)
    await this.refresh()
  }

  protected trackSection(_: number, item: SectionWithActivities): string {
    return item.section.id
  }

  protected onDeleteActivity(activity: Activity): void {
    this.sectionWithActivities = this.sectionWithActivities.map((item) => {
      return {
        ...item,
        activities: item.activities.filter((a) => a.id !== activity.id),
      }
    })
    this.activities = this.activities.filter((a) => a.id !== activity.id)
    this.changeDetectorRef.markForCheck()
  }

  private async refresh(): Promise<void> {
    const [sections, activities] = await Promise.all([this.presenter.listSections(), this.presenter.listActivities()])
    this.sectionWithActivities = sections.map((section) => ({
      section,
      editMode: false,
      activities: activities
        .filter((activity) => activity.sectionId === section.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    }))

    this.sections = sections
    this.activities = activities

    this.search(this.searchbar.value)

    this.changeDetectorRef.markForCheck()
  }

  private search(query?: string): void {
    const q = query?.trim()
    if (!q) {
      this.filteredActivities = this.activities
      this.sectionWithActivities = this.sections.map((section) => ({
        section,
        editMode: false,
        activities: this.filteredActivities
          .filter((activity) => activity.sectionId === section.id)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      }))
      return
    } else {
      this.filteredActivities = this.activities.filter((activity) => {
        const section = this.sections.find((section) => section.id === activity.sectionId)
        return (
          activity.title.toLowerCase().includes(q.toLowerCase()) ||
          (section && section.name.toLowerCase().includes(q.toLowerCase()))
        )
      })
      this.sectionWithActivities = this.sections
        .map((section) => ({
          section,
          editMode: false,
          activities: this.filteredActivities
            .filter((activity) => activity.sectionId === section.id)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        }))
        .filter((item) => item.activities.length > 0)
      return
    }
  }

  protected numberOfActivities(section: CourseSection): number {
    return this.sectionWithActivities.find((item) => item.section.id === section.id)?.activities.length ?? 0
  }

  protected get flattenedActivities(): Activity[] {
    return this.sectionWithActivities.flatMap((item) => item.activities)
  }
}

interface SectionWithActivities {
  section: CourseSection
  editMode: boolean
  activities: Activity[]
}
