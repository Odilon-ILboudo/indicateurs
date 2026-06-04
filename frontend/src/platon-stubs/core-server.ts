import type { User } from '../app/core/auth/auth.types'

export interface UserDTO extends User {
  readonly username: string
  readonly active: boolean
  readonly firstName?: string
  readonly lastName?: string
  readonly email?: string
  readonly lastLogin?: Date
  readonly firstLogin?: Date
  readonly password?: string
  readonly hasPassword?: boolean
}

export interface UpdateUserDTO {
  readonly firstName?: string
  readonly lastName?: string
  readonly email?: string
  readonly active?: boolean
}
