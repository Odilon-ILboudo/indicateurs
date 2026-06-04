import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { environment } from '../../../environments/environment'
import { AuthProvider, AuthToken, User, UserRoles } from './auth.types'

@Injectable()
export class MockAuthProvider extends AuthProvider {
  private cachedUser?: User

  private readonly fakeToken: AuthToken = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  }

  constructor(private readonly http: HttpClient) {
    super()
  }

  token(): Promise<AuthToken | undefined> {
    return Promise.resolve(this.fakeToken)
  }

  async current(): Promise<User | undefined> {
    if (this.cachedUser) return this.cachedUser

    try {
      const response = await firstValueFrom(
        this.http.get<{ success: boolean; data: { id: string; username: string; firstName: string; lastName: string; role: string; email: string } }>(
          `${environment.apiUrl}/users/${environment.defaultUserId}`
        )
      )

      if (response?.success && response.data) {
        const u = response.data
        this.cachedUser = {
          id: u.id,
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          role: u.role as UserRoles,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        return this.cachedUser
      }
    } catch {
      console.warn('[MockAuthProvider] API indicateurs indisponible, fallback teacher utilisé.')
    }

    this.cachedUser = {
      id: environment.defaultUserId ?? 'fallback-id',
      username: 'fallback-user',
      active: true,
      role: UserRoles.teacher,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    return this.cachedUser
  }

  signIn(_username: string, _password: string): Promise<User> {
    return this.current() as Promise<User>
  }

  signInWithToken(_token: AuthToken): Promise<User> {
    return this.current() as Promise<User>
  }

  resetPassword(_input: unknown): Promise<User> {
    return this.current() as Promise<User>
  }

  signUp(_input: unknown): Promise<never> {
    return Promise.reject(new Error('signUp not available in mock'))
  }

  signOut(): Promise<void> {
    this.cachedUser = undefined
    return Promise.resolve()
  }
}
