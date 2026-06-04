// frontend/src/app/widgets/sidebar/sidebar.component.ts
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { User, UserService } from '../../../../../core/services/user.service';
import { RoleService } from '../../../../../core/services/role.service';
import { environment } from '../../../../../../environments/environment';

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
  private readonly userService = inject(UserService);

  // l'ID depuis environment
  private readonly USER_ID = environment.defaultUserId;

  async ngOnInit(): Promise<void> {
    await this.loadUser();
    this.buildNavigationLinks();
    this.changeDetectorRef.markForCheck();
  }

  private async loadUser(): Promise<void> {
    try {
      const response = await this.userService.getUserById(this.USER_ID).toPromise();
      if (response?.success && response.data) {
        this.user = response.data;
        this.roleService.setRole(this.user.role);
      } else {
        console.error('Utilisateur non trouvé');
        this.setDefaultUser();
      }
    } catch (error) {
      console.error('Erreur lors du chargement de l\'utilisateur:', error);
      this.setDefaultUser();
    }
  }

  private setDefaultUser(): void {
    this.user = {
      id: this.USER_ID,
      username: 'default',
      firstName: 'Utilisateur',
      lastName: 'Défaut',
      role: 'student',
      email: '',
    };
    this.roleService.setRole('student');
  }

  private buildNavigationLinks(): void {
    this.topLinks.push(
      { url: 'overview', icon: 'dashboard', title: 'Tableau de bord' },
      { url: 'indicators', icon: 'analytics', title: 'Indicateurs' },
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