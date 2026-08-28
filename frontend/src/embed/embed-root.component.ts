// Racine du point d'entrée embarqué - <indicateurs-app>, montée par PLaTon.
// Volontairement légère : pas de sidebar/toolbar (fournies par PLaTon), pas de flux de
// connexion (le jeton et l'utilisateur arrivent déjà via les attributs de la balise).
// Voir docs/integration-indicateurs.md §1 pour le contrat complet.
//
// Important, trouvé en testant : dans l'app standalone, c'est SidebarComponent#loadUser() (un
// appel réseau) qui appelle RoleService.setRole() avec le vrai rôle - le service démarre sur
// 'student' par défaut sinon. La sidebar n'étant jamais montée ici (PLaTon fournit la sienne),
// rien n'appelait cette mise à jour : tous les indicateurs "teacher"/"admin" restaient invisibles
// silencieusement, sans erreur. RoleService.loadRoleFromStorage() existait déjà pour ce cas
// précis mais n'était jamais appelée seule - on l'appelle donc explicitement ici.
//
// Pas de nav interne (Tableau de bord / Indicateurs) - décision explicite : PLaTon expose
// plusieurs liens de sidebar qui montent chacun ce même composant avec un `initial-view`
// différent (voir docs/integration-platon.md §7bis), plutôt qu'un sélecteur dupliqué à
// l'intérieur du widget. `initial-view` ('overview' par défaut, ou 'indicators') choisit la
// page de départ ; `context-type`, quand fourni, prend le pas dessus (voir plus bas).
//
// Les attributs context-* sont optionnels : PLaTon les fournit quand l'utilisateur arrive
// depuis un lien "Voir les indicateurs" sur une page cours/activité native (voir
// docs/integration-platon.md §7) - sans eux, le widget démarre sur `initial-view` (ou
// /overview par défaut). Sans ce mécanisme, les indicateurs scopés cours/activité/groupe
// resteraient totalement inaccessibles depuis l'onglet Indicateurs embarqué.
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnInit, SimpleChanges, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { RoleService } from '../app/core/services/role.service';
import { ROUTE_BASE_PATH } from '../app/core/tokens/route-base-path.token';

interface EmbeddedUser {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

@Component({
  standalone: true,
  selector: 'indicateurs-app',
  imports: [RouterModule],
  template: `<router-outlet />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmbedRootComponent implements OnInit, OnChanges {
  @Input('access-token') accessToken?: string;
  @Input() user?: string; // JSON stringifié d'un EmbeddedUser, voir docs/integration-platon.md
  // 'overview' (défaut) ou 'indicators' - quelle page monter en premier. Permet à PLaTon
  // d'avoir deux liens de sidebar distincts vers ce même composant (voir en tête de fichier).
  @Input('initial-view') initialView?: 'overview' | 'indicators';
  @Input('context-type') contextType?: 'activity' | 'course';
  @Input('context-activity-id') contextActivityId?: string;
  @Input('context-course-id') contextCourseId?: string;
  @Input('context-activity-name') contextActivityName?: string;
  @Input('context-course-name') contextCourseName?: string;

  protected readonly routeBasePath = inject(ROUTE_BASE_PATH, { optional: true }) ?? '';

  private readonly router = inject(Router);
  private readonly roleService = inject(RoleService);
  private navigated = false;

  ngOnInit(): void {
    // createCustomElement() monte ce composant sans passer par le bootstrap standard
    // d'Angular (ApplicationRef.bootstrap()) - la navigation initiale du routeur, normalement
    // déclenchée automatiquement à ce moment-là, ne l'est donc jamais ici sans cet appel.
    this.router.initialNavigation();
    // Après, pas avant : ngOnChanges (qui peuple contextType/initialView) s'exécute avant
    // ngOnInit pour les valeurs initiales des attributs, mais appeler router.navigate() avant
    // initialNavigation() serait risqué (routeur pas encore démarré) - on relit donc ici.
    this.navigateToInitialViewIfNeeded();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['accessToken'] && this.accessToken) {
      localStorage.setItem('accessToken', this.accessToken);
    }
    if (changes['user'] && this.user) {
      try {
        const parsed = JSON.parse(this.user) as EmbeddedUser;
        localStorage.setItem('currentUser', this.user);
        localStorage.setItem('userRole', parsed.role);
        this.roleService.loadRoleFromStorage();
      } catch {
        console.error('[indicateurs-app] attribut "user" invalide, JSON attendu.');
      }
    }
    // Si un changement arrive APRÈS le premier rendu (peu probable en pratique, PLaTon
    // fournissant tout d'un coup au montage, mais couvert par sécurité) : ngOnInit est déjà
    // passé à ce stade, donc router.navigate() est sûr à appeler directement ici.
    if ((changes['contextType'] || changes['initialView']) && this.navigated) {
      this.navigated = false;
      this.navigateToInitialViewIfNeeded();
    }
  }

  private navigateToInitialViewIfNeeded(): void {
    if (this.navigated) return;
    this.navigated = true;

    if (this.contextType) {
      this.router.navigate([this.routeBasePath + '/context'], {
        queryParams: {
          contextType: this.contextType,
          activityId: this.contextActivityId,
          courseId: this.contextCourseId,
          activityName: this.contextActivityName,
          courseName: this.contextCourseName,
        },
      });
      return;
    }

    if (this.initialView === 'indicators') {
      this.router.navigate([this.routeBasePath + '/indicators']);
    }
    // Sinon, laisse la redirection par défaut de embed.routes.ts ('' -> 'overview') faire son
    // travail, déjà déclenchée par router.initialNavigation() ci-dessus.
  }
}
