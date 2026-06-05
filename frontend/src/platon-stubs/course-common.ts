// Stub: @platon/feature/course/common
import { ExpandableModel, OrderingDirections } from './core-common'

export type CourseExpandableFields = 'permissions' | 'statistic'

export enum CourseOrderings {
  NAME = 'NAME',
  CREATED_AT = 'CREATED_AT',
  UPDATED_AT = 'UPDATED_AT',
}

export interface CoursePermissions {
  readonly update?: boolean
  readonly delete?: boolean
}

export interface CourseStatistic {
  readonly progression?: number
  readonly timeSpent?: number
  readonly teacherCount?: number
  readonly studentCount?: number
  readonly activityCount?: number
  readonly challengeCount?: number
}

export interface Course {
  readonly id: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly name: string
  readonly desc?: string
  readonly ownerId: string
  readonly ownerName?: string
  readonly isTest: boolean
  readonly statistic?: CourseStatistic
  readonly permissions?: CoursePermissions
}

export interface FindCourse extends ExpandableModel<CourseExpandableFields> {
  readonly id: string
}

export interface CreateCourse extends ExpandableModel<CourseExpandableFields> {
  readonly name: string
  readonly code?: string
  readonly desc?: string
  readonly isTest?: boolean
}

export interface UpdateCourse extends ExpandableModel<CourseExpandableFields> {
  readonly name?: string
  readonly desc?: string
}

export interface CourseFilters extends ExpandableModel<CourseExpandableFields> {
  readonly search?: string
  readonly members?: string[]
  readonly period?: number
  readonly offset?: number
  readonly limit?: number
  readonly order?: CourseOrderings
  readonly direction?: OrderingDirections
  readonly showAll?: boolean
  readonly isTest?: boolean
}

export const COURSE_ORDERING_DIRECTIONS: Readonly<Record<CourseOrderings, keyof typeof OrderingDirections>> = {
  NAME: 'ASC',
  CREATED_AT: 'DESC',
  UPDATED_AT: 'DESC',
}

export interface CourseSection {
  readonly id: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly name: string
  readonly order: number
  readonly courseId: string
}

export interface CreateCourseSection {
  readonly name: string
  readonly order: number
}

export interface UpdateCourseSection {
  readonly name?: string
  readonly order?: number
}

export type ActivityOpenStates = 'opened' | 'closed' | 'planned'

export interface ActivityPermissions {
  readonly answer?: boolean
  readonly viewResource?: boolean
  readonly update?: boolean
  readonly viewStats?: boolean
}

export interface Activity {
  readonly id: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly courseId: string
  readonly sectionId: string
  readonly openAt?: Date | null
  readonly closeAt?: Date | null
  readonly isChallenge: boolean
  readonly isPeerComparison: boolean
  readonly order?: number
  readonly title: string
  readonly resourceId: string
  readonly exerciseCount: number
  readonly state: ActivityOpenStates
  readonly timeSpent: number
  readonly progression: number
  readonly permissions: ActivityPermissions
  readonly colorHue?: number
  readonly activitySettings?: unknown
}

export interface ActivityFilters {
  readonly sectionId?: string | null
  readonly challenge?: boolean | null
}

export enum CourseMemberRoles {
  teacher = 'teacher',
  student = 'student',
}

export interface CourseMember {
  readonly id: string
  readonly courseId: string
  readonly userId?: string
  readonly role: CourseMemberRoles
  readonly user?: { id: string; username: string }
  readonly group?: { id: string; name: string }
  readonly createdAt: Date
}

export interface CourseMemberFilters {
  readonly role?: CourseMemberRoles
  readonly roles?: CourseMemberRoles[]
  readonly search?: string
  readonly limit?: number
  readonly offset?: number
}

export interface CreateCourseMember {
  readonly userId: string
  readonly role: CourseMemberRoles
}

export interface CreateTestMember {
  readonly username: string
  readonly role: CourseMemberRoles
}

export interface CourseDemo {
  readonly id: string
  readonly courseId: string
  readonly url: string
}

export interface CourseGroup {
  readonly groupId: string
  readonly courseId: string
  readonly name: string
}

export interface CourseGroupDetail {
  courseGroup: CourseGroup
  members: CourseMember[]
}
