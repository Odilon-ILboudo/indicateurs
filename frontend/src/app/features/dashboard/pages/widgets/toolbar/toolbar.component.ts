import { CommonModule } from '@angular/common';
import { Component, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { User, UserService } from '../../../../../core/services/user.service';
import { getCurrentUserId } from '../../../../../core/auth/current-user';
import { AuthProvider } from '../../../../../core/auth/auth.types';

@Component({
  standalone: true,
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.scss'],
  imports: [CommonModule, MatIconModule, MatButtonModule, MatMenuModule, MatDividerModule, NzButtonModule],
})
export class ToolbarComponent implements OnInit {
  @Output() drawerToggle = new EventEmitter<void>();

  private readonly userService = inject(UserService);
  private readonly authProvider = inject(AuthProvider);
  private readonly router = inject(Router);

  protected user: User | null = null;
  protected isDarkTheme = false;

  private readonly USER_ID = getCurrentUserId();

  get themeIcon(): string {
    return this.isDarkTheme ? 'dark_mode' : 'light_mode';
  }

  async ngOnInit(): Promise<void> {
    await this.loadUser();
    this.loadThemePreference();
  }

  private async loadUser(): Promise<void> {
    try {
      const response = await this.userService.getUserById(this.USER_ID).toPromise();
      
      if (response?.success && response.data) {
        this.user = response.data;
      } else {
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
  }

  private loadThemePreference(): void {
    const savedTheme = localStorage.getItem('theme');
    this.isDarkTheme = savedTheme === 'dark';
    this.applyTheme();
  }

  private applyTheme(): void {
    if (this.isDarkTheme) {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    }
  }

  toggleDrawer(): void {
    this.drawerToggle.emit();
  }

  setLightTheme(): void {
    this.isDarkTheme = false;
    localStorage.setItem('theme', 'light');
    this.applyTheme();
  }

  setDarkTheme(): void {
    this.isDarkTheme = true;
    localStorage.setItem('theme', 'dark');
    this.applyTheme();
  }

  async logout(): Promise<void> {
    await this.authProvider.signOut();
    this.router.navigate(['/authentification']);
  }
}