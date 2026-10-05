import { InjectionToken } from '@angular/core';

/* Fourni uniquement par le point d'entrée embarqué, pour adapter les comportements sans sens en mode embarqué. */
export const EMBEDDED_MODE = new InjectionToken<boolean>('EMBEDDED_MODE');