import { AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

/*
Page de diagnostic, non liée dans la navigation (URL directe /dashboard/embed-test) : monte
<indicateurs-app> à l'intérieur de cette app standalone, pour vérifier la coexistence de deux
apps Angular sur une seule page. Avant de tester : `ng build indicateurs-embed` et copier son
dist/indicateurs-embed/browser/* dans dist/indicateurs/browser/embed-assets/.
*/
@Component({
  standalone: true,
  selector: 'app-embed-test',
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="embed-test-banner">
      Page de diagnostic - héberge &lt;indicateurs-app&gt; (build embarqué) à l'intérieur de
      cette même app Angular standalone, pour valider la coexistence des deux apps sur une
      seule page avant intégration réelle dans PLaTon.
    </div>
    <div *ngIf="loadError" class="embed-test-error">{{ loadError }}</div>
    <indicateurs-app #embedEl [attr.access-token]="accessToken"></indicateurs-app>
  `,
  styles: [`
    .embed-test-banner { background:#1b365d; color:white; padding:16px; font-family:sans-serif; margin-bottom:16px; }
    .embed-test-error { background:#fff1f0; color:#a8071a; padding:12px 16px; margin-bottom:16px; border:1px solid #ffa39e; border-radius:4px; font-family:sans-serif; }
  `],
})
export class EmbedTestPage implements OnInit, AfterViewInit {
  @ViewChild('embedEl') embedEl?: ElementRef<HTMLElement & { user?: string }>;

  protected accessToken = localStorage.getItem('accessToken') ?? '';
  protected loadError = '';

  ngOnInit(): void {
    if (!this.accessToken) {
      this.loadError = 'Aucun accessToken en localStorage - connectez-vous d\'abord dans cette app standalone.';
    }
    this.loadEmbedAssets();
  }

  ngAfterViewInit(): void {
    // Transmet le même utilisateur que la session standalone en cours
    const currentUser = localStorage.getItem('currentUser');
    if (this.embedEl?.nativeElement && currentUser) {
      this.embedEl.nativeElement.user = currentUser;
    }
  }

  private loadEmbedAssets(): void {
    const base = '/embed-assets';

    if (document.querySelector(`link[href="${base}/styles.css"]`)) {
      return; // déjà injecté (navigation aller-retour sur cette page)
    }

    for (const href of ['styles.css', 'styles.ng-zorro.light.css', 'styles.material.light.css']) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${base}/${href}`;
      document.head.appendChild(link);
    }

    for (const src of ['polyfills.js', 'main.js']) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = `${base}/${src}`;
      script.onerror = () => {
        this.loadError = `Échec de chargement de ${src} - avez-vous construit indicateurs-embed `
          + `et copié son dist dans embed-assets/ ?`;
      };
      document.body.appendChild(script);
    }
  }
}
