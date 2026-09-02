# Intégration dans PLaTon : ce qui existe côté Indicateurs

Symétrique de [`docs/integration-platon.md`](./integration-platon.md).
Implémenté et testé de bout en bout (backend réel + Chromium headless,
navigateur simulant PLaTon) : `<indicateurs-app>` s'affiche, se connecte à
l'API, et respecte la séparation admin/non-admin sans aucune modification du
code métier existant. L'application autonome actuelle (utilisée par les
administrateurs) n'a pas changé - c'est un second point d'entrée qui
s'ajoute, `ng build indicateurs` continue de fonctionner à l'identique.

## Ce qui existe déjà et se réutilise tel quel

Vérifié dans le code : les écrans concernés (`overview.page.ts`,
`indicators.page.ts`, `selector-family-indicators.page.ts`,
`indicator-detail.component.ts`, `indicator-card.component.ts`,
`indicator-config-modal.component.ts`, `pin-indicator-modal.component.ts`)
n'importent rien depuis `@platon/*` - aucune réécriture nécessaire, seul leur
assemblage change.

**`family-indicators.page.ts` est explicitement exclu** (voir §8) : "zéro
import `@platon/*`" ne suffisait pas à garantir qu'un écran soit sûr pour un
non-admin - trouvé en testant que ce fichier enveloppe directement un
composant d'administration, sans aucune vérification de rôle.

## 1. Racine embarquée : `src/embed/embed-root.component.ts`

Plus légère que `app.ts` : `app.ts` n'est qu'un `<router-outlet />` nu, mais
tout ce qui est routé en dessous passe par `DashboardPage`
(`dashboard.page.ts`), qui porte la sidebar/toolbar/tiroir Material propres à
l'app autonome - volontairement absents ici.

