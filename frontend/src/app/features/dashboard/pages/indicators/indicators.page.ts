// web/src/app/pages/dashboard/indicators/indicators.page.ts
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { IndicatorSelectorComponent } from '../../../indicator-selector/indicator-selector.component';
import { AdminIndicatorManagerComponent } from '../../../admin/admin-indicator-manager.component';
import { IndicatorService } from '../../../../core/services/indicator.service';
import { RoleService } from '../../../../core/services/role.service';

@Component({
  standalone: true,
  selector: 'app-indicators',
  templateUrl: './indicators.page.html',
  styleUrls: ['./indicators.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatCardModule,
    NzGridModule,
    NzSkeletonModule,
    NzTabsModule, 
    IndicatorSelectorComponent,
    AdminIndicatorManagerComponent
  ],
})
export class IndicatorsPage implements OnInit, OnDestroy {
  private readonly subscriptions: Subscription[] = [];
  private readonly indicatorService = inject(IndicatorService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  protected readonly roleService = inject(RoleService);

  protected loading = true;
  protected activeTab = 0;

  async ngOnInit(): Promise<void> {
    this.loadIndicators();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  private loadIndicators(): void {
    this.loading = true;

    this.subscriptions.push(
      this.indicatorService.loadIndicators().subscribe(() => {
        this.loading = false;
        this.changeDetectorRef.markForCheck();
      })
    );
  }

  protected onIndicatorsChanged(): void {
    this.loadIndicators(); // Recharger pour mettre à jour les compteurs
    this.changeDetectorRef.markForCheck();
  }

}