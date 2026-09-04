import { Injectable } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Observable, of, Subject } from 'rxjs'
import { map } from 'rxjs/operators'
import {
  Activity,
  ActivityFilters,
  Course,
  CourseFilters,
  CourseGroup,
  CourseMember,
  CourseMemberFilters,
  CourseMemberRoles,
  CourseSection,
  CreateCourseMember,
  CreateCourseSection,
  CreateTestMember,
  CourseDemo,
  FindCourse,
  UpdateCourse,
  UpdateCourseSection,
} from '../course-common'
import { API, buildParams } from './course-api.util'

@Injectable({ providedIn: 'root' })
export class CourseService {
  readonly onDeletedActivity = new Subject<Activity>()

  constructor(private readonly http: HttpClient) {}

  search(filters: CourseFilters = {}): Observable<{ resources: Course[]; total: number }> {
    return this.http.get<{ resources: Course[]; total: number }>(
      `${API}/courses`,
      { params: buildParams(filters as Record<string, unknown>) },
    )
  }

  find(query: FindCourse): Observable<Course> {
    return this.http
      .get<{ resource: Course }>(`${API}/courses/${query.id}`)
      .pipe(map((r) => r.resource))
  }

  update(_id: string, _input: UpdateCourse): Observable<Course> {
    return of({} as Course)
  }

  delete(_course: Course): Observable<void> {
    return of(undefined)
  }

  listSections(course: Course): Observable<{ resources: CourseSection[] }> {
    return this.http.get<{ resources: CourseSection[] }>(`${API}/courses/${course.id}/sections`)
  }

  createSection(_course: Course, _input: CreateCourseSection): Observable<CourseSection> {
    return of({} as CourseSection)
  }

  updateSection(_section: CourseSection, _input: UpdateCourseSection): Observable<CourseSection> {
    return of({} as CourseSection)
  }

  deleteSection(_section: CourseSection): Observable<void> {
    return of(undefined)
  }

  listActivities(course: Course, filters: ActivityFilters = {}): Observable<{ resources: Activity[] }> {
    return this.http.get<{ resources: Activity[] }>(
      `${API}/courses/${course.id}/activities`,
      { params: buildParams(filters as Record<string, unknown>) },
    )
  }

  findActivity(courseId: string, activityId: string): Observable<Activity> {
    return this.http
      .get<{ resource: Activity }>(`${API}/courses/${courseId}/activities/${activityId}`)
      .pipe(map((r) => r.resource))
  }

  updateActivity(activity: Activity, _input: Partial<Activity>): Observable<Activity> {
    return of(activity)
  }

  updateActivityOrder(_course: Course, _ids: string[]): Observable<void> {
    return of(undefined)
  }

  createMember(course: Course, input: CreateCourseMember): Observable<CourseMember> {
    return this.http.post<CourseMember>(`${API}/courses/${course.id}/members`, input)
  }

  createTestMembers(_course: Course, _input: CreateTestMember[]): Observable<{ resources: CourseMember[] }> {
    return of({ resources: [] })
  }

  deleteMember(member: CourseMember): Observable<void> {
    return this.http.delete<void>(`${API}/courses/${member.courseId}/members/${member.id}`)
  }

  updateMemberRole(member: CourseMember, role: CourseMemberRoles): Observable<CourseMember> {
    return this.http.patch<CourseMember>(`${API}/courses/${member.courseId}/members/${member.id}`, { role })
  }

  searchMembers(course: Course, filters?: CourseMemberFilters): Observable<{ resources: CourseMember[]; total: number }> {
    let params = new HttpParams()
    if (filters?.roles?.length) params = params.set('roles', filters.roles.join(','))
    else if (filters?.role) params = params.set('role', filters.role)
    if (filters?.search) params = params.set('search', filters.search)
    return this.http.get<{ resources: CourseMember[]; total: number }>(
      `${API}/courses/${course.id}/members`,
      { params },
    )
  }

  getDemo(_courseId: string): Observable<CourseDemo | null> {
    return of(null)
  }

  createDemo(_courseId: string): Observable<CourseDemo> {
    return of({} as CourseDemo)
  }

  deleteDemo(_courseId: string): Observable<void> {
    return of(undefined)
  }

  listGroups(courseId: string): Observable<{ resources: CourseGroup[] }> {
    return this.http.get<{ resources: CourseGroup[] }>(`${API}/courses/${courseId}/groups`)
  }

  addCourseGroup(_courseId: string): Observable<{ resource: CourseGroup }> {
    return of({ resource: {} as CourseGroup })
  }

  deleteGroup(_courseId: string, _groupId: string): Observable<void> {
    return of(undefined)
  }

  updateGroupName(_courseId: string, _groupId: string, _name: string): Observable<void> {
    return of(undefined)
  }

  listGroupMembers(courseId: string, groupId: string): Observable<{ resources: CourseMember[] }> {
    return this.http.get<{ resources: CourseMember[] }>(`${API}/courses/${courseId}/groups/${groupId}/members`)
  }

  addGroupMember(_courseId: string, _groupId: string, _userId: string): Observable<void> {
    return of(undefined)
  }

  deleteGroupMember(_courseId: string, _groupId: string, _userId: string): Observable<void> {
    return of(undefined)
  }
}