```ts
@Component({
  standalone: true,
  selector: 'indicateurs-app',
  imports: [RouterModule],
  template: `<router-outlet />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmbedRootComponent implements OnInit, OnChanges {
  @Input('access-token') accessToken?: string;
  @Input() user?: string; // JSON stringifié, même forme que `User` (auth.types.ts)
  @Input('initial-view') initialView?: 'overview' | 'indicators';

  private readonly router = inject(Router);

  ngOnInit(): void {
    // createCustomElement() ne passe pas par ApplicationRef.bootstrap() : la navigation
    // initiale du routeur, normalement automatique, ne se déclenche jamais sans cet appel.
    this.router.initialNavigation();
    if (this.initialView === 'indicators') this.router.navigate(['/indicators']);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['accessToken'] && this.accessToken) {
      localStorage.setItem('accessToken', this.accessToken);
    }
    if (changes['user'] && this.user) {
      const parsed = JSON.parse(this.user);
      localStorage.setItem('currentUser', this.user);
      localStorage.setItem('userRole', parsed.role);
    }
  }
}
```

**Pas de `<nav>` interne** - décision explicite (§14bis), corrigeant un choix
antérieur : une première version avait un bandeau "Tableau de bord /
Indicateurs" à l'intérieur du widget pour pallier l'absence de sidebar. À
l'usage, jugé redondant avec la sidebar de PLaTon elle-même (deux
navigations superposées, l'une PLaTon, l'une Indicateurs). Remplacé par
`initial-view` : PLaTon peut avoir plusieurs liens de sidebar vers ce même
composant, chacun choisissant sa page de départ - voir §14bis et
`integration-platon.md` §6bis.

Deux points trouvés seulement à l'implémentation, pas anticipés :
- `ngOnChanges` plutôt que `ngOnInit` pour lire les `@Input()` : c'est le
  hook que `createCustomElement` déclenche de façon fiable à chaque
  changement d'attribut/propriété.
- `router.initialNavigation()` explicite (voir ci-dessus) - sans lui,
  `<router-outlet>` reste vide indéfiniment, sans la moindre erreur console.

Un troisième point, trouvé puis corrigé deux fois de suite : `OverviewPage`
n'a aucun lien vers `IndicatorsPage` (la page de sélection/activation), ce
lien n'existant que dans la sidebar de l'app autonome, absente ici. D'abord
comblé par un `<nav>` interne, puis retiré au profit d'`initial-view` -
voir §14bis pour l'historique complet de ce point.

En écrivant dans les mêmes clés `localStorage` que le flux de connexion
actuel (`authentification.page.ts:110-135`), `AuthGuard` et `AuthInterceptor`
continuent de fonctionner sans une seule ligne modifiée.

## 2. Routes réduites : `src/embed/embed.routes.ts`

Reprises de `dashboard.routes.ts`, sans `courses`/`resources`, plus une
route ajoutée depuis (`context`, voir §14) :

```ts
export const embedRoutes: Routes = [
  { path: '', redirectTo: 'overview', pathMatch: 'full' },
  { path: 'overview', component: OverviewPage },
  { path: 'indicators', component: IndicatorsPage },
  { path: 'indicators/selector-family/:name', component: SelectorFamilyIndicatorsPage },
  { path: 'indicator/:id', component: IndicatorDetailComponent },
  { path: 'context', component: ContextIndicatorsPage },
];
```

`indicators/family/:name` (`FamilyIndicatorsPage`) est volontairement
absent - voir §8, cette page enveloppe directement le composant
d'administration sans vérification de rôle.

`IndicatorsPage` s'affiche déjà correctement pour un rôle non-admin sans
rien changer (`indicators.page.html:28-30`, `*ngIf="!roleService.isAdmin()"`)
- **confirmé visuellement** : avec un utilisateur `role: 'teacher'`, l'onglet
"Administration" n'apparaît jamais, seule la sélection d'indicateurs s'affiche.

Routage sur une `LocationStrategy` purement interne (`MemoryLocationStrategy`,
voir §11) - jamais de collision possible avec le routeur de PLaTon, quelle
que soit l'URL choisie côté PLaTon.

## 3. Fournisseurs : `src/embed/embed.config.ts`

Reprend `app.config.ts` avec deux vrais retraits et deux réintégrations
découvertes seulement à l'implémentation (les suppositions initiales
étaient fausses sur ces deux points) :

- **Retiré** : `provideZoneChangeDetection` (zone.js reste dans les
  polyfills de cette cible, voir §5, mais fourni via `polyfills` plutôt que
  ce provider).
- **Repris, contrairement au plan initial** : `{ provide: AuthProvider,
  useClass: RemoteAuthProvider }` - `DashboardSettingsService` en dépend
  directement (`NullInjectorError` sans lui). Sûr à réutiliser tel quel :
  `RemoteAuthProvider` ne fait que lire le `localStorage` déjà rempli par
  `EmbedRootComponent`, il ne déclenche jamais de redirection lui-même (ça,
  c'est `authentification.page.ts`, jamais chargé ici).
- **Repris, contrairement au plan initial** : `provideAnimationsAsync()` -
  ng-zorro en dépend en interne (`NzSelectComponent` notamment, erreur
  `NG05105 "Unexpected synthetic property @.disabled"` sans lui).
- **Remplacé, contrairement au plan initial** : `withHashLocation()` →
  `{ provide: LocationStrategy, useClass: MemoryLocationStrategy }` - voir
  §11, `withHashLocation()` écrit dans `window.location` et écrasait l'URL
  de la page hôte dès l'initialisation du widget.

```ts
export const embedConfig: ApplicationConfig = {
  providers: [
    { provide: EMBEDDED_MODE, useValue: true },
    { provide: AuthProvider, useClass: RemoteAuthProvider },
    { provide: LocationStrategy, useClass: MemoryLocationStrategy },
    provideRouter(embedRoutes, withRouterConfig({ paramsInheritanceStrategy: 'always' })),
    provideHttpClient(withInterceptors([authInterceptor, indicatorInterceptor])),
    provideAnimationsAsync(),
    { provide: NZ_I18N, useValue: fr_FR },
    provideNzIcons(NZ_ICONS_LIST), // liste factorisée dans shared/nz-icons.ts, partagée avec app.config.ts
    provideEchartsCore({ echarts: () => import('echarts') }),
  ],
};
```

`EMBEDDED_MODE` (`core/tokens/embedded-mode.token.ts`) est un
`InjectionToken<boolean>` lu par `auth.interceptor.ts` pour émettre un
évènement plutôt que naviguer sur un jeton expiré - voir §7.

## 4. `main-embed.ts` : bootstrap en élément personnalisé

```ts
createApplication(embedConfig)
  .then((appRef) => {
    const element = createCustomElement(EmbedRootComponent, { injector: appRef.injector });
    customElements.define('indicateurs-app', element);
  })
  .catch((err) => console.error('[indicateurs-embed] bootstrap error', err));
