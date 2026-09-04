import { InjectionToken } from '@angular/core';

/*
Préfixe à ajouter devant les chemins de navigation absolus, pour qu'ils fonctionnent à la
fois dans l'app standalone (montée sous /dashboard) et dans le point d'entrée embarqué
(monté à la racine de son propre routeur).
*/
export const ROUTE_BASE_PATH = new InjectionToken<string>('ROUTE_BASE_PATH');
