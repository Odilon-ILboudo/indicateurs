export interface AuthToken {
  accessToken: string
  refreshToken: string
}

export enum UserRoles {
  admin = 'admin',
  teacher = 'teacher',
  student = 'student',
  demo = 'demo',
}

export interface User {
  id: string
  username: string
  firstName?: string
  lastName?: string
  email?: string
  role: UserRoles
  active: boolean
  createdAt: Date
  updatedAt: Date
}

export abstract class AuthProvider {
  abstract token(): Promise<AuthToken | undefined>
  abstract current(): Promise<User | undefined>
  abstract signIn(username: string, password: string): Promise<User>
  abstract signInWithToken(token: AuthToken): Promise<User>
  abstract resetPassword(input: unknown): Promise<User>
  abstract signUp(input: unknown): Promise<never>
  abstract signOut(): Promise<void>
}
