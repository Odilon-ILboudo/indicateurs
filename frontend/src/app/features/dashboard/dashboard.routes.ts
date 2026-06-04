// web/src/app/pages/dashboard/dashboard.routes.ts
import { Routes } from '@angular/router';
import { DashboardPage } from './dashboard.page';
import { IndicatorDetailComponent } from '../../shared/ui';
import { OverviewPage } from './pages/overview/overview.page';
import { IndicatorsPage } from './pages/indicators/indicators.page';

export default [
  {
    path: '',
    component: DashboardPage,
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', component: OverviewPage, data: { title: 'Tableau de bord' } },
      { path: 'indicators', component: IndicatorsPage, data: { title: 'Indicateurs' } },
      { 
        path: 'indicator/:id', 
        component: IndicatorDetailComponent, 
        data: { title: 'Détail indicateur' } 
      },
    ],
  },
] as Routes;