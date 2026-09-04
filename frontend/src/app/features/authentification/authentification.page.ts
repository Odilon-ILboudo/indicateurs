import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'

import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'

import { firstValueFrom } from 'rxjs'
import { User, UserRoles } from '../../core/auth/auth.types'
import { environment } from '../../../environments/environment'

const PLATON_BASE_URL = environment.platonBaseUrl

@Component({
  standalone: true,
  selector: 'app-authentification',
  templateUrl: './authentification.page.html',
  styleUrls: ['./authentification.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
})
export class AuthentificationPage implements OnInit {
  private readonly router = inject(Router)
  private readonly http = inject(HttpClient)
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly cdr = inject(ChangeDetectorRef)

  protected connecting = false
  protected error = false

  /*
  Formulaire de connexion locale (compte de test créé directement en base) - jamais affiché
  en prod, voir le template (*ngIf="!isProduction"). Replié par défaut : chaque option
  (CAS / compte local) ne s'ouvre qu'au clic sur son propre bouton.
  */
  protected readonly isProduction = environment.production
  protected showLocalForm = false
  protected localUsername = ''
  protected localPassword = ''
  protected localError = ''

  protected toggleLocalForm(): void {
    this.showLocalForm = !this.showLocalForm
    this.localError = ''
  }

  async ngOnInit(): Promise<void> {
    const params = this.activatedRoute.snapshot.queryParamMap
    const accessToken = params.get('access-token')
    const refreshToken = params.get('refresh-token')
    const origin = params.get('origin')

    if (accessToken && refreshToken) {
      await this.handleCallback(accessToken, refreshToken, origin)
    }
  }

  protected redirectToPlaton(): void {
    this.error = false
    const callbackUrl = encodeURIComponent(`${location.origin}/authentification`)
    const callbackTitle = encodeURIComponent('PLaTOn Stats')
    location.href = `${PLATON_BASE_URL}/login?callbackUrl=${callbackUrl}&callbackTitle=${callbackTitle}`
  }

  protected async signInLocally(): Promise<void> {
    if (!this.localUsername.trim() || !this.localPassword) return

    this.localError = ''
    this.connecting = true
    this.cdr.markForCheck()

    try {
      const localApi = environment.platonLocalApiUrl
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; resource?: { accessToken: string; refreshToken: string }; message?: string }>(
          `${localApi}/api/v1/auth/signin`,
          { username: this.localUsername.trim(), password: this.localPassword },
        ),
      )
      if (!response.resource) {
        throw new Error(response.message ?? 'Connexion refusée')
      }
      await this.handleCallback(response.resource.accessToken, response.resource.refreshToken, localApi)
    } catch (e) {
      this.localError = 'Nom d\'utilisateur ou mot de passe incorrect.'
      this.connecting = false
      this.cdr.markForCheck()
    }
  }

  private async handleCallback(accessToken: string, refreshToken: string, origin: string | null): Promise<void> {
    this.connecting = true
    this.cdr.markForCheck()

    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]))
      const username: string = payload.sub || payload.username

      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)

      const platonBase = origin || PLATON_BASE_URL
      localStorage.setItem('platonOrigin', platonBase)

      const response = await firstValueFrom(
        this.http.get<any>(`${platonBase}/api/v1/users/${username}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      )

      const raw = response?.resource ?? response
      const user: User = {
        id: raw.id,
        username: raw.username,
        firstName: raw.firstName,
        lastName: raw.lastName,
        email: raw.email,
        role: raw.role as UserRoles,
        active: raw.active ?? true,
        createdAt: new Date(raw.createdAt),
        updatedAt: new Date(raw.updatedAt),
      }

      localStorage.setItem('currentUser', JSON.stringify(user))
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true })
    } catch (e) {
      console.error('[Authentification] Erreur lors du callback PLaTon :', e)
      this.error = true
      this.connecting = false
      this.cdr.markForCheck()
    }
  }
}
