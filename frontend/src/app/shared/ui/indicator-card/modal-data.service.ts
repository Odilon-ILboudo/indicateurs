import { Injectable } from '@angular/core';
import { IndicatorVisualization } from '../../../core/models/indicator.model';

@Injectable({ providedIn: 'root' })
export class ModalDataService {
  visualizations: IndicatorVisualization[] = [];
  enabledVizIds: string[] = [];
  activeVizId: string | null = null;

  setData(visualizations: IndicatorVisualization[], enabledVizIds: string[], activeVizId: string | null = null): void {
    this.visualizations = visualizations;
    this.enabledVizIds = enabledVizIds;
    this.activeVizId = activeVizId;
  }
}
