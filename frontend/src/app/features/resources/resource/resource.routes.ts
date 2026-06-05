import { Routes } from '@angular/router'
import { ResourcePage } from './resource.page'

export default [
  {
    path: '',
    component: ResourcePage,
    children: [
      {
        path: 'overview',
        loadChildren: () => import('./overview/overview.routes'),
      },
      {
        path: 'browse',
        loadChildren: () => import('./browse/browse.routes'),
      },
      {
        path: 'events',
        loadChildren: () => import('./events/events.routes'),
      },
      {
        path: 'settings',
        loadChildren: () => import('./settings/settings.routes'),
      },
      { path: '**', pathMatch: 'full', redirectTo: 'overview' },
    ],
  },
] as Routes
