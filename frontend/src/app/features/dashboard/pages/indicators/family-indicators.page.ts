import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AdminIndicatorManagerComponent } from '../../../admin/admin-indicator-manager.component';

@Component({
  standalone: true,
  selector: 'app-family-indicators',
  imports: [CommonModule, AdminIndicatorManagerComponent],
  template: `
    <ui-admin-indicator-manager [familyNameFilter]="familyName" />
  `,
})
export class FamilyIndicatorsPage {
  private readonly route = inject(ActivatedRoute);

  readonly familyName = decodeURIComponent(this.route.snapshot.paramMap.get('name') ?? '');
}
