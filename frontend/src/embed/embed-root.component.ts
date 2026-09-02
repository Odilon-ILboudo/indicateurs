// Racine du point d'entrée embarqué - <indicateurs-app>, montée par PLaTon. Pas de
// sidebar/toolbar interne (fournies par PLaTon) ni de flux de connexion (jeton et utilisateur
// arrivent via les attributs de la balise).
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
  @Input() user?: string; // JSON stringifié d'un EmbeddedUser
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
    // createCustomElement() ne passe pas par le bootstrap standard d'Angular : la navigation
    // initiale du routeur ne se déclenche jamais sans cet appel explicite.
    this.router.initialNavigation();
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
  }
}
