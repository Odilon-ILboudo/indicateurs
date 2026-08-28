import { InjectionToken } from '@angular/core';

/**
 * Préfixe à ajouter devant les chemins de navigation absolus qui doivent fonctionner à la fois
 * dans l'app standalone (montée sous /dashboard) et dans le point d'entrée embarqué (monté à la
 * racine de son propre routeur en hash). Trouvé en testant : indicator-selector.component.ts
 * naviguait vers des chemins absolus codés en dur ('/dashboard/indicators/...'), qui n'existent
 * pas dans les routes réduites de l'embarqué (erreur NG04002).
 */
export const ROUTE_BASE_PATH = new InjectionToken<string>('ROUTE_BASE_PATH');
