import { Injectable } from '@angular/core'
import { AuthProvider, AuthToken, User } from './auth.types'

@Injectable()
export class RemoteAuthProvider extends AuthProvider {
  private cachedUser?: User

  token(): Promise<AuthToken | undefined> {
    const accessToken = localStorage.getItem('accessToken')
    const refreshToken = localStorage.getItem('refreshToken')
    if (accessToken && refreshToken) {
      return Promise.resolve({ accessToken, refreshToken })
    }
    return Promise.resolve(undefined)
  }

  async current(): Promise<User | undefined> {
    if (this.cachedUser) return this.cachedUser

    const stored = localStorage.getItem('currentUser')
    if (stored) {
      this.cachedUser = JSON.parse(stored)
      return this.cachedUser
    }

    return undefined
  }

  signIn(_username: string, _password: string): Promise<User> {
    return this.current() as Promise<User>
  }

  async signInWithToken(token: AuthToken): Promise<User> {
    localStorage.setItem('accessToken', token.accessToken)
    localStorage.setItem('refreshToken', token.refreshToken)
    this.cachedUser = undefined
    return this.current() as Promise<User>
  }

  resetPassword(_input: unknown): Promise<User> {
    return this.current() as Promise<User>
  }

  signUp(_input: unknown): Promise<never> {
    return Promise.reject(new Error('signUp non disponible'))
  }

  async signOut(): Promise<void> {
    this.cachedUser = undefined
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('currentUser')
    localStorage.removeItem('platonOrigin')
    localStorage.removeItem('userRole')
  }
}