```

## 5. Second projet dans `angular.json` : `indicateurs-embed`

```jsonc
"indicateurs-embed": {
  "projectType": "application",
  "root": "", "sourceRoot": "src", "prefix": "app",
  "architect": {
    "build": {
      "builder": "@angular/build:application",
      "options": {
        "outputPath": "dist/indicateurs-embed",
        "index": false, // pas d'index.html - PLaTon fournit sa propre page
        "browser": "src/main-embed.ts",
        "tsConfig": "tsconfig.app.json",
        "polyfills": ["zone.js"], // voir ci-dessous, pas [] comme prévu au départ
        "styles": [
          "src/app/shared/styles/app.scss", // normalize + police d'icônes + variables (§6)
          "src/app/shared/styles/ng-zorro/light.less",
          "src/app/shared/styles/material/light.scss"
          // pas de bundleName/inject:false : Angular concatène les trois dans un seul
          // styles.css, dans cet ordre - voir §6
        ]
      },
      "configurations": {
        "production": { "outputHashing": "none" } // nom de fichier stable, pas de hash - voir Ouvert
      }
    }
  }
}
```

**`polyfills: ["zone.js"]`, pas `[]`** : `createApplication` refuse de
démarrer sans `zone.js` (erreur `NG0908`) tant qu'aucun mode zoneless
explicite n'est fourni - la seule façon de vraiment s'en passer serait
`provideExperimentalZonelessChangeDetection()` (encore expérimental en
Angular 18). Le test précédent avait déjà montré que le double chargement de
`zone.js` (une fois par PLaTon, une fois par l'élément) ne pose aucun
problème - inutile de se battre pour l'exclure, on le garde simplement.

## 5bis. `environment.embed.prod.ts` - un `apiUrl` distinct de l'app standalone

L'app standalone (`environment.prod.ts`, `apiUrl: '/api'`) et le widget embarqué
ne peuvent pas partager le même fichier d'environnement en production : le
widget est servi par le domaine d'Indicateurs (voir `integration-platon.md`,
"Décisions actées") mais **exécuté dans une page PLaTon** - un chemin relatif
`/api` s'y résoudrait contre le domaine de PLaTon, pas celui d'Indicateurs.

`environment.embed.prod.ts` (nouveau fichier, `fileReplacements` propre au
projet `indicateurs-embed` dans `angular.json`) utilise donc une adresse
complète : `https://<domaine-indicateurs-a-remplacer>/api`. **Placeholder à
remplacer par le vrai domaine de production d'Indicateurs avant tout
déploiement réel du widget** - inconnu à ce jour. Vérifié par build réel :
`apiUrl:"/api"` dans le build standalone, `apiUrl:"https://<domaine-indicateurs-a-remplacer>/api"`
dans le build embarqué.

## 6. Le CSS n'est pas injecté par le JS - un seul fichier, fusionné

