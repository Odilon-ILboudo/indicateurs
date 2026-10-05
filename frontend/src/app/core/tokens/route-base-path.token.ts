import { InjectionToken } from '@angular/core';

/* Préfixe des chemins de navigation absolus, pour fonctionner aussi bien en standalone (/dashboard) qu'en embarqué (racine). */
export const ROUTE_BASE_PATH = new InjectionToken<string>('ROUTE_BASE_PATH');
