import { Injectable } from '@angular/core';
import { IndicatorVisualization } from '../../../core/models/indicator.model';

@Injectable({ providedIn: 'root' })
export class ModalDataService {
  visualizations: IndicatorVisualization[] = [];
  enabledVizIds: string[] = [];

  setData(visualizations: IndicatorVisualization[], enabledVizIds: string[]): void {
    this.visualizations = visualizations;
    this.enabledVizIds = enabledVizIds;
  }
}
