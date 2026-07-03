import { inject } from '@angular/core'
import { CanActivateFn, Router } from '@angular/router'

export const authGuard: CanActivateFn = () => {
  const token = localStorage.getItem('accessToken')
  if (token) return true
  return inject(Router).createUrlTree(['/authentification'])
}
