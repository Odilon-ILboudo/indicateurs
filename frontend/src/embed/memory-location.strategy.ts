import { Injectable } from '@angular/core';
import { LocationChangeEvent, LocationChangeListener, LocationStrategy } from '@angular/common';

/**
 * LocationStrategy purement interne, qui n'écrit jamais dans window.location/history.
 *
 * Nécessaire pour le build embarqué : withHashLocation() (comme toute stratégie standard,
 * Hash ou Path) écrit dans window.location - le même objet URL que le routeur de la page hôte
 * (PLaTon, qui a sa propre URL réelle). Confirmé en testant `<indicateurs-app>` à l'intérieur
 * d'une vraie app Angular (pas juste une page HTML statique) : dès l'initialisation du widget,
 * son router écrasait silencieusement l'URL de l'app hôte (ex. `/dashboard/embed-test` devenait
 * `/#/overview`) - aucune erreur, juste une navigation hôte perdue.
 *
 * Contrepartie assumée : pas de deep-link direct vers une vue précise du widget depuis
 * l'extérieur, pas de bouton précédent/suivant du NAVIGATEUR pour naviguer dans le widget
 * (uniquement back()/forward() internes, jamais déclenchés par l'utilisateur ici puisque rien
 * n'expose de bouton pour ça côté widget). PLaTon garde entièrement la main sur l'URL visible.
 */
@Injectable()
export class MemoryLocationStrategy extends LocationStrategy {
  private stack: string[] = [''];
  private states: unknown[] = [null];
  private index = 0;
  private listeners: LocationChangeListener[] = [];

  path(_includeHash = false): string {
    return this.stack[this.index];
  }

  prepareExternalUrl(internal: string): string {
    return internal;
  }

  getState(): unknown {
    return this.states[this.index];
  }

  pushState(state: unknown, _title: string, url: string, queryParams: string): void {
    const full = url + (queryParams ? '?' + queryParams : '');
    this.stack = this.stack.slice(0, this.index + 1);
    this.states = this.states.slice(0, this.index + 1);
    this.stack.push(full);
    this.states.push(state);
    this.index++;
  }

  replaceState(state: unknown, _title: string, url: string, queryParams: string): void {
    this.stack[this.index] = url + (queryParams ? '?' + queryParams : '');
    this.states[this.index] = state;
  }

  forward(): void {
    if (this.index < this.stack.length - 1) {
      this.index++;
      this.emitPopState();
    }
  }

  back(): void {
    if (this.index > 0) {
      this.index--;
      this.emitPopState();
    }
  }

  onPopState(fn: LocationChangeListener): void {
    this.listeners.push(fn);
  }

  getBaseHref(): string {
    return '';
  }

  private emitPopState(): void {
    const event: LocationChangeEvent = { type: 'popstate', state: this.states[this.index] };
    this.listeners.forEach(fn => fn(event));
  }
}
