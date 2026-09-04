# Intégration dans PLaTon : ce qu'il faut faire côté PLaTon

Ce document décrit précisément ce que l'équipe PLaTon doit ajouter à son propre
dépôt pour faire apparaître un onglet "Indicateurs" dans sa navigation, visible
uniquement aux enseignants et aux étudiants (jamais aux administrateurs, qui
continuent d'utiliser l'interface actuelle d'Indicateurs telle quelle). Rien de
ce qui suit ne peut être fait depuis le dépôt Indicateurs seul - ce sont des
modifications du code de PLaTon, qui appartiennent à son équipe.

Le point d'entrée `<indicateurs-app>` décrit ici est implémenté et testé côté
Indicateurs (voir [`docs/integration-indicateurs.md`](./integration-indicateurs.md))
- backend réel, jeton de test, Chromium headless : la balise s'affiche, se
connecte à l'API, respecte la séparation admin/non-admin sans modification du
code métier. Ce qui suit reste donc à faire, mais s'appuie sur du code qui
fonctionne réellement, pas sur un plan non vérifié.

**Tâche distincte, non couverte ici** : le relais d'événements
(`platon_outbox_events` → RabbitMQ), nécessaire pour que les indicateurs se
mettent à jour en temps réel, vit lui aussi désormais côté PLaTon - voir
[`docs/integration-platon-relay.md`](./integration-platon-relay.md) pour ce
second ajout, indépendant de l'onglet "Indicateurs" décrit ici.

## Principe

Indicateurs expose un second point d'entrée de build - en plus de son
application autonome actuelle, réservée aux administrateurs - compilé comme un
[Web Component](https://developer.mozilla.org/fr/docs/Web/API/Web_components)
(`@angular/elements`) : une balise HTML personnalisée, `<indicateurs-app>`, que
n'importe quelle page peut charger via un simple `<script>`, sans que PLaTon
ait besoin de connaître Angular côté Indicateurs ni de partager sa version
d'Angular au moment de la compilation (testé : les deux applications Angular
séparées, avec ou sans double chargement de `zone.js`, cohabitent sans conflit
sur une même page - voir le test empirique correspondant).

## Ce que PLaTon doit ajouter (6 éléments)

### 1. Deux liens dans la sidebar

Fichier : `apps/web/src/app/widgets/sidebar/sidebar.component.ts`, dans
`ngOnInit()`, à côté des autres liens conditionnels (`isTeacherRole`,
`UserRoles.admin`). Deux liens plutôt qu'un seul, décision explicite validée
sur le simulateur (voir `integration-indicateurs.md` §"Points d'entrée sidebar") : pas de
sélecteur de page à l'intérieur du widget, chaque lien mène directement à
la bonne page via `initial-view` (§6bis) :

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
`url` - à ajouter si absent, `RouterModule` le consomme nativement via
`[queryParams]` sur le `routerLink`.)

Important : ne **pas** utiliser `isTeacherRole()` (le helper existant) pour ces
liens - cette fonction inclut aussi `UserRoles.admin`
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

C'est la seule pièce réellement nouvelle à concevoir côté PLaTon - un petit
composant Angular dont le seul rôle est de charger le script d'Indicateurs et
de monter la balise, avec le jeton d'authentification déjà disponible côté
PLaTon :

```ts
@Component({
  standalone: true,
  selector: 'app-indicateurs-page',
  template: `<indicateurs-app #el [attr.access-token]="accessToken"></indicateurs-app>`,
})
export class IndicateursPage implements OnInit, AfterViewInit {
  private readonly authService = inject(AuthService);
  @ViewChild('el') el!: ElementRef<HTMLElement & { user?: string }>;
  protected accessToken?: string;

  async ngOnInit() {
    const token = await this.authService.token(); // AuthService.token(), déjà existant
    this.accessToken = token?.accessToken;
    // Chemin retenu (voir "Décisions actées" en fin de doc) : servi par le serveur
    // d'Indicateurs, pas par PLaTon - domaine à remplacer par le vrai domaine d'Indicateurs.
    await import('https://<domaine-indicateurs>/embed/main.js');
  }

