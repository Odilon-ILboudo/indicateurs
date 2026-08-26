import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IndicatorSelectorComponent } from '../../../indicator-selector/indicator-selector.component';

@Component({
  standalone: true,
  selector: 'app-selector-family-indicators',
  imports: [CommonModule, IndicatorSelectorComponent],
  template: `
    <div class="indicator-selector-wrapper">
      <ui-indicator-selector [familyNameFilter]="familyName" />
    </div>
  `,
})
export class SelectorFamilyIndicatorsPage {
  private readonly route = inject(ActivatedRoute);

  readonly familyName = decodeURIComponent(this.route.snapshot.paramMap.get('name') ?? '');
}
