import { Route } from '@angular/router'

export const appRoutes: Route[] = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
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
