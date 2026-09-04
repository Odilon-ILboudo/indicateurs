# Intégration dans PLaTon : ce qui existe côté Indicateurs

Symétrique de [`docs/integration-platon.md`](./integration-platon.md).
`<indicateurs-app>` s'affiche, se connecte à l'API, et respecte la
séparation admin/non-admin sans aucune modification du code métier de
l'application autonome. L'application autonome (utilisée par les
administrateurs) n'a pas changé - c'est un second point d'entrée qui
s'ajoute, `ng build indicateurs` continue de fonctionner à l'identique.

## Ce que PLaTon doit fournir à `<indicateurs-app>` (rappel du contrat)

`access-token` et `user` (JSON, champs `id`, `username`, `firstName`,
`lastName`, `email`, `role`, `active`, `createdAt`, `updatedAt`) sont les
deux seuls attributs requis. `initial-view` et `context-*` (voir plus bas)
sont optionnels - voir `integration-platon.md` pour l'exemple complet côté
PLaTon.

## Écrans réutilisés tel quel

Les écrans concernés (`overview.page.ts`, `indicators.page.ts`,
`selector-family-indicators.page.ts`, `indicator-detail.component.ts`,
`indicator-card.component.ts`, `indicator-config-modal.component.ts`,
`pin-indicator-modal.component.ts`) n'importent rien depuis `@platon/*` -
aucune réécriture nécessaire, seul leur assemblage change.

`family-indicators.page.ts` est explicitement exclu des routes embarquées
(voir section « Routes réduites » ci-dessous) : ce fichier enveloppe directement un
composant d'administration, sans vérification de rôle - "zéro import
`@platon/*`" ne suffit pas à garantir qu'un écran soit sûr pour un
non-admin.

## Racine embarquée : `src/embed/embed-root.component.ts`

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

`ngOnChanges` est utilisé plutôt que `ngOnInit` pour lire les `@Input()` :
c'est le hook que `createCustomElement` déclenche de façon fiable à chaque
changement d'attribut/propriété. `router.initialNavigation()` est appelé
explicitement : sans lui, `<router-outlet>` reste vide indéfiniment, sans la
moindre erreur console.

**Pas de `<nav>` interne** : la navigation entre pages du widget se fait via
la sidebar de PLaTon lui-même (voir "Points d'entrée sidebar" plus bas,
attribut `initial-view`) plutôt que par un bandeau dupliqué à l'intérieur du
widget.

En écrivant dans les mêmes clés `localStorage` que le flux de connexion de
l'app autonome (`authentification.page.ts:110-135`), `AuthGuard` et
`AuthInterceptor` fonctionnent sans modification.

## Routes réduites : `src/embed/embed.routes.ts`

Reprises de `dashboard.routes.ts`, sans `admin`/`courses`/`resources` :

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
absent : cette page enveloppe directement le composant d'administration
sans vérification de rôle (voir section « Écrans réutilisés » ci-dessus). Seule
`indicators/selector-family/:name` (`SelectorFamilyIndicatorsPage`, qui
enveloppe `IndicatorSelectorComponent` - le vrai composant de sélection)
reste dans les routes embarquées ; cette page n'affiche que les actions
"voir" et "activer/désactiver", jamais d'édition/suppression.

`IndicatorsPage` s'affiche correctement pour un rôle non-admin sans rien
changer (`indicators.page.html:28-30`, `*ngIf="!roleService.isAdmin()"`) :
avec un utilisateur `role: 'teacher'`, l'onglet "Administration" n'apparaît
jamais, seule la sélection d'indicateurs s'affiche.

Routage sur une `LocationStrategy` purement interne (`MemoryLocationStrategy`,
voir plus bas) - jamais de collision possible avec le routeur de PLaTon,
quelle que soit l'URL choisie côté PLaTon.

## Fournisseurs : `src/embed/embed.config.ts`

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

Différences avec `app.config.ts` de l'app autonome, et pourquoi :
- Pas de `provideZoneChangeDetection` : `zone.js` reste nécessaire (voir
  section « Second projet » plus bas) mais fourni via `polyfills` plutôt que ce
  provider.
- `{ provide: AuthProvider, useClass: RemoteAuthProvider }` conservé :
  `DashboardSettingsService` en dépend directement (`NullInjectorError`
  sans lui). Sûr à réutiliser tel quel : `RemoteAuthProvider` ne fait que
  lire le `localStorage` déjà rempli par `EmbedRootComponent`, il ne
  déclenche jamais de redirection lui-même (ça, c'est
  `authentification.page.ts`, jamais chargé ici).
- `provideAnimationsAsync()` conservé : ng-zorro en dépend en interne
  (`NzSelectComponent` notamment, erreur `NG05105 "Unexpected synthetic
  property @.disabled"` sans lui).
