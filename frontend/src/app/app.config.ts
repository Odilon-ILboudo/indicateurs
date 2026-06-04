// web/src/app/app.config.ts
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { AuthProvider } from './core/auth/auth.types';
import { MockAuthProvider } from './core/auth/mock-auth.provider';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { indicatorInterceptor } from './core/interceptors/indicator.interceptor';
import { appRoutes } from './app.routes';

// Imports pour la localisation Ng-Zorro
import { NZ_I18N, fr_FR } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';

// Icônes Ng-Zorro utilisées dans l'application
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { provideEchartsCore } from 'ngx-echarts';
import {
  AimOutline, ApartmentOutline, ArrowDownOutline,
  CalculatorOutline, CodeOutline, DatabaseOutline,
  DeleteOutline, ExperimentOutline, EyeOutline,
  FieldNumberOutline, FilterOutline, HolderOutline,
  InfoCircleOutline, LeftOutline, PercentageOutline,
  PlusOutline, ReloadOutline, RightOutline,
  SaveOutline, ScissorOutline, WarningOutline,
} from '@ant-design/icons-angular/icons';

// Enregistrer la locale française
registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: AuthProvider, useClass: MockAuthProvider },
    provideRouter(appRoutes),
    provideHttpClient(
      withInterceptors([indicatorInterceptor])
    ),
    provideAnimationsAsync(),
    { provide: NZ_I18N, useValue: fr_FR },
    provideNzIcons([
      AimOutline, ApartmentOutline, ArrowDownOutline,
      CalculatorOutline, CodeOutline, DatabaseOutline,
      DeleteOutline, ExperimentOutline, EyeOutline,
      FieldNumberOutline, FilterOutline, HolderOutline,
      InfoCircleOutline, LeftOutline, PercentageOutline,
      PlusOutline, ReloadOutline, RightOutline,
      SaveOutline, ScissorOutline, WarningOutline,
    ]),
    provideEchartsCore({ echarts: () => import('echarts') }),
  ]
};