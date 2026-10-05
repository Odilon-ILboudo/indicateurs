/* Fournisseurs du point d'entrée embarqué - reprend app.config.ts, MemoryLocationStrategy pour ne jamais écraser l'URL de la page hôte. */
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
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    { provide: NZ_I18N, useValue: fr_FR },
    provideNzIcons(NZ_ICONS_LIST),
    provideEchartsCore({ echarts: () => import('echarts') }),
  ],
};
