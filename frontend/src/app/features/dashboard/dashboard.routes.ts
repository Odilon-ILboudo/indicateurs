// web/src/app/pages/dashboard/dashboard.routes.ts
import { Routes } from '@angular/router';
import { DashboardPage } from './dashboard.page';
import { IndicatorDetailComponent } from '../../shared/ui';
import { OverviewPage } from './pages/overview/overview.page';
import { IndicatorsPage } from './pages/indicators/indicators.page';
import { FamilyIndicatorsPage } from './pages/indicators/family-indicators.page';
import { SelectorFamilyIndicatorsPage } from './pages/indicators/selector-family-indicators.page';
import { EmbedTestPage } from './pages/embed-test/embed-test.page';

export default [
  {
    path: '',
    component: DashboardPage,
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', component: OverviewPage, data: { title: 'Tableau de bord' } },
      { path: 'indicators', component: IndicatorsPage, data: { title: 'Indicateurs' } },
      {
        path: 'indicators/family/:name',
        component: FamilyIndicatorsPage,
        data: { title: 'Famille d\'indicateurs' },
      },
      {
        path: 'indicators/selector-family/:name',
        component: SelectorFamilyIndicatorsPage,
        data: { title: 'Famille d\'indicateurs' },
      },
      {
        path: 'indicator/:id',
        component: IndicatorDetailComponent,
        data: { title: 'Détail indicateur' }
      },
      {
        // Diagnostic uniquement, jamais lié dans la navigation - voir embed-test.page.ts.
        path: 'embed-test',
        component: EmbedTestPage,
        data: { title: 'Diagnostic - Web Component embarqué' },
      },
      {
        path: 'courses',
        loadChildren: () => import('../../features/courses/courses.routes'),
      },
      {
        path: 'resources',
        loadChildren: () => import('../../features/resources/resources.routes'),
      },
    ],
  },
] as Routes;