`styles.material.light.css` (Material réellement utilisé - `mat-icon` -
dans 6 des 8 écrans) et `styles.ng-zorro.light.css` restent nécessaires,
ainsi qu'un **troisième bloc requis, trouvé seulement en testant** :
`app.scss` (normalize, police d'icônes Material, variables CSS) - sans lui,
les icônes Material s'affichent en texte brut (`info` au lieu du glyphe).

Ces trois blocs étaient d'abord produits comme trois fichiers CSS séparés
(3 `<link>` à poser côté PLaTon). **Fusionnés en un seul `styles.css`**
depuis (sur demande explicite) : les trois entrées `styles` de la
configuration `production`/`development` d'`indicateurs-embed` dans
`angular.json` n'ont plus de `bundleName`/`inject: false` propre - Angular
les concatène alors automatiquement dans un seul bundle, **dans l'ordre où
elles sont listées** (`app.scss` puis `ng-zorro/light.less` puis
`material/light.scss` - cet ordre est celui déjà testé avec les 3 fichiers
séparés, à ne pas changer sans revalider le rendu). Mise à jour
correspondante faite dans `integration-platon.md`.

## 7. Jeton expiré (401) en mode embarqué

`auth.interceptor.ts` détecte `EMBEDDED_MODE` et, sur un 401, émet un
évènement DOM plutôt que de naviguer vers `/authentification` (route qui
n'existe pas dans les routes réduites) :

```ts
if (embedded) {
  document.querySelector('indicateurs-app')
    ?.dispatchEvent(new CustomEvent('indicateurs-token-expired', { bubbles: true }))
} else {
  router?.navigateByUrl('/authentification')
}
```

## 10. Le rôle réel n'était jamais chargé - bug le plus sérieux trouvé

Trouvé en testant : dans l'app standalone, c'est `SidebarComponent#loadUser()`
(un appel réseau, dans un widget qui n'existe que là) qui appelle
`RoleService.setRole()` avec le vrai rôle - le service démarre sinon sur
`'student'` par défaut. La sidebar n'étant jamais montée en mode embarqué
(PLaTon fournit la sienne), **rien n'appelait cette mise à jour** :
`localStorage.userRole` contenait bien `'teacher'`, mais `RoleService`
l'ignorait complètement - tous les indicateurs `teacher`/`admin` restaient
invisibles, **sans la moindre erreur console**. Le genre de bug qui aurait
pu passer inaperçu jusqu'en production.

`RoleService.loadRoleFromStorage()` existait déjà, prévue pour exactement ce
cas, mais n'était jamais appelée seule. Corrigé en l'appelant explicitement
dans `EmbedRootComponent.ngOnChanges()`, juste après avoir écrit `userRole`
dans le `localStorage`. Confirmé visuellement : la carte de l'indicateur
`teacher` activé apparaît maintenant sur le tableau de bord.

## 11. Le routeur écrasait l'URL de la page hôte - bug trouvé en testant dans une vraie app

Tous les tests précédents montaient `<indicateurs-app>` dans
`test-host.html`, une page HTML statique sans routeur. Pour se rapprocher
du scénario réel (PLaTon est une vraie app Angular, avec sa propre URL),
une page de diagnostic (`features/dashboard/pages/embed-test/`, route
`/dashboard/embed-test` de l'app standalone, jamais liée dans la navigation)
monte le même `<indicateurs-app>` à l'intérieur de l'app standalone
elle-même.

Résultat : dès l'initialisation du widget, l'URL réelle du navigateur
passait de `http://localhost:4200/dashboard/embed-test` à
`http://localhost:4200/#/overview` - **aucune erreur**, juste l'URL de la
page hôte silencieusement remplacée. Cause : `withHashLocation()` écrit
dans `window.location`, le même objet que le routeur de l'app hôte. Dans
`test-host.html` (pas de routeur hôte) ce n'était pas visible ; dans une
vraie app - PLaTon - ça aurait cassé son URL dès l'ouverture de l'onglet
Indicateurs (rafraîchir la page, précédent/suivant, partager un lien
auraient tous été affectés).

Corrigé avec `src/embed/memory-location.strategy.ts`, une
`LocationStrategy` custom qui garde tout l'historique de navigation du
widget en mémoire (une simple pile de chemins), sans jamais toucher
`window.location`/`window.history`. Fournie à la place de
`withHashLocation()` dans `embed.config.ts` (§3). Revalidé sur la même
page de diagnostic : l'URL hôte reste intacte pendant toute la navigation
interne du widget (clic sur une carte → détail complet avec breadcrumb,
onglets, seuils, donnée réelle - testé et confirmé visuellement).

**Contrepartie assumée** : pas de deep-link direct vers une vue précise du
widget depuis l'extérieur, pas de bouton précédent/suivant du navigateur
pour naviguer dans le widget (uniquement dans PLaTon lui-même). PLaTon
garde entièrement la main sur l'URL visible - jugé préférable à risquer un
conflit avec son propre routeur.

## 12. Simulateur de test en conditions réelles PLaTon - `platon-simulateur/`

PLaTon réel (Nx, API NestJS, ~20 libs `@platon/feature/*`) démarré en local
pour valider §11 - fonctionnel, mais trop lourd pour tourner durablement sur
toutes les machines de dev. Remplacé par un projet Angular CLI séparé et
léger, `full_platon/platon-simulateur/`, qui reproduit uniquement ce qui
compte pour ce test précis :

- Mêmes versions exactes que PLaTon (`Angular 18.2.2`, `ng-zorro-antd
  ^18.1.1`, `@angular/material 18.2.2`, `zone.js 0.14.8`).
- Les vrais fichiers CSS de PLaTon (`platon/shared/styles/`) - constaté en
  comparant : `app.scss` et `material/light.scss` sont déjà des copies
  octet pour octet dans Indicateurs, `ng-zorro/light.less` ne diffère que
  par un style d'import (relatif vs résolu par le package). Zéro divergence
  de fond trouvée.
- La même config de routeur que `apps/web/src/app/app.config.ts` :
  `withEnabledBlockingInitialNavigation()`, `withComponentInputBinding()`,
  `withPreloading(PreloadAllModules)`, aucune `LocationStrategy` explicite
  (donc `PathLocationStrategy`, la config à laquelle `MemoryLocationStrategy`
  (§11) doit rester inoffensive).
- Une page hôte (`indicateurs-page.component.ts`) qui reproduit exactement
  le contrat documenté dans `integration-platon.md` §3-4/7 (attribut
  `access-token`, propriété `user`, attributs `context-*`, la feuille de
  style unique, script `main.js`).
- La vraie sidebar de PLaTon (`sidebar.component.ts` du simulateur) - même
  structure, mêmes couleurs (`--brand-background-sidebar: #3C2964`), même
  logo, copiés depuis `platon/apps/web/src/app/widgets/sidebar/` (déjà
  repris à l'identique dans l'app standalone d'Indicateurs, donc juste
  reporté ici). But explicite : que l'équipe PLaTon puisse ouvrir ce
  simulateur et voir immédiatement, visuellement, où et comment l'intégration
  se branche, pour la reproduire dans leur vrai code plutôt que de partir
  de la seule documentation écrite.
- Avait initialement deux pages natives factices (`activity.component.ts`,
  `course.component.ts`) avec un bouton "Voir les indicateurs" (§14) - le
  morceau de code que PLaTon doit ajouter à ses vraies pages cours/activité.
  **Retirées depuis** (voir §14ter) : la page d'accueil du simulateur lie
  désormais directement vers les indicateurs, sans page intermédiaire.

Ce qui n'est PAS reproduit, volontairement (hors périmètre de ce test) :
l'API NestJS de PLaTon (jeton/utilisateur de test statiques à la place),
les ~20 libs `@platon/feature/*`, l'authentification CAS réelle, le contenu
réel des pages cours/activité (seulement leur route et le bouton).

Résultat : navigation réelle (clic, pas une URL ouverte directement) entre
une page hôte factice et l'onglet Indicateurs, rendu correct, aucune
collision CSS visible, aucune erreur console, URL hôte préservée à l'aller
comme au retour.

Ce simulateur a aussi servi à trouver le manque de `<nav>` interne (§1) : en
cliquant réellement de "Tableau de bord" vers "Indicateurs" puis en ouvrant
une famille, la page de sélection/activation complète s'affiche - filtres,
recherche, interrupteurs d'activation par indicateur, cohérents avec les
préférences déjà en base (les indicateurs activés apparaissent bien comme
tels). C'est le parcours complet qu'un utilisateur PLaTon doit pouvoir
suivre pour choisir ses indicateurs, maintenant vérifié de bout en bout.

## `OnPush` - recommandé, pas indispensable

`zone.js` étant finalement conservé (§5), ce n'est plus du tout un
prérequis - juste une bonne pratique déjà largement suivie (71 % du code).

## Ce que PLaTon doit fournir à `<indicateurs-app>` (rappel du contrat)

`access-token` et `user` (JSON, champs `id`, `username`, `firstName`,
`lastName`, `email`, `role`, `active`, `createdAt`, `updatedAt`) sont les
deux seuls attributs requis. `initial-view` (§14bis) et `context-*` (§14)
sont optionnels - voir `integration-platon.md` pour l'exemple complet côté
PLaTon, mis à jour avec le fichier CSS unique (§6) et le contrat
d'évènement.

## Ce que produit le build

`ng build indicateurs-embed` produit `main.js` + un chunk lazy par route +
`polyfills.js` + `styles.css` (fusion des trois blocs, §6) + `fonts/`/
`icons/` - tout le dossier `dist/indicateurs-embed/browser/` doit être
hébergé et servi ensemble.

## 8. `family-indicators.page.ts` exclu des routes - c'est une page d'admin déguisée

Trouvé en cliquant réellement sur une carte de famille dans la liste (pas en
lisant le code) : `indicators/family/:name` (`FamilyIndicatorsPage`)
enveloppe directement `AdminIndicatorManagerComponent`
(`family-indicators.page.ts:4`), sans la moindre vérification de rôle -
affichait les actions d'édition/suppression/création à un utilisateur
`teacher`. Seul `admin-indicator-manager.component.ts` s'y réfère (dans son
propre commentaire) - jamais lié depuis un composant utilisateur, donc son
retrait de `embed.routes.ts` n'a aucun impact sur les vrais parcours.

Seule `indicators/selector-family/:name` (`SelectorFamilyIndicatorsPage`,
qui enveloppe `IndicatorSelectorComponent` - le vrai composant de sélection)
reste dans les routes embarquées. Confirmé visuellement : cette page
n'affiche que les actions "voir" et "activer/désactiver", jamais
d'édition/suppression.

## 9. Navigation à chemin absolu codée en dur - `ROUTE_BASE_PATH`

Trouvé en cliquant sur une carte de famille puis sur "Retour à la liste" :
`indicator-selector.component.ts` naviguait vers des chemins absolus codés
en dur (`/dashboard/indicators/selector-family`, `/dashboard/indicators`),
qui n'existent pas dans les routes de l'embarqué (montées à la racine, sans
préfixe `/dashboard`) - erreur `NG04002: Cannot match any routes`.

Corrigé avec un nouvel `InjectionToken<string>`,
`core/tokens/route-base-path.token.ts` : `'/dashboard'` dans `app.config.ts`
(explicite, comportement inchangé pour l'app autonome), `''` dans
`embed.config.ts`. Le composant construit désormais le chemin avec
`` `${this.routeBasePath}/indicators/...` `` plutôt qu'un chemin en dur -
fonctionne identiquement dans les deux contextes.

**Le même bug existait ailleurs, trouvé en relisant systématiquement tous
les `.html` du périmètre** (une première passe s'était limitée aux `.ts`,
insuffisant) : `indicator-card.component.html` (clic sur une carte →
`/dashboard/indicator/:id`) et `indicator-detail.component.html` (fil
d'Ariane vers le tableau de bord, bouton "Retour au tableau de bord") -
mêmes symptôme, même correctif via `ROUTE_BASE_PATH`.

Cas à part, non résolu de la même façon : les bannières de contexte
cours/activité dans `indicator-detail.component.html` (liens "Retour à
l'activité"/"Retour au cours") pointent vers `/dashboard/courses/...` - une
route qui n'existe pas non plus dans l'embarqué, mais qui ne peut pas être
réparée avec `ROUTE_BASE_PATH` puisque `courses` n'y est pas du tout défini
(hors périmètre). Faute d'un contrat de lien vers les pages natives de
PLaTon, ces liens sont **masqués** en mode embarqué (`*ngIf="!embedded"`) -
les puces d'information (nom du cours/activité) restent visibles, seul le
lien de retour disparaît. Voir Ouvert.

## Validé (test réel, pas seulement compilé)

Testé avec le vrai backend (API + RabbitMQ), via Chromium headless :
`Tableau de bord`, liste "Indicateurs", clic sur une carte de famille,
"Retour à la liste", activation réelle d'un indicateur `teacher` (préférence
insérée en base), sa carte apparaissant sur le tableau de bord, clic sur
cette carte jusqu'au détail (onglets, seuils, aide à l'analyse, données
calculées réelles) - tout le parcours de clic en clic, pas seulement des
URL ouvertes directement. Le contrat d'évènement
`indicateurs-token-expired` a été déclenché avec un vrai jeton expiré et un
vrai 401 : l'évènement part bien, `accessToken` est bien nettoyé du
`localStorage`. `ng build indicateurs` (l'app autonome) compile toujours
sans erreur après l'ensemble de ces changements - non re-testé visuellement
de bout en bout (bloqué par un appel de l'app autonome vers la vraie API de
PLaTon en production, injoignable depuis l'environnement de test ; sans
rapport avec les correctifs, qui produisent la même chaîne `/dashboard/...`
qu'avant, déjà vérifiée par la compilation).

Testé depuis, avec de vraies données : les trois bannières de contexte
(`from=activity`, `from=group-snapshot` scopé cours-entier) sur la page de
détail - chips corrects, aucun lien de retour affiché (`*ngIf="!embedded"`).
Ce test a aussi fait découvrir puis corriger deux bugs de navigation en
cascade dans `indicator-detail.component.ts` (lecture de `route.snapshot`
une seule fois au lieu de s'abonner, puis un `combineLatest` non-atomique
entre `paramMap`/`queryParams`) - voir le composant pour le détail, les deux
corrigés et revérifiés par trace réseau.

Testé aussi : le widget monté **à l'intérieur d'une vraie application
Angular qui tourne** (pas seulement `test-host.html`, une page statique) -
voir §11. C'est ce test qui a révélé le bug d'écrasement d'URL et amené
`MemoryLocationStrategy`. Après correctif : coexistence confirmée sans
aucune erreur console, navigation interne du widget fonctionnelle (clic sur
une carte → détail complet), URL de la page hôte préservée du début à la
fin.

Testé aussi, dans un vrai PLaTon en local (`docker-compose.dev.yml` + `yarn
serve:api`/`serve:web`) : navigation réelle jusqu'à l'onglet Indicateurs,
coexistence confirmée. Trop lourd pour tourner durablement sur toutes les
machines de dev - remplacé depuis par un simulateur léger dédié : voir §12.

Testé via ce simulateur - `platon-simulateur/` (projet Angular CLI séparé,
**pas** l'app standalone d'Indicateurs) reproduisant les conditions réelles
de PLaTon sans son poids (pas d'Nx, pas d'API NestJS, pas des 20+ libs
`@platon/feature/*`) : mêmes versions exactes (Angular 18.2.2, ng-zorro-antd
^18.1.1, Angular Material 18.2.2, zone.js 0.14.8), mêmes vrais fichiers CSS
(`shared/styles/` de PLaTon - constaté : Indicateurs les a déjà copiés
octet pour octet, zéro divergence trouvée), même config de routeur
(`withEnabledBlockingInitialNavigation()`, `withComponentInputBinding()`,
`withPreloading(PreloadAllModules)`, `PathLocationStrategy` par défaut -
copiée depuis `apps/web/src/app/app.config.ts`). Résultat : navigation
réelle entre une page hôte factice et l'onglet Indicateurs (clic, pas
juste une URL ouverte), rendu correct, aucune collision CSS visible,
aucune erreur console, URL hôte préservée à l'aller comme au retour. Le
test le plus proche des conditions réelles réalisé à ce jour sans faire
tourner PLaTon en entier.

Non testé : PLaTon réellement démarré en continu sur la durée (trop lourd,
voir ci-dessus) ; la modale de pin d'un indicateur (nécessite un contexte
cours/activité réel).

## 13. Lien de retour depuis le détail d'un indicateur - essayé en lien externe, puis retiré

Les bannières de contexte (cours/activité) masquaient leur lien de retour
en mode embarqué, faute de savoir construire une URL vers PLaTon. Une
première version a résolu ça avec un attribut `platon-base-url` (fourni par
PLaTon, servant à construire un `<a href>` externe vers ses vraies pages
`/courses/:id` / `/activities/:courseId/:activityId` - chemins confirmés en
lisant `platon/apps/web/src/app/pages/`, lecture seule).

**Retiré depuis**, trouvé en testant dans le simulateur (§12) après la
suppression de ses pages natives factices (§14ter) : "Retour au cours"
menait alors vers une page qui n'existait plus (`NG04002`, écran blanc côté
simulateur - le même problème se poserait pour toute intégration PLaTon dont
la page de destination ne serait pas encore prête). Remplacé par une
navigation **interne** vers `/context` (§14) avec le même contexte - "Retour
au cours" ramène à la liste des indicateurs de ce cours, à l'intérieur du
widget, sans dépendre d'une page externe. Plus de sens pour ce cas précis :
l'utilisateur ne demande pas "montre-moi la vraie page PLaTon", il demande
"remonte-moi à ce que je regardais avant". `platon-base-url` et
`getPlatonBaseUrl()` ont été supprimés du code (plus aucun appelant).

## 14. Voir les indicateurs d'un cours/une activité depuis PLaTon - `context-*`

Trou de conception trouvé après coup, pas seulement un bug : même une fois
tout le reste fonctionnel, un utilisateur PLaTon n'aurait eu **aucun moyen**
d'atteindre un indicateur scopé cours/activité/groupe depuis l'onglet
Indicateurs - `/overview` ne montre que les indicateurs personnels, et rien
ne permettait d'y entrer avec un contexte précis. Ces indicateurs
n'existaient jusque-là que dans les pages cours/activité de l'app
standalone (réservées admin) - le "un seul onglet Indicateurs" ne voulait
pas dire "les autres indicateurs deviennent inatteignables", mais c'est ce
qui se serait produit sans ce correctif.

Résolu en deux parties :
- **`context-indicators.page.ts`** (nouvelle route embarquée, `/context`) :
  fusionne les trois sections déjà utilisées séparément par
  `activity.page.ts` (contexte activité) et par `dashboard.page.ts` +
  `my-stats.page.ts` (contexte cours, jusque-là répondues sur deux pages
  standalone distinctes) - indicateurs personnels *-aware, indicateurs
  scopés au contexte, panneau de groupe. Paramétrée par query params
  (`contextType`, `activityId`/`courseId`, noms) plutôt que par
  `ActivityPresenter`/`CoursePresenter` (dépendent de `@platon/*`, sans
  objet ici puisque les identifiants arrivent déjà de PLaTon).
- **Attributs `context-*`** sur `<indicateurs-app>` (voir
  `integration-platon.md` §6) : `EmbedRootComponent` navigue automatiquement
  vers `/context` avec les bons query params dès que `context-type` est
  fourni, après `router.initialNavigation()` (ordre important - appeler
  `router.navigate()` avant l'aurait été risqué, le routeur pas encore
  démarré).

Testé dans le simulateur (§12), à l'époque avec de vraies pages "PLaTon"
factices (cours/activité) et un bouton "Voir les indicateurs" (ces pages ont
depuis été retirées du simulateur, voir §14ter - le test lui-même, lui,
reste valable : c'est le même clic, juste depuis la page d'accueil
directement) : parcours complet depuis une page native jusqu'à la bonne vue
d'indicateurs, pour un contexte activité et un contexte cours (avec panneau
de groupe et comparaison fonctionnels), sans erreur console.

## 14bis. Le bandeau de nav interne, finalement retiré - `initial-view`

Après avoir ajouté la vraie sidebar de PLaTon au simulateur (§12), le bandeau
interne "Tableau de bord / Indicateurs" du widget (§1) est devenu visiblement
redondant - deux navigations superposées pour la même chose. Décision :
supprimé, remplacé par un nouvel attribut `initial-view` (`'overview'` par
défaut, ou `'indicators'`) et **deux liens de sidebar PLaTon distincts**
vers ce même composant (`integration-platon.md` §1), plus le lien "Voir les
indicateurs" déjà existant sur les pages natives cours/activité (§14),
chacun avec sa propre destination :

| Point d'entrée         | Attribut                    | Page du widget            |
|-------------------------|------------------------------|----------------------------|
| Sidebar - Tableau de bord | (aucun, `initial-view` absent) | `/overview` (cartes perso) |
| Sidebar - Indicateurs   | `initial-view="indicators"`   | `/indicators` (activation) |
| Pages cours/activité    | `context-type="activity"` ou `"course"` (§14) | `/context` |

`context-type` prend le pas sur `initial-view` si les deux sont fournis
(cas du lien "Voir les indicateurs"). Testé dans le simulateur : les trois
points d'entrée, cliqués depuis leur origine respective (sidebar ou page
cours/activité), atteignent la bonne page sans bandeau superflu, avec le
bon lien sidebar surligné à chaque fois
(`routerLinkActiveOptions: { queryParams: 'exact' }` côté simulateur, pour ne
pas confondre `/indicateurs` et `/indicateurs?view=indicators`).

## 14ter. Pages natives factices retirées du simulateur - clic direct

`activity.component.ts`/`course.component.ts` (les pages PLaTon factices
avec le bouton "Voir les indicateurs", introduites en §14) ont été
supprimées du simulateur, sur demande explicite : la page d'accueil
(`home.component.ts`) lie désormais directement vers `/indicateurs` avec
les query params `contextType`/`activityId`/`courseId`/noms, sans page
intermédiaire. Le contrat "bouton sur la vraie page PLaTon" (§7 côté
`integration-platon.md`) reste inchangé et documenté - ce retrait ne
concerne que la démonstration dans ce simulateur, pas ce que PLaTon doit
faire réellement.

C'est ce retrait qui a révélé le bug du §13 (lien "Retour au cours" mort,
`platon-base-url` pointant vers une page qui n'existait plus) - la
correction du §13 (navigation interne vers `/context`) rend d'ailleurs ce
genre de retrait sans risque à l'avenir : le "retour" ne dépend plus de
l'existence d'une page hôte précise.

## Décisions actées

- Emplacement d'hébergement du dossier de sortie : servi directement par le
  serveur d'Indicateurs, sous `/embed/` (voir `.docker/frontend/Dockerfile`
  et `nginx.conf` - deuxième stage de build `indicateurs-embed`, copié à côté
  de l'app standalone dans la même image Nginx). Choix indépendant du LMS
  hôte (PLaTon aujourd'hui, potentiellement un autre demain) : un seul
  endroit sert n'importe quel LMS, sans configuration nginx à refaire côté
  hôte à chaque nouvelle intégration. Le CORS se règle côté API Indicateurs
  (`api/src/main.ts`, `origin: true` en prod), pas côté hébergement des
  fichiers statiques (charger un `<script>`/`<link>` cross-origin n'est pas
  soumis au CORS). Retenu comme choix par défaut ; à reconsidérer si un LMS
  hôte propose une autre méthode d'hébergement.

## Ouvert / à trancher

- `outputHashing: "none"` choisi pour un nom de fichier stable
  (`main.js`, pas `main.a1b2c3.js`) - à reconsidérer si un vrai système de
  versionnage est mis en place entre les deux équipes.
- Collision CSS résiduelle une fois inséré dans une vraie page PLaTon -
  fortement dérisqué depuis (§12, mêmes fichiers CSS exacts, mêmes
  versions de libs, testé dans un vrai PLaTon local et dans un simulateur aux
  conditions réelles), mais jamais testé contre l'intégralité des libs et
  pages réelles de PLaTon (celui-ci n'en charge qu'une page à la fois) -
  accepté comme limite de fait (voir `integration-platon.md`), à la charge
  de l'équipe PLaTon lors de sa propre validation.
- `MemoryLocationStrategy` (§11) : pas de deep-link direct vers une vue
  précise du widget, pas de bouton précédent/suivant du navigateur à
  l'intérieur du widget. Si ce besoin apparaît, il faudra reconsidérer -
  probablement via un préfixe d'URL négocié avec PLaTon plutôt qu'un retour
  à `withHashLocation()`.
