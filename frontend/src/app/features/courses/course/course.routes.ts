import { Routes } from '@angular/router'
import { CoursePage } from './course.page'

export default [
  {
    path: 'activities/:activityId',
    loadChildren: () => import('./activity/activity.routes'),
  },
  {
    path: '',
    component: CoursePage,
    children: [
      {
        path: 'dashboard',
        loadChildren: () => import('./dashboard/dashboard.routes'),
      },
      {
        path: 'challenges',
        loadChildren: () => import('./challenges/challenges.routes'),
      },
      {
        path: 'teachers',
        loadChildren: () => import('./teachers/teachers.routes'),
      },
      {
        path: 'students',
        loadChildren: () => import('./students/students.routes'),
      },
      {
        path: 'members',
        loadChildren: () => import('./members/members.routes'),
      },
      {
        path: 'groups',
        loadChildren: () => import('./groups/groups.routes'),
      },
      {
        path: 'my-stats',
        loadChildren: () => import('./my-stats/my-stats.routes'),
      },
      {
        path: 'settings',
        loadChildren: () => import('./settings/settings.routes'),
      },
      { path: '**', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
] as Routes
