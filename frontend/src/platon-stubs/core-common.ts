// Stub: @platon/core/common

export enum UserRoles {
  admin = 'admin',
  teacher = 'teacher',
  student = 'student',
}

export interface User {
  readonly id: string
  readonly username: string
  readonly firstName?: string
  readonly lastName?: string
  readonly role: string
  readonly email: string
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

export enum OrderingDirections {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum UserOrderings {
  NAME = 'NAME',
  CREATED_AT = 'CREATED_AT',
  UPDATED_AT = 'UPDATED_AT',
}

export const DEFAULT_SEARCH_BAR_LIMIT = 5

export interface UserFilters {
  readonly roles?: (UserRoles | keyof typeof UserRoles)[]
  readonly search?: string
  readonly active?: boolean
  readonly groups?: string[]
  readonly lmses?: string[]
  readonly offset?: number
  readonly limit?: number
  readonly order?: UserOrderings | keyof typeof UserOrderings
  readonly direction?: OrderingDirections | keyof typeof OrderingDirections
}

export interface UserGroupFilters {
  readonly search?: string
  readonly offset?: number
  readonly limit?: number
}

export interface ListResponse<T> {
  resources: T[]
  total: number
}

export interface Topic {
  readonly id: string
  readonly name: string
}

export interface Level {
  readonly id: string
  readonly name: string
}

export interface ExpandableModel<T extends string> {
  expands?: T[]
}

export const HTTP_STATUS_CODE = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
}

export function isTeacherRole(role: string): boolean {
  return role === UserRoles.teacher || role === UserRoles.admin
}

export function uniquifyBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set()
  return array.filter((item) => {
    const k = item[key]
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export interface UserGroup {
  readonly id: string
  readonly name: string
  readonly users: User[]
}
