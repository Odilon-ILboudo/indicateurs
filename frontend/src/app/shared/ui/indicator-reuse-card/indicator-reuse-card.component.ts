// frontend/src/app/shared/ui/indicator-reuse-card/indicator-reuse-card.component.ts
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { IndicatorDefinition, contextIcon } from '../../../core/models/indicator.model';

/** Carte statique d'aperçu d'un indicateur (nom + description + étapes du pipeline en chips),
 *  utilisée dans la galerie de réutilisation du wizard de création. Contrairement à
 *  `IndicatorCardComponent` (dashboard), elle n'affiche aucune valeur calculée et ne dépend
 *  d'aucun contexte d'exécution - juste la structure de l'indicateur source. Style calqué sur
 *  `.compare-card` (modale de comparaison par groupe) pour rester cohérent visuellement. */
@Component({
  selector: 'ui-indicator-reuse-card',
  standalone: true,
  imports: [CommonModule, MatIconModule, NzTagModule],
  template: `
    <div class="reuse-card" (click)="selected.emit(indicator.id)">
      <div class="reuse-card-title">
        <mat-icon style="font-size:14px;width:14px;height:14px">{{ contextIcon(indicator.contextType) }}</mat-icon>
        {{ indicator.name }}
      </div>
      <div class="reuse-card-body">
        <div class="reuse-card-desc" *ngIf="indicator.description">
          {{ indicator.description | slice:0:100 }}{{ (indicator.description.length ?? 0) > 100 ? '…' : '' }}
        </div>
        <div class="reuse-card-chips">
          <ng-container *ngIf="indicator.formula?.pipeline?.length; else noPipeline">
            <nz-tag *ngFor="let s of indicator.formula!.pipeline" style="margin:2px">{{ s.label || s.type }}</nz-tag>
          </ng-container>
          <ng-template #noPipeline>
            <span class="reuse-card-empty">Pas encore de pipeline</span>
          </ng-template>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .reuse-card {
      border: 1px solid #f0f0f0; border-radius: 10px; overflow: hidden;
      background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.06); cursor: pointer;
      transition: border-color .15s, box-shadow .15s; height: 100%; box-sizing: border-box;
    }
    .reuse-card:hover { border-color: #722ed1; box-shadow: 0 4px 12px rgba(114,46,209,.12); }
    .reuse-card-title {
      display: flex; align-items: center; gap: 6px;
      padding: 10px 14px; background: #f9f0ff; border-bottom: 1px solid #efdbff;
      font-size: 13px; font-weight: 600; color: #531dab;
    }
    .reuse-card-body { padding: 12px 14px; }
    .reuse-card-desc { font-size: 12px; color: #888; margin-bottom: 8px; }
    .reuse-card-chips { display: flex; flex-wrap: wrap; }
    .reuse-card-empty { font-size: 12px; color: #bbb; }
  `],
})
export class IndicatorReuseCardComponent {
  @Input() indicator!: IndicatorDefinition;
  @Output() selected = new EventEmitter<string>();
  readonly contextIcon = contextIcon;
}
