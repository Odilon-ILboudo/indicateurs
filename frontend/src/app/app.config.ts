// web/src/app/app.config.ts
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { AuthProvider } from './core/auth/auth.types';
import { MockAuthProvider } from './core/auth/mock-auth.provider';
import { provideRouter, withRouterConfig } from '@angular/router';
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
  AimOutline, ApartmentOutline, ArrowDownOutline, ArrowLeftOutline,
  BranchesOutline, CalendarOutline, CalculatorOutline, ClockCircleOutline, CodeOutline,
  CopyOutline, DashboardOutline, DatabaseOutline, DeleteOutline, DownloadOutline,
  EditOutline, ExperimentOutline, ExportOutline, EyeOutline,
  FieldNumberOutline, FilterOutline, FolderOutline,
  HistoryOutline, HolderOutline, ImportOutline, InfoCircleOutline, InfoOutline,
  LeftOutline, LineChartOutline, LinkOutline, LockOutline, LogoutOutline,
  MoreOutline, PercentageOutline, PlayCircleOutline, PlusOutline,
  QrcodeOutline, ReloadOutline, RightOutline,
  SafetyCertificateOutline, SaveOutline, ScissorOutline, SearchOutline, SettingOutline,
  TagOutline, TeamOutline, TrophyOutline,
  UserOutline, UserAddOutline, WarningOutline,
} from '@ant-design/icons-angular/icons';

// Enregistrer la locale française
registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: AuthProvider, useClass: MockAuthProvider },
    provideRouter(appRoutes, withRouterConfig({ paramsInheritanceStrategy: 'always' })),
    provideHttpClient(
      withInterceptors([indicatorInterceptor])
    ),
    provideAnimationsAsync(),
    { provide: NZ_I18N, useValue: fr_FR },
    provideNzIcons([
      AimOutline, ApartmentOutline, ArrowDownOutline, ArrowLeftOutline,
      BranchesOutline, CalendarOutline, CalculatorOutline, ClockCircleOutline, CodeOutline,
      CopyOutline, DashboardOutline, DatabaseOutline, DeleteOutline, DownloadOutline,
      EditOutline, ExperimentOutline, ExportOutline, EyeOutline,
      FieldNumberOutline, FilterOutline, FolderOutline,
      HistoryOutline, HolderOutline, ImportOutline, InfoCircleOutline, InfoOutline,
      LeftOutline, LineChartOutline, LinkOutline, LockOutline, LogoutOutline,
      MoreOutline, PercentageOutline, PlayCircleOutline, PlusOutline,
      QrcodeOutline, ReloadOutline, RightOutline,
      SafetyCertificateOutline, SaveOutline, ScissorOutline, SearchOutline, SettingOutline,
      TagOutline, TeamOutline, TrophyOutline,
      UserOutline, UserAddOutline, WarningOutline,
    ]),
    provideEchartsCore({ echarts: () => import('echarts') }),
  ]
};