// Routes du point d'entrée embarqué - reprises de dashboard.routes.ts, sans admin ni
// cours/ressources. 'indicators/family/:name' est volontairement absent : cette page enveloppe
// directement le composant d'administration, sans vérification de rôle.
import { Routes } from '@angular/router';
import { IndicatorDetailComponent } from '../app/shared/ui';
import { OverviewPage } from '../app/features/dashboard/pages/overview/overview.page';
import { IndicatorsPage } from '../app/features/dashboard/pages/indicators/indicators.page';
import { SelectorFamilyIndicatorsPage } from '../app/features/dashboard/pages/indicators/selector-family-indicators.page';
import { ContextIndicatorsPage } from '../app/features/dashboard/pages/context-indicators/context-indicators.page';

export const embedRoutes: Routes = [
  { path: '', redirectTo: 'overview', pathMatch: 'full' },
  { path: 'overview', component: OverviewPage, data: { title: 'Tableau de bord' } },
  { path: 'indicators', component: IndicatorsPage, data: { title: 'Indicateurs' } },
  {
    path: 'indicators/selector-family/:name',
    component: SelectorFamilyIndicatorsPage,
    data: { title: 'Famille d\'indicateurs' },
  },
  {
    path: 'indicator/:id',
    component: IndicatorDetailComponent,
    data: { title: 'Détail indicateur' },
  },
  {
    // Atteinte depuis une page native PLaTon (cours/activité) via des query params.
    path: 'context',
    component: ContextIndicatorsPage,
    data: { title: 'Indicateurs du contexte' },
  },
];
