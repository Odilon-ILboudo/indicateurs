// frontend/src/app/core/services/dashboard-settings.service.ts
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { IndicatorService } from './indicator.service';
import { RoleService } from './role.service';
import { UserDashboardSettings } from '../models/indicator.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DashboardSettingsService {
  private readonly indicatorService = inject(IndicatorService);
  private readonly roleService = inject(RoleService);

  private currentUserId: string = environment.defaultUserId;
  private settings$ = new BehaviorSubject<UserDashboardSettings>({
    dismissedToast: false,
    activeIndicators: [],
    favoriteIndicators: [],
    layout: { columns: 3 },
  });

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    this.indicatorService.getUserPreferences(this.currentUserId).subscribe({
      next: (preferences) => {
        this.settings$.next({
          dismissedToast: false,
          activeIndicators: preferences.activeIndicators || [],
          favoriteIndicators: [],
          layout: { columns: 3 },
        });
      },
      error: (error) => {
        console.error('Failed to load dashboard settings', error);
        // Utiliser les préférences par défaut en cas d'erreur
        this.settings$.next({
          dismissedToast: false,
          activeIndicators: [],
          favoriteIndicators: [],
          layout: { columns: 3 },
        });
      },
    });
  }

  getSettings(): Observable<UserDashboardSettings> {
    return this.settings$.asObservable();
  }

  dismissToast(): void {
    const settings = this.settings$.value;
    this.settings$.next({ ...settings, dismissedToast: true });
  }

  addActiveIndicator(indicatorId: string): void {
    const settings = this.settings$.value;
    if (!settings.activeIndicators.includes(indicatorId)) {
      const role = this.roleService.getRole();
      this.indicatorService.setUserIndicatorVisibility(this.currentUserId, indicatorId, true, role).subscribe({
        next: () => {
          this.settings$.next({
            ...settings,
            activeIndicators: [...settings.activeIndicators, indicatorId],
          });
        },
        error: (error) => console.error('Failed to persist active indicator', error),
      });
    }
  }

  removeActiveIndicator(indicatorId: string): void {
    const settings = this.settings$.value;
    if (settings.activeIndicators.includes(indicatorId)) {
      const role = this.roleService.getRole();
      this.indicatorService.setUserIndicatorVisibility(this.currentUserId, indicatorId, false, role).subscribe({
        next: () => {
          this.settings$.next({
            ...settings,
            activeIndicators: settings.activeIndicators.filter(id => id !== indicatorId),
          });
        },
        error: (error) => console.error('Failed to persist active indicator removal', error),
      });
    }
  }

  isActiveIndicator(indicatorId: string): boolean {
    return this.settings$.value.activeIndicators.includes(indicatorId);
  }

  toggleFavorite(indicatorId: string): void {
    const settings = this.settings$.value;
    const favoriteIndicators = [...settings.favoriteIndicators];
    const index = favoriteIndicators.indexOf(indicatorId);

    if (index === -1) {
      favoriteIndicators.push(indicatorId);
    } else {
      favoriteIndicators.splice(index, 1);
    }

    this.settings$.next({
      ...settings,
      favoriteIndicators,
    });
  }

  updateLayout(columns: number): void {
    const settings = this.settings$.value;
    this.settings$.next({
      ...settings,
      layout: { columns },
    });
  }
}