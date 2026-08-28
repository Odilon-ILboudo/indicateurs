// Routes du point d'entrée embarqué - reprises de dashboard.routes.ts, sans admin ni
// cours/ressources (hors périmètre, voir docs/integration-indicateurs.md §2).
//
// 'indicators/family/:name' (FamilyIndicatorsPage) est volontairement absent : trouvé en
// testant que cette page enveloppe directement AdminIndicatorManagerComponent, sans la moindre
// vérification de rôle - une page d'admin déguisée en page de famille, jamais liée depuis un
// composant utilisateur (seul admin-indicator-manager.component.ts s'y réfère, dans son propre
// commentaire). Seule 'indicators/selector-family/:name' (SelectorFamilyIndicatorsPage, qui
// enveloppe IndicatorSelectorComponent - le vrai composant de sélection utilisateur) reste ici.
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
    // Atteinte depuis une page native PLaTon (cours/activité) via des query params - voir
    // docs/integration-platon.md §6 et context-indicators.page.ts.
    path: 'context',
    component: ContextIndicatorsPage,
    data: { title: 'Indicateurs du contexte' },
  },
];
