// Point d'entrée du build embarqué (cible Angular CLI "indicateurs-embed").
// Enregistre <indicateurs-app> comme élément personnalisé - voir docs/integration-indicateurs.md.
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { embedConfig } from './embed/embed.config';
import { EmbedRootComponent } from './embed/embed-root.component';

createApplication(embedConfig)
  .then((appRef) => {
    const element = createCustomElement(EmbedRootComponent, { injector: appRef.injector });
    customElements.define('indicateurs-app', element);
  })
  .catch((err) => console.error('[indicateurs-embed] bootstrap error', err));
