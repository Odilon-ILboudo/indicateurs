import { Routes } from '@angular/router'
import ResourcesPage from './resources.page'

export default [
  {
    title: 'Indicateurs - Espace de travail',
    path: '',
    component: ResourcesPage,
  },
  {
    path: ':id',
    loadChildren: () => import('./resource/resource.routes'),
  },
] as Routes