  ngAfterViewInit() {
    // Indispensable, pas optionnel : sans lui, RoleService démarre sur 'student' par défaut et
    // tous les indicateurs teacher/admin restent invisibles, sans la moindre erreur (voir §10
    // de integration-indicateurs.md - le bug le plus sérieux trouvé pendant l'implémentation).
    // this.currentUser : objet PLaTon déjà disponible côté app hôte (id/username/firstName/
    // lastName/email/role/active/createdAt/updatedAt), à adapter au type réel utilisé ici.
    this.el.nativeElement.user = JSON.stringify(this.currentUser);
  }
}
```

`AuthService.token()` existe déjà
(`libs/core/browser/src/lib/auth/api/auth.service.ts:33`) - c'est la même
méthode que celle déjà utilisée ailleurs dans PLaTon, rien à ajouter de ce
côté.

### 4. Une feuille de style, en plus du script

Le CSS n'est **pas** injecté par le script JS - la page hôte doit aussi
charger le CSS produit par le build embarqué d'Indicateurs, en plus de
`<script>`/`import()`. Un seul fichier (`styles.css`, ~900 Ko brut / ~65 Ko
compressé) : fusionné au build à partir de trois fichiers séparés au départ
(normalize + police d'icônes Material + variables, thème ng-zorro, thème
Material) - simplifié depuis pour n'avoir qu'un seul `<link>` à poser, sur
demande explicite. Ordre de fusion figé et testé (`app.scss` puis ng-zorro
puis Material) - à ne pas modifier sans retester le rendu.

```html
<link rel="stylesheet" href="https://<domaine-indicateurs>/embed/styles.css">
```

### 5. Écouter l'expiration du jeton

L'élément embarqué ne peut pas rediriger lui-même vers un écran de connexion
(son routeur interne ne connaît que les pages Indicateurs). Sur un jeton
expiré, il émet un évènement DOM `indicateurs-token-expired` sur lui-même
(bouillonnant) plutôt que de naviguer :

```ts
document.querySelector('indicateurs-app')
  ?.addEventListener('indicateurs-token-expired', () => {
    // rafraîchir le jeton PLaTon puis re-fournir `access-token`, ou
    // rediriger l'utilisateur vers la connexion PLaTon - au choix de l'équipe.
  })
```

### 6. `context-*` (optionnels) - pour voir les indicateurs d'un cours/une activité précis

Sans ces attributs, l'onglet Indicateurs ne montre que les indicateurs
personnels (apprenant/enseignant/admin) et la liste d'activation - jamais
les indicateurs scopés à un cours, une activité ou un groupe précis, qui
resteraient inaccessibles depuis PLaTon. Pour les rendre atteignables,
ajouter un lien "Voir les indicateurs" sur les pages natives cours/activité
de PLaTon, pointant vers la page qui monte `<indicateurs-app>` avec le
contexte en query params :

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

La page hôte (§3) lit ces query params sur sa propre route et les
retransmet en attributs `context-*` :

```ts
@Component({
  template: `
    <indicateurs-app
      [attr.access-token]="accessToken"
      [attr.context-type]="contextType"
      [attr.context-activity-id]="contextActivityId"
      [attr.context-course-id]="contextCourseId"
      [attr.context-activity-name]="contextActivityName"
      [attr.context-course-name]="contextCourseName">
    </indicateurs-app>
  `,
})
export class IndicateursPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  protected contextType?: string;
  protected contextActivityId?: string;
  protected contextCourseId?: string;
  protected contextActivityName?: string;
  protected contextCourseName?: string;

  ngOnInit() {
    const q = this.route.snapshot.queryParams;
    this.contextType = q['contextType'];
    this.contextActivityId = q['activityId'];
    this.contextCourseId = q['courseId'];
    this.contextActivityName = q['activityName'];
    this.contextCourseName = q['courseName'];
    // ... reste du contrat §3
  }
}
```

`contextType` vaut `'activity'` ou `'course'` (pas de valeur pour un
groupe - les indicateurs de groupe apparaissent dans les deux cas, dans
leur propre section). Sans `context-type`, le widget démarre simplement
sur le tableau de bord comme avant - aucune régression pour une
intégration qui ne fournirait pas ces attributs.

Testé dans le simulateur (voir `integration-indicateurs.md` §"Accès aux indicateurs scopés...") : clic réel
depuis une page d'activité/cours factice jusqu'à la bonne vue d'indicateurs,
avec panneau de groupe et bouton de comparaison fonctionnels.

Depuis la page de détail d'un indicateur atteinte ainsi, un lien "Retour au
cours"/"Retour à l'activité" ramène à cette même vue - navigation interne
au widget, rien à fournir côté PLaTon pour que ce lien fonctionne.

### 6bis. `initial-view` (optionnel) - pour le second lien de sidebar

Complète le lien "Gérer mes indicateurs" du §1 : sans lui, `<indicateurs-app>`
démarre toujours sur le tableau de bord (cartes personnelles). Avec
`initial-view="indicators"`, il démarre directement sur la page d'activation -
pas de sélecteur intermédiaire à l'intérieur du widget, la sidebar PLaTon
jouant déjà ce rôle (voir `integration-indicateurs.md`
§"Points d'entrée sidebar").

```html
<indicateurs-app
  [attr.access-token]="accessToken"
  [attr.initial-view]="route.snapshot.queryParams['view']">
