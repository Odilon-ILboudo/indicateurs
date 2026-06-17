import { Injectable, OnDestroy } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { CourseService } from '@platon/feature/course/browser'
import { Activity, Course } from '@platon/feature/course/common'
import { ActivityResults, ResultService } from '@platon/feature/result/browser'
import { LayoutState, layoutStateFromError } from '@platon/shared/ui'
import { BehaviorSubject, Subject, firstValueFrom } from 'rxjs'

export interface ActivityContext {
  state: LayoutState
  course?: Course
  activity?: Activity
  results?: ActivityResults
}

@Injectable()
export class ActivityPresenter implements OnDestroy {
  private readonly context = new BehaviorSubject<ActivityContext>(this.defaultContext())

  readonly contextChange = this.context.asObservable()
  readonly onDeletedActivity = new Subject<void>()

  constructor(
    private readonly resultService: ResultService,
    private readonly courseService: CourseService,
    private readonly activatedRoute: ActivatedRoute,
  ) {
    const courseId = this.findParam('id')
    const activityId = this.findParam('activityId')
    this.onChangeRoute(courseId as string, activityId as string).catch(console.error)
  }

  ngOnDestroy(): void {
    // nothing to unsubscribe
  }

  defaultContext(): ActivityContext {
    return { state: 'LOADING' }
  }

  private findParam(name: string): string | null {
    let route: ActivatedRoute | null = this.activatedRoute
    while (route) {
      const value = route.snapshot.paramMap.get(name)
      if (value) return value
      route = route.parent
    }
    return null
  }

  private async refresh(courseId: string, activityId: string): Promise<void> {
    const fakeCourse = { id: courseId } as import('@platon/feature/course/common').Course
    const [course, activitiesResp, results] = await Promise.all([
      firstValueFrom(this.courseService.find({ id: courseId })),
      firstValueFrom(this.courseService.listActivities(fakeCourse)),
      firstValueFrom(this.resultService.activityResults(activityId)),
    ])

    // listActivities retourne progression et exerciseCount, contrairement à findActivity
    const activity = activitiesResp.resources.find(a => a.id === activityId)
    if (!activity) throw new Error(`Activité ${activityId} introuvable dans le cours ${courseId}`)

    this.context.next({ state: 'READY', course, activity, results })
  }

  private async onChangeRoute(courseId: string, activityId: string): Promise<void> {
    try {
      await this.refresh(courseId, activityId)
    } catch (error) {
      this.context.next({ state: layoutStateFromError(error) })
    }
  }
}
