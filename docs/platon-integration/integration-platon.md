# Intégration dans PLaTon : ce qu'il faut faire côté PLaTon

Ce document décrit précisément ce que l'équipe PLaTon doit ajouter à son propre
dépôt pour faire apparaître un onglet « Indicateurs » dans sa navigation, visible
uniquement aux enseignants et aux étudiants (jamais aux administrateurs, qui
continuent d'utiliser l'interface actuelle d'Indicateurs telle quelle). Rien de
ce qui suit ne peut être fait depuis le dépôt Indicateurs seul : ce sont des
modifications du code de PLaTon, qui appartiennent à son équipe.

**Tâche distincte, non couverte ici** : le relais d'événements
(`platon_outbox_events` → RabbitMQ), nécessaire pour que les indicateurs se
mettent à jour en temps réel, vit lui aussi côté PLaTon, voir
[`docs/platon-integration/integration-platon-relay.md`](./integration-platon-relay.md) pour ce
second ajout, indépendant de l'onglet « Indicateurs » décrit ici.

## Principe

Indicateurs expose un second point d'entrée de build, en plus de son
application autonome actuelle réservée aux administrateurs, compilé comme un
[Web Component](https://developer.mozilla.org/fr/docs/Web/API/Web_components)
(`@angular/elements`) : une balise HTML personnalisée, `<indicateurs-app>`, que
n'importe quelle page peut charger via un simple `<script>`, sans que PLaTon
ait besoin de connaître Angular côté Indicateurs ni de partager sa version
d'Angular au moment de la compilation.

## Ce que PLaTon doit ajouter (4 éléments)

### 1. Deux liens dans la sidebar

Fichier : `apps/web/src/app/widgets/sidebar/sidebar.component.ts`, dans
`ngOnInit()`, à côté des autres liens conditionnels (`isTeacherRole`,
`UserRoles.admin`). Deux liens plutôt qu'un seul : pas de sélecteur de page à
l'intérieur du widget, chaque lien mène directement à la bonne page via
`initial-view` (section 3) :

```ts
...(this.user.role === UserRoles.teacher || this.user.role === UserRoles.student
  ? [
      {
        url: '/indicateurs',
        icon: 'insights', // ou une autre icône Material au choix de l'équipe
        title: 'Indicateurs',
      },
      {
        url: '/indicateurs',
        queryParams: { view: 'indicators' },
        icon: 'tune',
        title: 'Gérer mes indicateurs',
      },
    ]
  : []),
```

(Le `NavLink` existant peut nécessiter un champ `queryParams` en plus de
`url`, à ajouter si absent ; `RouterModule` le consomme nativement via
`[queryParams]` sur le `routerLink`.)

Important : ne **pas** utiliser `isTeacherRole()` (le helper existant) pour ces
liens, cette fonction inclut aussi `UserRoles.admin`
(`libs/core/common/src/lib/models/user.model.ts:121`), alors qu'ils doivent
être invisibles pour les administrateurs.

### 2. Une route

Fichier : `apps/web/src/app/app.routes.ts`, même pattern que les routes
existantes (`withAuthGuard` + liste de rôles autorisés) :

```ts
withAuthGuard(
  {
    path: 'indicateurs',
    title: 'PLaTon - Indicateurs',
    loadChildren: () =>
      import(
        /* webpackChunkName: "indicateurs" */
        './pages/indicateurs/indicateurs.routes'
      ),
  },
  [UserRoles.teacher, UserRoles.student]
),
```

### 3. Une page hôte légère (à écrire, n'existe pas encore)

C'est la seule pièce réellement nouvelle à concevoir côté PLaTon : un petit
composant Angular dont le rôle est de charger le script et le CSS
d'Indicateurs, de monter la balise avec le jeton d'authentification déjà
disponible côté PLaTon, et de lui retransmettre les paramètres optionnels
(`initial-view`, `context-*`) lus depuis l'URL de sa propre route. Code
complet, tout regroupé :

```ts
@Component({
  standalone: true,
  selector: 'app-indicateurs-page',
  // Sans ce schéma, Angular refuse la balise inconnue <indicateurs-app>.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <indicateurs-app
      #el
      [attr.access-token]="accessToken"
      [attr.initial-view]="initialView"
      [attr.context-type]="contextType"
      [attr.context-activity-id]="contextActivityId"
      [attr.context-course-id]="contextCourseId"
      [attr.context-activity-name]="contextActivityName"
      [attr.context-course-name]="contextCourseName">
    </indicateurs-app>
  `,
})
export class IndicateursPage implements OnInit, AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  @ViewChild('el') el!: ElementRef<HTMLElement & { user?: string }>;

  protected accessToken?: string;
  protected initialView?: string;
  protected contextType?: string;
  protected contextActivityId?: string;
  protected contextCourseId?: string;
  protected contextActivityName?: string;
  protected contextCourseName?: string;

  private currentUser?: User;
  private querySubscription?: Subscription;
  private readonly base = 'https://<domaine-indicateurs>/embed';

  async ngOnInit() {
    // Composant réutilisé entre les deux liens de la barre latérale : on suit les paramètres, pas une seule lecture.
    this.querySubscription = this.route.queryParams.subscribe((q) => {
      this.initialView = q['view'];
      this.contextType = q['contextType'];
      this.contextActivityId = q['activityId'];
      this.contextCourseId = q['courseId'];
      this.contextActivityName = q['activityName'];
      this.contextCourseName = q['courseName'];
    });

    this.loadEmbedAssets();

    const token = await this.authService.token();
    this.accessToken = token?.accessToken;
    this.currentUser = await this.authService.ready();
    this.passUserToWidget();
  }

  ngAfterViewInit() {
    this.passUserToWidget();

    // Le widget ne peut pas afficher de connexion : c'est à PLaTon de réagir au jeton expiré.
    this.el.nativeElement.addEventListener('indicateurs-token-expired', () => {
      /* Rafraîchir le jeton PLaTon puis redonner `access-token`,
         ou renvoyer vers la connexion PLaTon : au choix de l'équipe. */
    });
  }

  ngOnDestroy() {
    this.querySubscription?.unsubscribe();
  }

  // Requis : sans l'utilisateur, le widget suppose le rôle 'student'.
  private passUserToWidget(): void {
    if (this.el && this.currentUser) {
      this.el.nativeElement.user = JSON.stringify(this.currentUser);
    }
  }

  private loadEmbedAssets(): void {
    if (document.querySelector(`link[href="${this.base}/styles.css"]`)) {
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${this.base}/styles.css`;
    document.head.appendChild(link);

    // polyfills.js avant main.js : zone.js doit être chargé avant le démarrage du widget.
    for (const src of ['polyfills.js', 'main.js']) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = `${this.base}/${src}`;
      document.body.appendChild(script);
    }
  }
}
```

`AuthService.token()` et `AuthService.ready()` (qui renvoie l'utilisateur
connecté) existent déjà dans PLaTon
(`libs/core/browser/src/lib/auth/api/auth.service.ts`, lignes 33 et 45) :
rien à ajouter de ce côté.

**Mécanisme retenu** : `loadEmbedAssets()` crée les balises `<link>` et
`<script type="module">` par programmation plutôt que d'utiliser un
`import()` dynamique ; c'est l'approche qui fonctionne dans le simulateur
(`platon-simulateur/src/app/indicateurs-page/indicateurs-page.component.ts`).
La vérification sur `document.querySelector` évite de recharger le script si
la route est revisitée sans que le composant soit détruit.

**Point de vigilance pour le déploiement réel** : `<script type="module">`
est soumis au CORS dès qu'il est chargé depuis un domaine différent,
contrairement à un `<script>` classique. L'en-tête CORS déjà prévu côté API
Indicateurs (`api/src/main.ts`, `origin: true`) ne couvre pas ces fichiers
statiques ; il faut aussi l'ajouter sur le bloc `location /embed/` de
`nginx.conf`. Non couvert par le test en simulateur, qui charge ces fichiers
depuis sa propre origine.

Détail des parties de ce composant :

- **La feuille de style** (`<link>`) : posée par `loadEmbedAssets()` en même
  temps que le script, car `main.js` n'injecte pas le CSS lui-même. Un seul
  fichier, `styles.css` (près de 1 Mo avant compression), assemblé au build à
  partir de trois feuilles : `app.scss` (remise à zéro, police d'icônes
  Material, variables), le thème ng-zorro et le thème Material.
- **`user`** (`passUserToWidget`) : posé comme propriété de l'élément (et non
  comme attribut HTML, car c'est un objet JSON), une fois l'utilisateur connu
  et l'élément créé. Il est indispensable : sans lui, le widget suppose le
  rôle `'student'` et les indicateurs enseignant et admin restent
  invisibles, sans erreur.
- **`indicateurs-token-expired`** : évènement DOM bouillonnant émis par le
  widget sur un jeton expiré, à la place d'une navigation qu'il ne peut pas
  faire lui-même.
- **`initial-view`** : lu depuis `?view=...` dans l'URL de la page hôte,
  complète le second lien de sidebar (section 1, "Gérer mes indicateurs").
  Sans lui, `<indicateurs-app>` démarre toujours sur le tableau de bord.
  Avec `initial-view="indicators"`, il démarre directement sur la page
  d'activation.
- **`context-*`** : lus depuis `?contextType=...&activityId=...` etc., pour
  ouvrir les indicateurs d'un cours/une activité précis (voir élément 4
  ci-dessous, qui fournit ces query params). `contextType` vaut `'activity'`
  ou `'course'` (pas de valeur pour un groupe, les indicateurs de groupe
  apparaissent dans les deux cas, dans leur propre section). Sans
  `context-type`, le widget démarre simplement sur le tableau de bord. S'il
  est fourni, il prend le pas sur `initial-view` : le lien
  "Voir les indicateurs" d'une page cours/activité reste prioritaire sur
  n'importe quel lien de sidebar. Depuis la page de détail d'un indicateur
  atteinte ainsi, un lien "Retour au cours"/"Retour à l'activité" ramène à
  cette même vue, navigation interne au widget, rien de plus à fournir côté
  PLaTon.

### 4. Un lien depuis les pages cours/activité (optionnel)

Sans lui, l'onglet Indicateurs ne montre que les indicateurs personnels
(apprenant/enseignant/admin) et la liste d'activation, jamais les
indicateurs scopés à un cours, une activité ou un groupe précis, qui
resteraient inaccessibles depuis PLaTon. Pour les rendre atteignables,
ajouter un lien « Voir les indicateurs » sur les pages natives cours/activité
de PLaTon, pointant vers la page hôte avec le contexte en query params :

```ts
// Sur la page d'activité PLaTon (apps/web/src/app/pages/activities/activity/)
this.router.navigate(['/indicateurs'], {
  queryParams: {
    contextType: 'activity',
    activityId: this.activity.id,
    courseId: this.course.id,
    activityName: this.activity.title,
    courseName: this.course.name,
  },
})
```

## Ce qu'Indicateurs fournit de son côté (pour information, pas à faire par PLaTon)

- Le script `main.js` (et son CSS associé), buildé depuis un second
  point d'entrée du même dépôt Indicateurs, sans le module admin, sans les
  `platon-stubs/`, sans la sidebar/toolbar propre à l'app autonome.
- Le contrat de la balise `<indicateurs-app>` : un seul attribut obligatoire,
  le jeton d'accès (`access-token`) ; `user` est indispensable pour que le
  rôle soit le bon ;
  `initial-view` et `context-*` optionnels (voir section 3). Le routage interne
  reste entièrement géré par Indicateurs lui-même, via une `LocationStrategy`
  purement interne plutôt qu'en hash routing : le routage du widget ne touche
  jamais l'URL visible de PLaTon, dans un sens comme dans l'autre.

## Décisions

- **Code côté PLaTon** : reste à l'état de spec dans ce document, non
  implémenté. Indicateurs ne modifie pas le dépôt PLaTon ; c'est à l'équipe
  PLaTon de reprendre les 4 éléments ci-dessus quand elle sera prête.
- **Où héberger le script** `main.js` : servi directement par le serveur
  d'Indicateurs (son propre domaine, chemin `/embed/`), pas copié/proxifié
  par PLaTon. Choix indépendant du LMS hôte : Indicateurs n'est pas destiné
  à PLaTon exclusivement, et un hébergement propre à Indicateurs évite de
  reconfigurer un nginx différent à chaque nouvelle intégration. PLaTon
  charge donc le script et le CSS depuis une origine différente de la
  sienne, ce qui demande du CORS à deux endroits : l'API Indicateurs pour les
  appels de données (`api/src/main.ts`, déjà permissive en prod,
  `origin: true`), et nginx pour les fichiers du widget, car les
  `<script type="module">` y sont soumis (voir « Point de vigilance » plus
  haut et [limites-connues.md](../architecture/limites-connues.md)).
