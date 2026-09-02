import { Route } from '@angular/router'
import { authGuard } from './core/guards/auth.guard'

export const appRoutes: Route[] = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'authentification',
    loadChildren: () => import('./features/authentification/authentification.routes'),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadChildren: () => import('./features/dashboard/dashboard.routes'),
  },
]
