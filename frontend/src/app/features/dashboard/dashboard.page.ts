import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DashboardSettingsService } from '../../core/services/dashboard-settings.service';
import { UserDashboardSettings } from '../../core/models/indicator.model';
import { SidebarComponent } from './pages/widgets/sidebar/sidebar.component';
import { ToolbarComponent } from './pages/widgets/toolbar/toolbar.component';

@Component({
  standalone: true,
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, RouterModule,
    MatIconModule, MatButtonModule, MatToolbarModule, MatSidenavModule, SidebarComponent, ToolbarComponent
  ],
})
export class DashboardPage {
  protected drawerOpened = false;
  protected settings: UserDashboardSettings = { dismissedToast: false, activeIndicators: [], favoriteIndicators: [], layout: { columns: 3 } };
  
  private settingsService = inject(DashboardSettingsService);
  
  constructor() {
    this.settingsService.getSettings().subscribe(settings => {
      this.settings = settings;
    });
  }
  
  protected dismissToast(): void {
    this.settingsService.dismissToast();
  }
}