import { InjectionToken } from '@angular/core';

/**
 * Fourni uniquement par le point d'entrée embarqué (src/main-embed.ts). Sa seule présence
 * dans l'injecteur signale qu'on tourne comme <indicateurs-app> à l'intérieur de PLaTon, pas
 * dans l'application autonome - utilisé pour adapter les comportements qui n'ont pas de sens
 * en mode embarqué (ex. rediriger vers /authentification sur un jeton expiré).
 */
export const EMBEDDED_MODE = new InjectionToken<boolean>('EMBEDDED_MODE');
