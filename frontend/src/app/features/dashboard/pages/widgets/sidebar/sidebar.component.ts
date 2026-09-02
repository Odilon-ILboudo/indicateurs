import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { firstValueFrom } from 'rxjs';
import { User, UserService } from '../../../../../core/services/user.service';
import { RoleService } from '../../../../../core/services/role.service';
import { AuthProvider } from '../../../../../core/auth/auth.types';

type NavLink = {
  url?: string | null;
  icon: string;
  title: string;
  external?: boolean;
  children?: NavLink[];
};

@Component({
  standalone: true,
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  imports: [CommonModule, RouterModule, MatIconModule, NzModalModule],
})
export class SidebarComponent implements OnInit {
  protected readonly topLinks: NavLink[] = [];
  protected readonly bottomLinks: NavLink[] = [];
  protected readonly expandedLinks = new Set<string>();
  protected readonly asNavLink = (o: unknown) => o as NavLink;
  protected user: User | null = null;

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly roleService = inject(RoleService);
  private readonly authProvider = inject(AuthProvider);
  private readonly userService = inject(UserService);

  async ngOnInit(): Promise<void> {
    await this.loadUser();
    this.buildNavigationLinks();
    this.changeDetectorRef.markForCheck();
  }

  private async loadUser(): Promise<void> {
    try {
      const authUser = await this.authProvider.current()
      if (!authUser) return;

      // Le rôle dans authProvider vient de PLaTon production (token OAuth).
      // On interroge le backend indicateurs qui lit la DB locale PLaTon,
      // source de vérité pour le rôle en développement.
      let role = authUser.role as User['role'];
      try {
        const response = await firstValueFrom(this.userService.getUserById(authUser.id));
        if (response?.success && response.data?.role) {
          role = response.data.role;
        }
      } catch {
        // Fallback sur le rôle du token si le backend est inaccessible
      }

      this.user = {
        id: authUser.id,
        username: authUser.username,
        firstName: authUser.firstName ?? '',
        lastName: authUser.lastName ?? '',
        role,
        email: authUser.email ?? '',
      };
      this.roleService.setRole(role);
    } catch (error) {
      console.error('Erreur lors du chargement de l\'utilisateur:', error)
    }
  }

  private buildNavigationLinks(): void {
    this.topLinks.push(
      { url: 'overview', icon: 'dashboard', title: 'Tableau de bord' },
      { url: 'indicators', icon: 'analytics', title: 'Indicateurs' },
      { url: 'courses', icon: 'local_library', title: 'Cours' },
      { url: 'resources', icon: 'work', title: 'Espace de travail' },
    );
  }

  protected toggleLink(link: NavLink): void {
    if (link.url) return;
    if (this.expandedLinks.has(link.title)) {
      this.expandedLinks.delete(link.title);
    } else {
      this.expandedLinks.add(link.title);
    }
  }

  protected generateId(title: string): string {
    return 'tuto-sidebar-' + title.toLowerCase().replace(/ /g, '-');
  }
}