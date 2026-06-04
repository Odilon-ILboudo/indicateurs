// frontend/src/app/features/activity-indicator/activity-indicator.component.ts
import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { ActivityIndicatorService, ActivityAttemptsData } from '../../core/services/activity-indicator.service';
import { IndicatorService } from '../../core/services/indicator.service';

@Component({
  selector: 'ui-activity-indicator',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatCardModule, NzStatisticModule, NzProgressModule, NzSpinModule, NzButtonModule],
  templateUrl: './activity-indicator.component.html',
  styleUrls: ['./activity-indicator.component.scss'],
})
export class ActivityIndicatorComponent implements OnInit {
  @Input() userId!: string;
  @Input() activityId!: string;
  @Input() activityName?: string;

  private readonly service = inject(ActivityIndicatorService);
  private readonly indicatorService = inject(IndicatorService);

  data: ActivityAttemptsData | null = null;
  loading = true;
  error = false;
  private indicatorId: string = '';

  ngOnInit(): void {
    this.loadIndicatorId();
  }

  private loadIndicatorId(): void {
    // Récupérer l'ID de l'indicateur "Tentatives avant première réussite"
    this.indicatorService.loadIndicators().subscribe({
      next: (indicators) => {
        // Chercher l'indicateur par son nom
        const indicator = indicators.find(i => i.name === 'Tentatives avant première réussite');
        if (indicator) {
          this.indicatorId = indicator.id;
          this.loadData();
        } else {
          console.error('Indicateur non trouvé');
          this.error = true;
          this.loading = false;
        }
      },
      error: (error) => {
        console.error('Erreur lors du chargement des indicateurs:', error);
        this.error = true;
        this.loading = false;
      }
    });
  }

  private loadData(): void {
    if (!this.indicatorId) {
      console.error('Indicator ID not set');
      this.error = true;
      this.loading = false;
      return;
    }

    this.loading = true;
    this.service.getValue(this.userId, this.activityId, this.indicatorId).subscribe({
      next: (data) => {
        this.data = data;
        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des données:', error);
        this.error = true;
        this.loading = false;
      },
    });
  }

  refresh(): void {
    this.loadData();
  }

  getPercent(value: number): number {
    if (value <= 1) return 100;
    if (value <= 3) return 70;
    if (value <= 5) return 40;
    return 20;
  }

  getColor(value: number): string {
    if (value <= 1) return '#52c41a';
    if (value <= 3) return '#faad14';
    return '#f5222d';
  }

  getInterpretation(value: number): string {
    if (value === 0) return 'Aucune donnée disponible';
    if (value === 1) return 'Excellent ! Réussi du premier coup';
    if (value <= 2) return 'Très bien ! Peu de tentatives nécessaires';
    if (value <= 3) return 'Correct, mais peut être amélioré';
    return 'Des efforts supplémentaires sont nécessaires';
  }
}