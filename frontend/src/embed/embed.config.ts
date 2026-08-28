// Fournisseurs du point d'entrée embarqué - reprend app.config.ts en retirant
// provideZoneChangeDetection (zone.js reste dans les polyfills, mais explicitement fourni via
// polyfills plutôt que ce provider).
//
// provideAnimationsAsync() EST repris, contrairement à ce que le premier jet de la doc mettait
// en question : ng-zorro en dépend en interne (NzSelectComponent notamment, erreur NG05105
// "Unexpected synthetic property @.disabled" sans lui) - pas optionnel.
//
// AuthProvider -> RemoteAuthProvider EST repris, contrairement à ce que le premier jet de la
// doc supposait : DashboardSettingsService en dépend directement (constaté à l'implémentation,
// erreur NullInjectorError sans lui). RemoteAuthProvider reste sûr à réutiliser tel quel en
// mode embarqué - il ne fait que lire le localStorage déjà rempli par EmbedRootComponent, il ne
// déclenche jamais de redirection lui-même (ça, c'est authentification.page.ts, jamais chargé ici).
//
// LocationStrategy -> MemoryLocationStrategy (pas withHashLocation()) : constaté en testant
// <indicateurs-app> à l'intérieur d'une vraie app Angular (pas juste test-host.html, une page
// statique sans routeur) que withHashLocation() écrit dans window.location et écrase
// silencieusement l'URL de la page hôte dès l'initialisation du widget. PLaTon a sa propre URL
// réelle à préserver - voir memory-location.strategy.ts pour le détail et la contrepartie
// assumée (pas de deep-link direct vers une vue précise du widget).
import { ApplicationConfig } from '@angular/core';
import { LocationStrategy } from '@angular/common';
import { provideRouter, withRouterConfig } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { NZ_I18N, fr_FR } from 'ng-zorro-antd/i18n';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { provideEchartsCore } from 'ngx-echarts';

import { authInterceptor } from '../app/core/interceptors/auth.interceptor';
import { indicatorInterceptor } from '../app/core/interceptors/indicator.interceptor';
import { EMBEDDED_MODE } from '../app/core/tokens/embedded-mode.token';
import { ROUTE_BASE_PATH } from '../app/core/tokens/route-base-path.token';
import { NZ_ICONS_LIST } from '../app/shared/nz-icons';
import { AuthProvider } from '../app/core/auth/auth.types';
import { RemoteAuthProvider } from '../app/core/auth/remote-auth.provider';
import { MemoryLocationStrategy } from './memory-location.strategy';
import { embedRoutes } from './embed.routes';

registerLocaleData(localeFr);

export const embedConfig: ApplicationConfig = {
  providers: [
    { provide: EMBEDDED_MODE, useValue: true },
    { provide: ROUTE_BASE_PATH, useValue: '' }, // routes montées à la racine, pas sous /dashboard
    { provide: AuthProvider, useClass: RemoteAuthProvider },
    { provide: LocationStrategy, useClass: MemoryLocationStrategy },
    provideRouter(embedRoutes, withRouterConfig({ paramsInheritanceStrategy: 'always' })),
    provideHttpClient(withInterceptors([authInterceptor, indicatorInterceptor])),
    provideAnimationsAsync(),
    { provide: NZ_I18N, useValue: fr_FR },
    provideNzIcons(NZ_ICONS_LIST),
    provideEchartsCore({ echarts: () => import('echarts') }),
  ],
};