</indicateurs-app>
```

`context-type` (§6), s'il est fourni, prend le pas sur `initial-view` - le
lien "Voir les indicateurs" d'une page cours/activité reste prioritaire sur
n'importe quel lien de sidebar.

## Ce qu'Indicateurs fournit de son côté (pour information, pas à faire par PLaTon)

- Le script `main.js` (et son CSS associé), buildé depuis un second
  point d'entrée du même dépôt Indicateurs - sans le module admin, sans les
  `platon-stubs/`, sans la sidebar/toolbar propre à l'app autonome (confirmé :
  aucun des écrans concernés - tableau de bord, sélection/activation des
  indicateurs, détail, familles - ne dépend de code admin ni de `@platon/*`).
- Le contrat de la balise `<indicateurs-app>` : un seul attribut/`@Input()`
  requis, le jeton d'accès (`access-token`) ; `user` fortement recommandé
  (voir §3) ; `initial-view` (§6bis) et `context-*` (§6) optionnels. Le
  routage interne
  (tableau de bord ↔ liste ↔ détail) reste entièrement gardé par Indicateurs
  lui-même, via une `LocationStrategy` purement interne plutôt qu'en hash
  routing (voir `integration-indicateurs.md` §"Routage interne isolé") : le routage du widget ne
  touche jamais l'URL visible de PLaTon, dans un sens comme dans l'autre -
  zéro risque de collision, mais aussi zéro deep-link direct vers une vue
  précise du widget depuis l'extérieur (voir Ouvert).

## Décisions actées

- **Code côté PLaTon** : reste à l'état de spec dans ce document, non
  implémenté. Décision explicite - Indicateurs ne modifie pas le dépôt
  PLaTon ; c'est à l'équipe PLaTon de reprendre les 6 éléments ci-dessus
  quand elle sera prête.
- **Pas testé contre le PLaTon complet et continu** - accepté comme limite de
  fait, pas comme question ouverte : PLaTon réel (Nx, API NestJS, ~20 libs
  `@platon/feature/*`) est trop lourd pour tourner durablement sur toutes les
  machines de dev. Le test s'appuie donc sur un simulateur léger qui
  reproduit fidèlement ce qui compte pour ce test (mêmes versions, vrais
  fichiers CSS, vraie config de routeur, fidélité validée en démarrant une
  fois le vrai PLaTon en local - voir `integration-indicateurs.md`
  §"Simulateur de test en conditions réelles PLaTon") mais
  pas les ~20 autres libs `@platon/feature/*` chargées simultanément, ni le
  vrai CSP, ni la vraie authentification CAS. **Cette dernière validation en
  conditions réelles complètes reste la responsabilité de l'équipe PLaTon**,
  une fois les 6 éléments ci-dessus implémentés de leur côté.
- **Où héberger le script** `main.js` : servi directement par le serveur
  d'Indicateurs (son propre domaine, chemin `/embed/`), pas copié/proxifié
  par PLaTon. Choix indépendant du LMS hôte : Indicateurs n'est pas destiné
  à PLaTon exclusivement, et un hébergement propre à Indicateurs évite de
  reconfigurer un nginx différent à chaque nouvelle intégration. PLaTon
  charge donc le script et le CSS depuis une origine différente de la
  sienne - nécessite que l'API Indicateurs autorise ces requêtes cross-origin
  (CORS), voir `api/src/main.ts`, déjà permissive en prod (`origin: true`).
  Retenu comme choix par défaut ; à reconsidérer si l'équipe PLaTon propose
  une autre méthode d'hébergement une fois les 6 éléments ci-dessus
  implémentés de leur côté.

## Ce qui reste à trancher ensemble (pas encore décidé)

- **Versionnage** : comment PLaTon sait quelle version du script charger, et
  qui est responsable de la mise à jour du chemin/URL quand Indicateurs publie
  une nouvelle version.
- **Icône exacte** du lien de sidebar (`insights` proposé, à valider avec
  l'équipe PLaTon pour rester cohérent avec les autres icônes déjà en place).
