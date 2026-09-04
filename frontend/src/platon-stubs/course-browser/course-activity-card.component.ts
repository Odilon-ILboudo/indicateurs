import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core'
import { CommonModule } from '@angular/common'
import { RouterModule } from '@angular/router'
import { HttpClient } from '@angular/common/http'
import { MatIconModule } from '@angular/material/icon'
import { MatCardModule } from '@angular/material/card'
import { NzButtonModule } from 'ng-zorro-antd/button'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { NzProgressModule } from 'ng-zorro-antd/progress'
import { NzBadgeModule } from 'ng-zorro-antd/badge'
import { NzDropDownModule } from 'ng-zorro-antd/dropdown'
import { NzToolTipModule } from 'ng-zorro-antd/tooltip'
import { NzDrawerModule } from 'ng-zorro-antd/drawer'
import { Activity } from '../course-common'
import { API } from './course-api.util'
import { CourseActivitySettingsComponent } from './course-activity-settings.component'

@Component({
  standalone: true,
  selector: 'course-activity-card',
  template: `
    <mat-card>
      <div class="card-header" [style.background-color]="color"></div>
      <mat-card-header>
        <mat-card-title class="card-title">{{ item.title }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <div class="ribbon-container">
          <nz-ribbon [nzText]="activityState.label" [nzColor]="activityState.color"><span></span></nz-ribbon>
        </div>
        <div class="card-content">
          <div class="circle-progression-container">
            <nz-progress
              nz-tooltip="Avancement sur les exercices"
              [nzPercent]="item.progression"
              nzType="circle"
              nzStrokeWidth="8"
              [nzWidth]="150"
              [nzStrokeColor]="color"
              [nzFormat]="progressionTemplate"
              nzStatus="normal"
            />
          </div>
          <div class="dates-container">
            <div class="date-item">
              <span>{{ item.openAt ? (item.openAt | date:"d MMM yyyy, HH'h'mm":'':'fr-FR') : 'Non définie' }}</span>
              <span class="date-label">Ouverture</span>
            </div>
            <div class="separator"></div>
            <div class="date-item">
              <span>{{ item.closeAt ? (item.closeAt | date:"d MMM yyyy, HH'h'mm":'':'fr-FR') : 'Non définie' }}</span>
              <span class="date-label">Fermeture</span>
            </div>
          </div>
        </div>
      </mat-card-content>
      <mat-card-actions>
        <div>
          <a
            *ngIf="item.permissions?.answer"
            nz-tooltip="Lancer l'activité"
            nz-button
            nzShape="round"
            nzType="primary"
            class="action-button"
          >
            <mat-icon fontSet="material-icons">{{ item.state === 'closed' ? 'visibility' : 'play_arrow' }}</mat-icon>
            {{ item.state === 'closed' ? 'Voir mes résultats' : 'Lancer' }}
          </a>
          <button
            *ngIf="item.permissions?.viewResource"
            nz-tooltip="Ouvrir l'éditeur de l'activité"
            nz-button
            nzShape="round"
            (click)="$event.stopPropagation()"
            class="action-button"
          >
            <mat-icon>edit</mat-icon>
            Editer
          </button>
        </div>
        <div>
          <button
            *ngIf="item.permissions?.update || item.permissions?.viewStats"
            class="more-button"
            nz-button
            nzType="text"
            nzShape="round"
            (click)="$event.stopPropagation()"
            nz-dropdown
            nzTrigger="click"
            [nzDropdownMenu]="moreActions"
            nzPlacement="topLeft"
          >
            <mat-icon>more_vert</mat-icon>
          </button>
          <nz-dropdown-menu #moreActions="nzDropdownMenu">
            <ul nz-menu>
              <li nz-menu-item *ngIf="item.permissions?.viewStats"
                  [routerLink]="['/dashboard/courses', item.courseId, 'activities', item.id]">
                Statistiques
              </li>
              <li nz-menu-item *ngIf="item.permissions?.update" (click)="downloadCsv()">
                Télécharger les notes au format CSV
              </li>
              <li nz-menu-item *ngIf="item.permissions?.viewResource"
                  [routerLink]="['/dashboard/resources', item.resourceId]">
                Ouvrir la ressource associée
              </li>
              <li nz-menu-item *ngIf="item.permissions?.update" (click)="openSettings()">Paramètres</li>
            </ul>
          </nz-dropdown-menu>
        </div>
      </mat-card-actions>
    </mat-card>

    <nz-drawer
      [nzVisible]="settingsVisible"
      nzPlacement="right"
      [nzWidth]="480"
      [nzTitle]="item.title"
      (nzOnClose)="settingsVisible = false"
    >
      <ng-container *nzDrawerContent>
        <course-activity-settings [activity]="item" />
      </ng-container>
    </nz-drawer>

    <ng-template #progressionTemplate>
      <div class="progression">
        <span class="progression-value">{{ item.progression }}</span>
        <span class="progression-unit">%</span>
      </div>
      <div class="progression-exercises">
        {{ completedExercises }}/{{ item.exerciseCount }} terminé{{ completedExercises > 1 ? 's' : '' }}
      </div>
    </ng-template>
  `,
  styles: [`
    .card-header { width:100%; height:50px; border-radius:5px 5px 0 0; }
    mat-card { width:100%; transition:box-shadow 0.5s; border-radius:5px; }
    mat-card:hover { box-shadow:0px 2px 4px -1px rgba(0,0,0,0.2),0px 4px 5px 0px rgba(0,0,0,0.14),0px 1px 10px 0px rgba(0,0,0,0.12); }
    mat-card-header { max-width:100%; min-width:0; box-sizing:border-box; padding:16px 16px 0; }
    :host ::ng-deep .mat-mdc-card-header-text { min-width:0; }
    mat-card-title.card-title { display:block; min-width:0; overflow-wrap:break-word; word-break:break-word; white-space:normal; font-size:1.1rem; }
    mat-card-content { padding:0; position:relative; }
    .ribbon-container { width:100%; height:0; position:absolute; top:-12px; left:0; z-index:1; }
    .card-content { display:flex; flex-direction:column; align-items:center; padding:16px; padding-top:20px; }
    .circle-progression-container { margin-bottom:8px; }
    .dates-container { width:100%; display:flex; flex-direction:row; justify-content:space-around; margin-top:16px; }
    .date-item { width:50%; display:flex; flex-direction:column; align-items:center; font-size:14px; }
    .date-label { font-size:12px; color:var(--brand-text-secondary,#555); margin-top:2px; }
    .separator { width:1px; background-color:var(--brand-border-color-light,rgba(0,0,0,0.06)); }
    mat-card-actions { border-top:1px solid var(--brand-border-color-light,rgba(0,0,0,0.06)); margin:0 16px; padding:8px 0; display:flex; justify-content:space-between; align-items:center; }
    .action-button { margin:4px; padding:0 10px 0 8px; display:inline-flex; align-items:center; gap:4px; }
    .more-button { margin:0; padding:0 8px; }
    .progression-value { font-size:40px; }
    .progression-unit { font-size:20px; }
    .progression-exercises { margin-top:6px; font-size:12px; color:var(--brand-text-secondary,#555); text-align:center; }
    mat-icon { font-size:20px; width:20px; height:20px; line-height:1; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, RouterModule,
    MatIconModule, MatCardModule,
    NzButtonModule, NzIconModule, NzProgressModule, NzBadgeModule,
    NzDropDownModule, NzToolTipModule, NzDrawerModule,
    CourseActivitySettingsComponent,
  ],
})
export class CourseActivityCardComponent implements OnChanges {
  @Input() item!: Activity

  protected activityState: { color: string; label: string } = { color: '#1890FF', label: 'À venir' }
  protected settingsVisible = false

  constructor(private readonly http: HttpClient) {}

  protected downloadCsv(): void {
    const id = this.item?.id
    const courseId = this.item?.courseId ?? id ?? '_'
    if (!id) return
    this.http.get(`${API}/courses/${courseId}/activities/${id}/csv`, { responseType: 'blob' }).subscribe((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${this.item.title || id}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  ngOnChanges(): void {
    switch (this.item?.state) {
      case 'opened': this.activityState = { color: '#339D55', label: 'Ouvert' }; break
      case 'closed': this.activityState = { color: '#FF4D4F', label: 'Fermé' }; break
      case 'planned': this.activityState = { color: '#1890FF', label: 'À venir' }; break
      default: this.activityState = { color: '#1890FF', label: 'À venir' }
    }
  }

  protected openSettings(): void {
    this.settingsVisible = true
  }

  get color(): string {
    const hue = this.item?.colorHue
    if (hue !== undefined && hue !== null) {
      if (hue < 0) return 'var(--brand-color-primary, #171c8f)'
      return `hsl(${hue}, 80%, 80%)`
    }
    return 'var(--brand-color-primary, #171c8f)'
  }

  get completedExercises(): number {
    return Math.floor(((this.item?.progression ?? 0) * (this.item?.exerciseCount ?? 0)) / 100)
  }
}
