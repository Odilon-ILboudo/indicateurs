import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions'
import { NzTagModule } from 'ng-zorro-antd/tag'
import { Activity } from '../course-common'

@Component({
  standalone: true,
  selector: 'course-activity-settings',
  template: `
    <div class="settings-content" *ngIf="activity">
      <nz-descriptions nzBordered nzSize="small" [nzColumn]="1">
        <nz-descriptions-item nzTitle="Titre">{{ activity.title }}</nz-descriptions-item>
        <nz-descriptions-item nzTitle="État">
          <nz-tag [nzColor]="stateColor">{{ stateLabel }}</nz-tag>
        </nz-descriptions-item>
        <nz-descriptions-item nzTitle="Ouverture">
          {{ activity.openAt ? (activity.openAt | date:"d MMM yyyy, HH'h'mm":'':'fr-FR') : 'Non définie' }}
        </nz-descriptions-item>
        <nz-descriptions-item nzTitle="Fermeture">
          {{ activity.closeAt ? (activity.closeAt | date:"d MMM yyyy, HH'h'mm":'':'fr-FR') : 'Non définie' }}
        </nz-descriptions-item>
        <nz-descriptions-item nzTitle="Challenge">{{ activity.isChallenge ? 'Oui' : 'Non' }}</nz-descriptions-item>
      </nz-descriptions>
      <p style="margin-top:1rem;color:var(--brand-text-secondary,#888);font-size:0.85rem">
        La modification des paramètres n'est pas disponible dans ce module.
      </p>
    </div>
  `,
  styles: [`.settings-content { padding: 0.5rem 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzDescriptionsModule, NzTagModule],
})
export class CourseActivitySettingsComponent implements OnChanges {
  @Input() activity?: Activity

  protected stateColor = '#1890FF'
  protected stateLabel = 'À venir'

  ngOnChanges(): void {
    switch (this.activity?.state) {
      case 'opened': this.stateColor = '#339D55'; this.stateLabel = 'Ouvert'; break
      case 'closed': this.stateColor = '#FF4D4F'; this.stateLabel = 'Fermé'; break
      default: this.stateColor = '#1890FF'; this.stateLabel = 'À venir'
    }
  }
}
