import { Routes } from '@angular/router'
import { CoursesPage } from './courses.page'

export default [
  {
    title: 'PLaTon - Cours',
    path: '',
    component: CoursesPage,
  },
  {
    path: ':id',
    loadChildren: () => import('./course/course.routes'),
  },
] as Routes
