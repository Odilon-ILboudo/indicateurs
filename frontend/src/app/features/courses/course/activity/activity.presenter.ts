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
    console.log('[ActivityPresenter] constructor — courseId:', courseId, 'activityId:', activityId) // TODO: remove debug
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
    console.log('[ActivityPresenter] refresh — calling 3 APIs')
    const [course, activity, results] = await Promise.all([
      firstValueFrom(this.courseService.find({ id: courseId })).then(r => { console.log('[ActivityPresenter] course OK', r); return r }),
      firstValueFrom(this.courseService.findActivity(courseId, activityId)).then(r => { console.log('[ActivityPresenter] activity OK', r); return r }),
      firstValueFrom(this.resultService.activityResults(activityId)).then(r => { console.log('[ActivityPresenter] results OK', r); return r }),
    ])

    console.log('[ActivityPresenter] all done → READY')
    this.context.next({ state: 'READY', course, activity, results })
  }

  private async onChangeRoute(courseId: string, activityId: string): Promise<void> {
    try {
      await this.refresh(courseId, activityId)
    } catch (error) {
      console.error('[ActivityPresenter] ERROR →', error)
      this.context.next({ state: layoutStateFromError(error) })
    }
  }
}
