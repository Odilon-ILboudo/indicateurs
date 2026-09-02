import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';

export type LayoutState = 'LOADING' | 'READY' | 'SERVER_ERROR' | 'FORBIDDEN' | 'NOT_FOUND';

@Component({
  selector: 'ui-layout-block',
  standalone: true,
  imports: [CommonModule, MatIconModule, NzSkeletonModule],
  templateUrl: './layout-block.component.html',
  styleUrls: ['./layout-block.component.scss'],
})
export class LayoutBlockComponent {
  @Input() state: LayoutState = 'LOADING';
  @Input() title?: string;
  @Input() description?: string;
  @Input() errorMessage?: string;

  get isError(): boolean {
    return ['SERVER_ERROR', 'FORBIDDEN', 'NOT_FOUND'].includes(this.state);
  }

  getErrorIcon(): string {
    switch (this.state) {
      case 'FORBIDDEN': return 'lock';
      case 'NOT_FOUND': return 'search_off';
      default: return 'error_outline';
    }
  }

  getErrorTitle(): string {
    switch (this.state) {
      case 'FORBIDDEN': return 'Accès refusé';
      case 'NOT_FOUND': return 'Page non trouvée';
      default: return 'Erreur serveur';
    }
  }
}