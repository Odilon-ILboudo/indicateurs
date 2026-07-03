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
  // Routes platon temporairement désactivées (double instance Angular)
  // {
  //   path: 'courses',
  //   loadChildren: () => import('../../../../platon/apps/web/src/app/pages/courses/courses.routes'),
  // },
  // {
  //   path: 'activities',
  //   loadChildren: () => import('../../../../platon/apps/web/src/app/pages/activities/activities.routes'),
  // },
]
