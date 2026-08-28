import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http'
import { inject } from '@angular/core'
import { Router } from '@angular/router'
import { catchError, throwError } from 'rxjs'
import { environment } from '../../../environments/environment'
import { EMBEDDED_MODE } from '../tokens/embedded-mode.token'

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const accessToken = localStorage.getItem('accessToken')
  const authorizedReq = accessToken
    ? req.clone({ headers: req.headers.set('Authorization', `Bearer ${accessToken}`) })
    : req

  const router = inject(Router, { optional: true })
  const embedded = inject(EMBEDDED_MODE, { optional: true }) ?? false

  return next(authorizedReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && req.url.startsWith(environment.apiUrl)) {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('currentUser')
        localStorage.removeItem('userRole')
        localStorage.removeItem('platonOrigin')

        if (embedded) {
          // Pas d'écran de connexion à soi dans l'embarqué : on prévient l'hôte (PLaTon) via un
          // évènement DOM, jamais une navigation interne (voir docs/integration-platon.md §5).
          document.querySelector('indicateurs-app')
            ?.dispatchEvent(new CustomEvent('indicateurs-token-expired', { bubbles: true }))
        } else {
          router?.navigateByUrl('/authentification')
        }
      }
      return throwError(() => error)
    }),
  )
}