- `{ provide: LocationStrategy, useClass: MemoryLocationStrategy }` plutôt
  que `withHashLocation()` : `withHashLocation()` écrit dans
  `window.location`, le même objet que le routeur de la page hôte -
  écraserait l'URL visible de PLaTon dès l'initialisation du widget. Voir
  section « Routage interne isolé » plus bas.

`EMBEDDED_MODE` (`core/tokens/embedded-mode.token.ts`) est un
`InjectionToken<boolean>` lu par `auth.interceptor.ts` pour émettre un
évènement plutôt que naviguer sur un jeton expiré - voir section « Jeton expiré ».

## `main-embed.ts` : bootstrap en élément personnalisé

```ts
createApplication(embedConfig)
  .then((appRef) => {
    const element = createCustomElement(EmbedRootComponent, { injector: appRef.injector });
    customElements.define('indicateurs-app', element);
  })
  .catch((err) => console.error('[indicateurs-embed] bootstrap error', err));
```

## Second projet dans `angular.json` : `indicateurs-embed`

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
        "polyfills": ["zone.js"],
        "styles": [
          "src/app/shared/styles/app.scss", // normalize + police d'icônes + variables
          "src/app/shared/styles/ng-zorro/light.less",
          "src/app/shared/styles/material/light.scss"
          // pas de bundleName/inject:false : Angular concatène les trois dans un seul
          // styles.css, dans cet ordre - voir section « CSS » plus bas
        ]
      },
      "configurations": {
        "production": { "outputHashing": "none" } // nom de fichier stable, pas de hash - voir Ouvert
      }
    }
  }
}
```

**`polyfills: ["zone.js"]`** : `createApplication` refuse de démarrer sans
`zone.js` (erreur `NG0908`) tant qu'aucun mode zoneless explicite n'est
fourni - la seule façon de vraiment s'en passer serait
`provideExperimentalZonelessChangeDetection()` (encore expérimental en
Angular 18). Le double chargement de `zone.js` (une fois par PLaTon, une
fois par l'élément) ne pose aucun problème.

## `environment.embed.prod.ts` - un `apiUrl` distinct de l'app standalone

L'app standalone (`environment.prod.ts`, `apiUrl: '/api'`) et le widget embarqué
ne peuvent pas partager le même fichier d'environnement en production : le
widget est servi par le domaine d'Indicateurs (voir `integration-platon.md`,
"Décisions actées") mais **exécuté dans une page PLaTon** - un chemin relatif
`/api` s'y résoudrait contre le domaine de PLaTon, pas celui d'Indicateurs.

`environment.embed.prod.ts` (fichier séparé, `fileReplacements` propre au
projet `indicateurs-embed` dans `angular.json`) utilise donc une adresse
complète : `https://<domaine-indicateurs-a-remplacer>/api`. **Placeholder à
remplacer par le vrai domaine de production d'Indicateurs avant tout
déploiement réel du widget** - inconnu à ce jour.

## CSS : un seul fichier, fusionné

`styles.material.light.css` (Material utilisé via `mat-icon` dans 6 des 8
écrans) et `styles.ng-zorro.light.css` sont nécessaires, ainsi qu'un
troisième bloc : `app.scss` (normalize, police d'icônes Material,
variables CSS) - sans lui, les icônes Material s'affichent en texte brut
(`info` au lieu du glyphe).

Les trois entrées `styles` de la configuration `production`/`development`
d'`indicateurs-embed` dans `angular.json` n'ont pas de
`bundleName`/`inject: false` propre - Angular les concatène automatiquement
dans un seul bundle, **dans l'ordre où elles sont listées** (`app.scss` puis
`ng-zorro/light.less` puis `material/light.scss` - cet ordre conditionne le
rendu, à ne pas changer sans revalider visuellement).

## Jeton expiré (401) en mode embarqué

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

## Routage interne isolé : `MemoryLocationStrategy`

Le routage interne du widget (tableau de bord ↔ liste ↔ détail) utilise
`src/embed/memory-location.strategy.ts`, une `LocationStrategy` custom qui
garde tout l'historique de navigation du widget en mémoire (une simple pile
de chemins), sans jamais toucher `window.location`/`window.history`.
Fournie à la place de `withHashLocation()` dans `embed.config.ts`.

**Contrepartie assumée** : pas de deep-link direct vers une vue précise du
widget depuis l'extérieur, pas de bouton précédent/suivant du navigateur
pour naviguer dans le widget (uniquement dans PLaTon lui-même). PLaTon garde
entièrement la main sur l'URL visible.

## `ROUTE_BASE_PATH` : chemins absolus PLaTon vs racine embarquée

