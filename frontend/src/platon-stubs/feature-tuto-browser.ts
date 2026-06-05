// Stub: @platon/feature/tuto/browser
import { Injectable } from '@angular/core'
import { User } from './core-common'
import { Course } from './course-common'
import { Resource } from './resource-common'

@Injectable({ providedIn: 'root' })
export class CourseManagementTutorialService {
  startCourseManagementTutorial(_user: User, _courses: Course[]): void { /* stub */ }
  startCourseDetailsTutorial(_course: Course): void { /* stub */ }
}

@Injectable({ providedIn: 'root' })
export class SidebarTutorialService {
  start(_user: User): void { /* stub */ }
}

@Injectable({ providedIn: 'root' })
export class ResourcesTutorialService {
  private _fromTutorial = false

  startResourcesTutorial(
    _user: User,
    _resources: Resource[],
    _hasSearched: () => boolean,
    _doSearch: (query: string) => void
  ): void { /* stub */ }

  getIsFromTutorial(): boolean {
    return this._fromTutorial
  }

  resetTutorialFlag(): void {
    this._fromTutorial = false
  }
}

@Injectable({ providedIn: 'root' })
export class ResourcePageTutorialService {
  startResourcePageTutorial(
    _resource: Resource,
    _a: boolean,
    _b: boolean,
    _c: boolean
  ): void { /* stub */ }
}
