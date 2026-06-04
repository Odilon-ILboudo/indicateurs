// web/src/app/pages/dashboard/overview/overview.page.ts
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { IndicatorCardComponent } from '../../../../shared/ui/indicator-card/indicator-card.component';
import { TeacherContextSelectorComponent } from '../widgets/teacher-context-selector/teacher-context-selector.component';
import { IndicatorService } from '../../../../core/services/indicator.service';
import { DashboardSettingsService } from '../../../../core/services/dashboard-settings.service';
import { RoleService } from '../../../../core/services/role.service';
import { DashboardContext, IndicatorDefinition } from '../../../../core/models/indicator.model';
import { environment } from '../../../../../environments/environment';

@Component({
  standalone: true,
  selector: 'app-overview',
  templateUrl: './overview.page.html',
  styleUrls: ['./overview.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, RouterModule, FormsModule,
    MatIconModule, MatCardModule,
    NzGridModule, NzSkeletonModule,
    IndicatorCardComponent,
    TeacherContextSelectorComponent,
  ],
})
export class OverviewPage implements OnInit, OnDestroy {
  private readonly subscriptions: Subscription[] = [];
  private readonly indicatorService = inject(IndicatorService);
  private readonly settingsService = inject(DashboardSettingsService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  protected readonly roleService = inject(RoleService);

  protected indicators: IndicatorDefinition[] = [];
  protected activeIndicatorIds: string[] = [];
  protected loading = true;

  protected context: DashboardContext = {
    scope: 'learner',
    scopeId: environment.defaultUserId,
    userId: environment.defaultUserId,
    academicYear: '2024-2025',
    semester: 'S1',
  };

  async ngOnInit(): Promise<void> {
    // Restaurer le contexte teacher si une sélection précédente existe
    const saved = this.settingsService.getTeacherState();
    if (saved.context) {
      this.context = saved.context;
    }
    this.loadActiveIndicators();
    this.loadIndicators();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  protected onTeacherContextChange(ctx: DashboardContext): void {
    this.context = ctx;
    this.changeDetectorRef.markForCheck();
  }

  private loadActiveIndicators(): void {
    this.subscriptions.push(
      this.settingsService.getSettings().subscribe(settings => {
        this.activeIndicatorIds = settings.activeIndicators;
        this.changeDetectorRef.markForCheck();
      })
    );
  }

  private loadIndicators(): void {
    this.loading = true;
    this.subscriptions.push(
      this.indicatorService.loadIndicators().subscribe(indicators => {
        this.indicators = indicators;
        this.loading = false;
        this.changeDetectorRef.markForCheck();
      })
    );
  }

  protected getIndicatorById(id: string): IndicatorDefinition | undefined {
    return this.indicators.find(i => i.id === id);
  }
}