Les routes embarquées sont montées à la racine (sans préfixe `/dashboard`),
contrairement à l'app autonome. Un `InjectionToken<string>`,
`core/tokens/route-base-path.token.ts`, porte ce préfixe : `'/dashboard'`
dans `app.config.ts`, `''` dans `embed.config.ts`. Tout code de navigation
interne (`indicator-selector.component.ts`, `indicator-card.component.html`,
fil d'Ariane et bouton retour d'`indicator-detail.component.html`) construit
ses chemins avec `` `${routeBasePath}/indicators/...` `` plutôt qu'un chemin
en dur - fonctionne identiquement dans les deux contextes.

**Cas non couvert par ce mécanisme** : les bannières de contexte
cours/activité dans `indicator-detail.component.html` (liens "Retour à
l'activité"/"Retour au cours") pointent vers `/dashboard/courses/...`, une
route absente de l'embarqué et hors périmètre de `ROUTE_BASE_PATH`. Faute
d'un contrat de lien vers les pages natives de PLaTon, ces liens sont
**masqués** en mode embarqué (`*ngIf="!embedded"`) - les puces d'information
(nom du cours/activité) restent visibles, seul le lien de retour disparaît.
Voir Ouvert.

## `OnPush` - recommandé, pas indispensable

`zone.js` étant conservé (voir section « Second projet »), `OnPush` n'est pas un
prérequis - juste une bonne pratique déjà largement suivie dans le code.

## Accès aux indicateurs scopés cours/activité/groupe depuis PLaTon : `context-*`

`/overview` ne montre que les indicateurs personnels - un utilisateur PLaTon
a aussi besoin d'atteindre un indicateur scopé cours/activité/groupe depuis
l'onglet Indicateurs, sans passer par l'app autonome (réservée admin).
Résolu en deux parties :

- **`context-indicators.page.ts`** (route embarquée `/context`) : fusionne
  les sections indicateurs personnels *-aware, indicateurs scopés au
  contexte, et panneau de groupe. Paramétrée par query params
  (`contextType`, `activityId`/`courseId`, noms) plutôt que par
  `ActivityPresenter`/`CoursePresenter` (dépendent de `@platon/*`, sans
  objet ici puisque les identifiants arrivent déjà de PLaTon).
- **Attributs `context-*`** sur `<indicateurs-app>` (voir
  `integration-platon.md` section 6) : `EmbedRootComponent` navigue automatiquement
  vers `/context` avec les bons query params dès que `context-type` est
  fourni, après `router.initialNavigation()` (l'ordre importe : appeler
  `router.navigate()` avant démarrerait un routeur pas encore initialisé).

## Points d'entrée sidebar : `initial-view`

Le widget définit trois points d'entrée possibles depuis PLaTon, chacun
avec sa propre destination :

| Point d'entrée         | Attribut                    | Page du widget            |
|-------------------------|------------------------------|----------------------------|
| Sidebar - Tableau de bord | (aucun, `initial-view` absent) | `/overview` (cartes perso) |
| Sidebar - Indicateurs   | `initial-view="indicators"`   | `/indicators` (activation) |
| Pages cours/activité    | `context-type="activity"` ou `"course"` (voir ci-dessus) | `/context` |

`context-type` prend le pas sur `initial-view` si les deux sont fournis (cas
du lien "Voir les indicateurs" sur une page cours/activité PLaTon).

## Simulateur de test en conditions réelles PLaTon - `platon-simulateur/`

`full_platon/platon-simulateur/` est un projet Angular CLI séparé et léger
qui reproduit ce qui compte pour tester l'intégration, sans le poids du
vrai dépôt PLaTon (Nx, API NestJS, ~20 libs `@platon/feature/*`) :

- Mêmes versions exactes que PLaTon (`Angular 18.2.2`, `ng-zorro-antd
  ^18.1.1`, `@angular/material 18.2.2`, `zone.js 0.14.8`).
- Les vrais fichiers CSS de PLaTon (`platon/shared/styles/`) : `app.scss` et
  `material/light.scss` sont des copies octet pour octet dans Indicateurs,
  `ng-zorro/light.less` ne diffère que par un style d'import (relatif vs
  résolu par le package).
- La même config de routeur que `apps/web/src/app/app.config.ts` :
  `withEnabledBlockingInitialNavigation()`, `withComponentInputBinding()`,
  `withPreloading(PreloadAllModules)`, aucune `LocationStrategy` explicite
  (donc `PathLocationStrategy`, la config à laquelle `MemoryLocationStrategy`
  doit rester inoffensive).
- Une page hôte (`indicateurs-page.component.ts`) qui reproduit exactement
  le contrat documenté dans `integration-platon.md` section 3-4/7 (attribut
  `access-token`, propriété `user`, attributs `context-*`, la feuille de
  style unique, script `main.js`).
- La vraie sidebar de PLaTon (`sidebar.component.ts` du simulateur) - même
  structure, mêmes couleurs (`--brand-background-sidebar: #3C2964`), même
  logo, copiés depuis `platon/apps/web/src/app/widgets/sidebar/`. But
  explicite : que l'équipe PLaTon puisse ouvrir ce simulateur et voir
  immédiatement, visuellement, où et comment l'intégration se branche, pour
  la reproduire dans leur vrai code plutôt que de partir de la seule
  documentation écrite.
- La page d'accueil du simulateur lie directement vers les indicateurs
  (tableau de bord, liste, ou un contexte cours/activité précis via query
  params), sans page intermédiaire.

Ce qui n'est PAS reproduit, volontairement (hors périmètre de ce test) :
l'API NestJS de PLaTon (jeton/utilisateur de test statiques à la place),
les ~20 libs `@platon/feature/*`, l'authentification CAS réelle, le contenu
réel des pages cours/activité.

## Ce que produit le build

`ng build indicateurs-embed` produit `main.js` + un chunk lazy par route +
`polyfills.js` + `styles.css` (fusion des trois blocs CSS, voir plus haut) +
`fonts/`/`icons/` - tout le dossier `dist/indicateurs-embed/browser/` doit
être hébergé et servi ensemble.

## Ce qui est vérifié

Testé avec le vrai backend (API + RabbitMQ) et le simulateur PLaTon, via
Chromium headless en conditions réelles (clic, pas seulement des URL
ouvertes directement) : navigation tableau de bord → liste "Indicateurs" →
détail d'une famille → activation réelle d'un indicateur (préférence
insérée en base) → sa carte sur le tableau de bord → détail complet (onglets,
seuils, aide à l'analyse, données calculées réelles) ; le contrat
d'évènement `indicateurs-token-expired` avec un vrai jeton expiré et un vrai
401 (l'évènement part, `accessToken` est nettoyé du `localStorage`) ; les
trois bannières de contexte (`from=activity`, `from=group-snapshot` scopé
cours-entier) avec chips corrects et lien de retour masqué
(`*ngIf="!embedded"`) ; coexistence du widget avec une vraie application
Angular hôte, aucune erreur console, URL de la page hôte préservée du début
à la fin de la navigation interne ; les trois points d'entrée (`initial-view`
absent, `initial-view="indicators"`, `context-type`) atteignent chacun la
bonne page, avec le bon lien sidebar surligné.

`ng build indicateurs` (l'app autonome) compile sans erreur après
l'ensemble de ces changements.

Non testé : PLaTon réellement démarré en continu sur la durée (trop lourd,
voir "Décisions actées" dans `integration-platon.md`) ; la modale de pin
d'un indicateur (nécessite un contexte cours/activité réel).

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
- Pas de lien externe vers les vraies pages PLaTon (`/courses/:id`,
  `/activities/:courseId/:activityId`) depuis les bannières de contexte :
  "Retour au cours"/"Retour à l'activité" navigue **en interne** vers
  `/context` avec le même contexte plutôt que vers une page PLaTon
  potentiellement absente ou pas encore prête côté hôte - l'utilisateur
  demande "remonte-moi à ce que je regardais avant", pas nécessairement la
  page PLaTon d'origine.

## Ouvert / à trancher

- `outputHashing: "none"` choisi pour un nom de fichier stable
  (`main.js`, pas `main.a1b2c3.js`) - à reconsidérer si un vrai système de
  versionnage est mis en place entre les deux équipes.
- Collision CSS résiduelle une fois inséré dans une vraie page PLaTon -
  fortement dérisqué (mêmes fichiers CSS exacts, mêmes versions de libs,
  testé dans un vrai PLaTon local et dans le simulateur), mais jamais testé
  contre l'intégralité des libs et pages réelles de PLaTon (le simulateur
  n'en charge qu'une page à la fois) - accepté comme limite de fait (voir
  `integration-platon.md`), à la charge de l'équipe PLaTon lors de sa propre
  validation.
- `MemoryLocationStrategy` : pas de deep-link direct vers une vue précise du
  widget, pas de bouton précédent/suivant du navigateur à l'intérieur du
  widget. Si ce besoin apparaît, il faudra reconsidérer - probablement via
  un préfixe d'URL négocié avec PLaTon plutôt qu'un retour à
  `withHashLocation()`.
- Lien vers les vraies pages PLaTon depuis les bannières de contexte
  (cours/activité) : aujourd'hui masqué faute de contrat (voir
  `ROUTE_BASE_PATH` plus haut) - à trancher avec l'équipe PLaTon si ce lien
  s'avère nécessaire.
