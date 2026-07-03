// Stub: @platon/feature/course/browser
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, forwardRef, inject, Injectable, Input, NgModule, OnChanges, OnInit, OnDestroy, Output, Pipe, PipeTransform, ViewChild } from '@angular/core'
import { CommonModule, NgIf } from '@angular/common'
import { ControlValueAccessor, FormControl, FormGroup, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { HttpClient, HttpParams } from '@angular/common/http'
import { RouterModule } from '@angular/router'
import { Observable, of, Subject, firstValueFrom, Subscription } from 'rxjs'
import { map } from 'rxjs/operators'
import { NzEmptyModule } from 'ng-zorro-antd/empty'
import { NzProgressModule } from 'ng-zorro-antd/progress'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { NzButtonModule } from 'ng-zorro-antd/button'
import { NzTagModule } from 'ng-zorro-antd/tag'
import { NzTableModule } from 'ng-zorro-antd/table'
import { NzBadgeModule } from 'ng-zorro-antd/badge'
import { NzGridModule } from 'ng-zorro-antd/grid'
import { NzSegmentedModule } from 'ng-zorro-antd/segmented'
import { NzDropDownModule } from 'ng-zorro-antd/dropdown'
import { NzTooltipModule } from 'ng-zorro-antd/tooltip'
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker'
import { NzDrawerModule } from 'ng-zorro-antd/drawer'
import { NzFormModule } from 'ng-zorro-antd/form'
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions'
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm'
import { MatIconModule } from '@angular/material/icon'
import { MatCardModule } from '@angular/material/card'
import { MatButtonModule } from '@angular/material/button'
import { MatRadioModule } from '@angular/material/radio'
import { MatDividerModule } from '@angular/material/divider'
import { MatFormFieldModule } from '@angular/material/form-field'
import { NzSelectModule } from 'ng-zorro-antd/select'

import {
  Activity,
  ActivityFilters,
  Course,
  CourseFilters,
  CourseGroup,
  CourseGroupDetail,
  CourseMember,
  CourseMemberFilters,
  CourseMemberRoles,
  CourseSection,
  CreateCourseMember,
  CreateCourseSection,
  CreateTestMember,
  CourseDemo,
  FindCourse,
  UpdateCourse,
  UpdateCourseSection,
} from './course-common'
import { FilterIndicator } from './shared-ui'
import { CourseOrderings, COURSE_ORDERING_DIRECTIONS } from './course-common'
import { OrderingDirections } from './core-common'
import { environment } from '../environments/environment'

const API = `${environment.apiUrl}/v1`

function buildParams(filters: Record<string, unknown>): HttpParams {
  let params = new HttpParams()
  for (const [key, val] of Object.entries(filters)) {
    if (val == null || val === '' || key === 'expands') continue
    if (Array.isArray(val)) {
      for (const v of val) params = params.append(key, String(v))
    } else {
      params = params.set(key, String(val))
    }
  }
  return params
}

// ---- CourseService ----

@Injectable({ providedIn: 'root' })
export class CourseService {
  readonly onDeletedActivity = new Subject<Activity>()

  constructor(private readonly http: HttpClient) {}

  search(filters: CourseFilters = {}): Observable<{ resources: Course[]; total: number }> {
    return this.http.get<{ resources: Course[]; total: number }>(
      `${API}/courses`,
      { params: buildParams(filters as Record<string, unknown>) },
    )
  }

  find(query: FindCourse): Observable<Course> {
    return this.http
      .get<{ resource: Course }>(`${API}/courses/${query.id}`)
      .pipe(map((r) => r.resource))
  }

  update(_id: string, _input: UpdateCourse): Observable<Course> {
    return of({} as Course)
  }

  delete(_course: Course): Observable<void> {
    return of(undefined)
  }

  listSections(course: Course): Observable<{ resources: CourseSection[] }> {
    return this.http.get<{ resources: CourseSection[] }>(`${API}/courses/${course.id}/sections`)
  }

  createSection(_course: Course, _input: CreateCourseSection): Observable<CourseSection> {
    return of({} as CourseSection)
  }

  updateSection(_section: CourseSection, _input: UpdateCourseSection): Observable<CourseSection> {
    return of({} as CourseSection)
  }

  deleteSection(_section: CourseSection): Observable<void> {
    return of(undefined)
  }

  listActivities(course: Course, filters: ActivityFilters = {}): Observable<{ resources: Activity[] }> {
    return this.http.get<{ resources: Activity[] }>(
      `${API}/courses/${course.id}/activities`,
      { params: buildParams(filters as Record<string, unknown>) },
    )
  }

  findActivity(courseId: string, activityId: string): Observable<Activity> {
    return this.http
      .get<{ resource: Activity }>(`${API}/courses/${courseId}/activities/${activityId}`)
      .pipe(map((r) => r.resource))
  }

  updateActivity(activity: Activity, _input: Partial<Activity>): Observable<Activity> {
    return of(activity)
  }

  updateActivityOrder(_course: Course, _ids: string[]): Observable<void> {
    return of(undefined)
  }

  createMember(_course: Course, _input: CreateCourseMember): Observable<CourseMember> {
    return of({} as CourseMember)
  }

  createTestMembers(_course: Course, _input: CreateTestMember[]): Observable<{ resources: CourseMember[] }> {
    return of({ resources: [] })
  }

  deleteMember(_member: CourseMember): Observable<void> {
    return of(undefined)
  }

  updateMemberRole(_member: CourseMember, _role: CourseMemberRoles): Observable<CourseMember> {
    return of({} as CourseMember)
  }

  searchMembers(course: Course, filters?: CourseMemberFilters): Observable<{ resources: CourseMember[]; total: number }> {
    let params = new HttpParams()
    if (filters?.roles?.length) params = params.set('roles', filters.roles.join(','))
    else if (filters?.role) params = params.set('role', filters.role)
    if (filters?.search) params = params.set('search', filters.search)
    return this.http.get<{ resources: CourseMember[]; total: number }>(
      `${API}/courses/${course.id}/members`,
      { params },
    )
  }

  getDemo(_courseId: string): Observable<CourseDemo | null> {
    return of(null)
  }

  createDemo(_courseId: string): Observable<CourseDemo> {
    return of({} as CourseDemo)
  }

  deleteDemo(_courseId: string): Observable<void> {
    return of(undefined)
  }

  listGroups(courseId: string): Observable<{ resources: CourseGroup[] }> {
    return this.http.get<{ resources: CourseGroup[] }>(`${API}/courses/${courseId}/groups`)
  }

  addCourseGroup(_courseId: string): Observable<{ resource: CourseGroup }> {
    return of({ resource: {} as CourseGroup })
  }

  deleteGroup(_courseId: string, _groupId: string): Observable<void> {
    return of(undefined)
  }

  updateGroupName(_courseId: string, _groupId: string, _name: string): Observable<void> {
    return of(undefined)
  }

  listGroupMembers(courseId: string, groupId: string): Observable<{ resources: CourseMember[] }> {
    return this.http.get<{ resources: CourseMember[] }>(`${API}/courses/${courseId}/groups/${groupId}/members`)
  }

  addGroupMember(_courseId: string, _groupId: string, _userId: string): Observable<void> {
    return of(undefined)
  }

  deleteGroupMember(_courseId: string, _groupId: string, _userId: string): Observable<void> {
    return of(undefined)
  }
}

// ---- CourseItemComponent ----

@Component({
  standalone: true,
  selector: 'course-item',
  template: `
    @if (item.statistic) {
      <nz-ribbon [nzText]="ribbonTpl" [nzColor]="progressColor">
        <ng-container *ngTemplateOutlet="articleTpl"></ng-container>
      </nz-ribbon>
    } @else {
      <ng-container *ngTemplateOutlet="articleTpl"></ng-container>
    }

    <ng-template #ribbonTpl>
      <nz-progress [nzPercent]="item.statistic?.progression ?? 0" [nzSteps]="5" nzSize="small" />
    </ng-template>

    <ng-template #articleTpl>
      <article class="mat-elevation-z1" [routerLink]="[item.id]">
        <div class="article-content-wrapper">
          <header class="article-header">
            <div class="article-image">
              <mat-icon>local_library</mat-icon>
            </div>
            <div class="article-title">{{ item.name }}</div>
          </header>
          <p class="article-description">{{ item.desc }}</p>
          <footer class="article-footer">
            <ng-container *ngIf="item.statistic">
              <div class="action" nz-tooltip="Enseignants">
                <mat-icon class="action-icon">supervised_user_circle</mat-icon>
                <span class="action-title">{{ item.statistic.teacherCount }}</span>
              </div>
              <div class="action" nz-tooltip="Élèves">
                <mat-icon class="action-icon">people</mat-icon>
                <span class="action-title">{{ item.statistic.studentCount }}</span>
              </div>
              <div class="action" nz-tooltip="Activités">
                <mat-icon class="action-icon">widgets</mat-icon>
                <span class="action-title">{{ item.statistic.activityCount }}</span>
              </div>
            </ng-container>
            <div class="spacer"></div>
            <div class="action" nz-tooltip="Dernière mise à jour">
              <i nz-icon nzType="history" nzTheme="outline"></i>
              <span class="action-title">{{ item.updatedAt | date:'dd/MM/yyyy' }}</span>
            </div>
          </footer>
        </div>
      </article>
    </ng-template>
  `,
  styles: [`
    :host { display: block; cursor: pointer; }
    nz-ribbon { display: block; width: 100%; }
    article {
      width: 100%;
      box-sizing: border-box;
      border-radius: .5rem;
      transition: box-shadow .5s;
      background: var(--brand-background-card, #fafafa);
    }
    article:hover {
      box-shadow: 0 2px 4px -1px rgba(0,0,0,.2), 0 4px 5px rgba(0,0,0,.14), 0 1px 10px rgba(0,0,0,.12) !important;
    }
    .article-content-wrapper { padding: 12px; }
    .article-header { display: flex; align-items: center; height: 3em; margin: 0 0 8px; overflow: hidden; }
    .article-image { width: 24px; height: 24px; display: flex; align-items: center; flex-shrink: 0; }
    .article-image mat-icon { width: 24px; height: 24px; font-size: 24px; color: var(--brand-text-secondary, #555); }
    .article-title {
      margin: 0 0 0 8px;
      max-width: 70%;
      max-height: 3em;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 1rem;
      font-weight: 500;
      color: var(--brand-text-primary, #222);
    }
    .article-description {
      margin: 0 0 8px;
      height: 1.5em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.875rem;
      color: var(--brand-text-secondary, #555);
    }
    .article-footer { display: flex; align-items: center; }
    .action {
      display: flex; align-items: center;
      color: var(--brand-text-secondary, #555);
      margin-right: 2px;
    }
    .action-icon { font-size: 18px; width: 18px; height: 18px; }
    .action-title { margin: 0 8px 0 2px; font-size: 0.8rem; line-height: 18px; }
    .spacer { flex: 1; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, MatIconModule, NzBadgeModule, NzProgressModule, NzIconModule, NzTooltipModule],
})
export class CourseItemComponent implements OnChanges {
  @Input() item!: Course
  @Input() simple = false

  protected progressColor = '#ff4d4f'

  ngOnChanges(): void {
    const p = this.item?.statistic?.progression ?? 0
    if (p >= 100) this.progressColor = '#52c41a'
    else if (p >= 75) this.progressColor = '#52c41a'
    else if (p >= 50) this.progressColor = '#1890ff'
    else if (p >= 25) this.progressColor = '#faad14'
    else this.progressColor = '#ff4d4f'
  }
}

// ---- CourseListComponent ----

@Component({
  standalone: true,
  selector: 'course-list',
  template: `
    <ng-container *ngIf="items.length > 0; else empty">
      <div class="course-grid">
        <course-item *ngFor="let item of items" [item]="item" [simple]="simple" />
      </div>
    </ng-container>
    <ng-template #empty>
      <nz-empty nzNotFoundImage="simple" [nzNotFoundContent]="emptyContent">
        <ng-template #emptyContent>
          <ng-content></ng-content>
        </ng-template>
      </nz-empty>
    </ng-template>
  `,
  styles: [`
    :host { display: block; overflow: hidden; }
    .course-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 2rem;
    }
    @media (max-width: 920px) {
      .course-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 768px) {
      .course-grid { display: block; }
      course-item { display: block; margin-bottom: 1rem; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzEmptyModule, CourseItemComponent],
})
export class CourseListComponent {
  @Input() items: Course[] = []
  @Input() simple = false
}

// ---- CourseFiltersComponent ----

@Component({
  standalone: true,
  selector: 'course-filters',
  template: `
    <nz-drawer
      [nzClosable]="false"
      [nzVisible]="visible"
      nzPlacement="right"
      nzTitle="Recherche avancée"
      [nzFooter]="footer"
      (nzOnClose)="close()"
    >
      <ng-container *nzDrawerContent>
        <form [formGroup]="form">
          <section style="margin-bottom:1rem">
            <label style="display:block;font-weight:500;margin-bottom:0.5rem">Comment voulez-vous trier les résultats ?</label>
            <nz-select style="width:100%" nzPlaceHolder="Sélectionnez un mode de tri" formControlName="order">
              <nz-option nzLabel="Nom de A à Z"              nzValue="NAME-ASC" />
              <nz-option nzLabel="Nom de Z à A"              nzValue="NAME-DESC" />
              <nz-option nzLabel="Création : Récent-Ancient" nzValue="CREATED_AT-DESC" />
              <nz-option nzLabel="Création : Ancient-Récent" nzValue="CREATED_AT-ASC" />
              <nz-option nzLabel="MàJ : Récente-Ancienne"   nzValue="UPDATED_AT-DESC" />
              <nz-option nzLabel="MàJ : Ancienne-Récente"   nzValue="UPDATED_AT-ASC" />
            </nz-select>
          </section>
          <mat-divider />
          <section style="margin-top:1rem">
            <label style="display:block;font-weight:500;margin-bottom:0.5rem">Souhaitez-vous limiter les résultats à une certaine période de mise à jour ?</label>
            <mat-radio-group formControlName="period" style="display:flex;flex-direction:column;gap:0.5rem">
              <mat-radio-button [value]="0">Tout</mat-radio-button>
              <mat-radio-button [value]="1">1 jour</mat-radio-button>
              <mat-radio-button [value]="7">1 semaine</mat-radio-button>
              <mat-radio-button [value]="31">1 mois</mat-radio-button>
              <mat-radio-button [value]="180">6 mois</mat-radio-button>
              <mat-radio-button [value]="365">1 an</mat-radio-button>
            </mat-radio-group>
          </section>
        </form>
      </ng-container>
      <ng-template #footer>
        <button mat-stroked-button (click)="close()">Annuler</button>&nbsp;
        <button mat-raised-button color="primary" (click)="apply()">Appliquer</button>
      </ng-template>
    </nz-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule,
    NzDrawerModule, NzSelectModule,
    MatButtonModule, MatRadioModule, MatDividerModule,
  ],
})
export class CourseFiltersComponent implements OnDestroy {
  private subs: Subscription[] = []
  protected visible = false
  protected form = this.createForm()

  @Input() filters: CourseFilters = {}
  @Output() triggered = new EventEmitter<CourseFilters>()

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()) }

  open(): void {
    this.form = this.createForm()
    this.form.patchValue({
      period: this.filters.period ?? 0,
      order: `${this.filters.order ?? CourseOrderings.UPDATED_AT}-${this.filters.direction ?? OrderingDirections.DESC}`,
    })
    this.visible = true
    this.cdr.markForCheck()
    this.subs.push(this.form.valueChanges.subscribe((value) => {
      const parts = (value.order ?? '').split('-') as [CourseOrderings, OrderingDirections]
      this.filters = { ...this.filters, order: parts[0], direction: parts[1], period: value.period as number }
    }))
  }

  protected close(): void {
    this.subs.forEach(s => s.unsubscribe())
    this.subs = []
    this.visible = false
    this.cdr.markForCheck()
  }

  protected apply(): void { this.triggered.emit(this.filters); this.close() }

  private createForm() {
    return new FormGroup({
      order: new FormControl(`${CourseOrderings.UPDATED_AT}-${OrderingDirections.DESC}`),
      period: new FormControl(0),
    })
  }
}

// ---- CourseActivitySettingsComponent ----

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

// ---- CsvDownloadButtonComponent ----

@Component({
  standalone: true,
  selector: 'course-csv-download-button',
  template: `
    <button nz-button nzSize="small" [disabled]="!activities.length" (click)="download()">
      Télécharger les notes au format CSV
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzButtonModule, NzIconModule],
})
export class CsvDownloadButtonComponent {
  @Input() activities: Activity[] = []
  @Input() name = ''
  @Input() type = 'course'
  @Input() courseId?: string

  constructor(private readonly http: HttpClient) {}

  download(): void {
    const activityId = this.activities[0]?.id
    const cId = this.courseId ?? activityId ?? '_'
    if (!activityId) return
    this.http
      .get(`${API}/courses/${cId}/activities/${activityId}/csv`, { responseType: 'blob' })
      .subscribe((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${this.name || activityId}.csv`
        a.click()
        URL.revokeObjectURL(url)
      })
  }
}

// ---- CourseActivityCardComponent ----

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
    NzDropDownModule, NzTooltipModule, NzDrawerModule,
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

// ---- CourseActivityGridComponent ----

@Component({
  standalone: true,
  selector: 'course-activity-grid',
  template: `
    @if (!empty) {
      <nz-segmented [(ngModel)]="selectedIndex" [nzOptions]="tabOptions" style="margin-bottom:1rem" />
      <ng-container *ngIf="tabs[selectedIndex] as tab">
        <ng-container *ngIf="tab.items.length; else emptyTab">
          <nz-row [nzGutter]="[24, 24]" nzAlign="top">
            <nz-col
              *ngFor="let item of tab.items; trackBy: trackActivity"
              nzXs="24" nzSm="24" nzMd="24" nzLg="12" nzXl="12" nzXXl="8"
            >
              <course-activity-card [item]="item" />
            </nz-col>
          </nz-row>
        </ng-container>
        <ng-template #emptyTab>
          <nz-empty [nzNotFoundContent]="emptyTabContent">
            <ng-template #emptyTabContent>Aucune activité dans cet état.</ng-template>
          </nz-empty>
        </ng-template>
      </ng-container>
    } @else {
      <ng-content></ng-content>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, NzSegmentedModule, NzGridModule, NzEmptyModule, CourseActivityCardComponent],
})
export class CourseActivityGridComponent {
  protected tabs: { title: string; items: Activity[] }[] = []
  protected readonly tabOptions = [
    { label: 'Tout', value: 0 },
    { label: 'Ouvert', value: 1 },
    { label: 'À venir', value: 2 },
    { label: 'Fermé', value: 3 },
  ]
  protected selectedIndex = 0
  protected empty = true

  @Input() editmode = false

  @Input()
  set items(value: Activity[]) {
    this.empty = !value?.length
    this.tabs = [
      { title: 'Tout', items: value ?? [] },
      { title: 'Ouvert', items: (value ?? []).filter((a) => a.state === 'opened') },
      { title: 'À venir', items: (value ?? []).filter((a) => a.state === 'planned') },
      { title: 'Fermé', items: (value ?? []).filter((a) => a.state === 'closed') },
    ]
  }

  protected trackActivity(_: number, item: Activity): string {
    return item.id
  }
}

// ---- CourseActivityTableComponent ----

@Component({
  standalone: true,
  selector: 'course-activity-table',
  template: `
    <table class="activity-table" *ngIf="activities.length">
      <thead>
        <tr>
          <th>Activité</th>
          <th>Section</th>
          <th>État</th>
          <th>Avancement</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let activity of activities">
          <td>{{ activity.title }}</td>
          <td>{{ getSectionName(activity.sectionId) }}</td>
          <td>
            <nz-tag [nzColor]="getStateColor(activity.state)">{{ getStateLabel(activity.state) }}</nz-tag>
          </td>
          <td><nz-progress [nzPercent]="activity.progression" nzSize="small" /></td>
        </tr>
      </tbody>
    </table>
  `,
  styles: [`
    .activity-table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid var(--brand-border, #f0f0f0); }
    th { font-weight: 600; background: var(--brand-surface-secondary, #fafafa); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzProgressModule, NzTagModule],
})
export class CourseActivityTableComponent {
  @Input() activities: Activity[] = []
  @Input() sections: CourseSection[] = []

  protected getSectionName(sectionId: string): string {
    return this.sections.find((s) => s.id === sectionId)?.name ?? ''
  }

  protected getStateColor(state: string): string {
    return state === 'opened' ? 'green' : state === 'closed' ? 'red' : 'orange'
  }

  protected getStateLabel(state: string): string {
    return state === 'opened' ? 'Ouvert' : state === 'closed' ? 'Fermé' : 'À venir'
  }
}

// ---- CourseSharingComponent ----

@Component({
  standalone: true,
  selector: 'course-sharing',
  template: `<p style="padding: 0.5rem;">Partage du cours {{ courseId }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class CourseSharingComponent {
  @Input() courseId?: string
}

// ---- ChangeRoleEvent ----

export interface ChangeRoleEvent {
  member: CourseMember
  newRole: CourseMemberRoles
  previousRole: CourseMemberRoles
}

// ---- displayCourseMemberRole Pipe ----

@Pipe({ standalone: true, name: 'displayCourseMemberRole' })
export class DisplayCourseMemberRolePipe implements PipeTransform {
  transform(role: string): string {
    const map: Record<string, string> = {
      teacher: 'Enseignant',
      student: 'Élève',
    }
    return map[role] ?? role
  }
}

// ---- CourseMemberTableComponent ----

@Component({
  standalone: true,
  selector: 'course-member-table',
  template: `
    <nz-table
      #tbl
      nzSize="small"
      [nzData]="members"
      [nzLoading]="loading"
      [nzTotal]="total || members.length"
      [nzShowPagination]="(total || members.length) > 10"
      [nzFrontPagination]="true"
    >
      <thead>
        <tr>
          <th>Utilisateur/Groupe</th>
          <th>Date d'ajout</th>
          <th>Rôle</th>
          <th *ngIf="editable" nzAlign="center">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let m of tbl.data">
          <td>
            <span class="member-name">
              <span class="member-avatar" [style.background]="avatarColor(m)">
                {{ avatarInitial(m) }}
              </span>
              {{ displayName(m) }}
            </span>
          </td>
          <td>{{ m.createdAt | date:'dd/MM/yyyy' }}</td>
          <td>{{ roleLabel(m.role) }}</td>
          <td nzAlign="center" *ngIf="editable">
            <button
              *ngIf="!nonDeletables.includes(m.user?.id || '')"
              nz-button nzDanger nzType="primary" nzShape="circle" nzSize="small"
              nz-popconfirm
              nzOkText="Retirer"
              nzOkType="danger"
              [nzPopconfirmTitle]="'Voulez-vous vraiment retirer &quot;' + displayName(m) + '&quot; du ' + type + ' ?'"
              (nzOnConfirm)="deleted.emit(m)"
            >
              <i nz-icon nzType="delete"></i>
            </button>
          </td>
        </tr>
      </tbody>
    </nz-table>
  `,
  styles: [`
    .member-name { display: flex; align-items: center; gap: 8px; }
    .member-avatar {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 50%;
      color: #fff; font-size: 13px; font-weight: 600; flex-shrink: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzTableModule, NzButtonModule, NzIconModule, NzPopconfirmModule],
})
export class CourseMemberTableComponent {
  @Input() members: CourseMember[] = []
  @Input() total = 0
  @Input() loading = false
  @Input() editable = false
  @Input() nonDeletables: string[] = []
  @Input() type = 'membre'

  @Input() filters: CourseMemberFilters = {}
  @Output() filtersChange = new EventEmitter<CourseMemberFilters>()
  @Output() deleted = new EventEmitter<CourseMember>()
  @Output() changeRole = new EventEmitter<ChangeRoleEvent>()

  protected displayName(m: CourseMember): string {
    if (m.user) {
      const u = m.user as { displayName?: string; username?: string; firstName?: string; lastName?: string }
      return u.displayName || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.username || ''
    }
    return m.group?.name ?? (m.userId as string) ?? ''
  }

  protected avatarInitial(m: CourseMember): string {
    return this.displayName(m).charAt(0).toUpperCase()
  }

  protected avatarColor(m: CourseMember): string {
    const colors = ['#1677ff', '#52c41a', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2']
    const key = m.user?.id ?? m.group?.id ?? ''
    let hash = 0
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xffffffff
    return colors[Math.abs(hash) % colors.length]
  }

  protected roleLabel(role?: string): string {
    return role === 'teacher' ? 'Enseignant' : role === 'student' ? 'Étudiant' : role ?? '-'
  }
}

// ---- CourseMemberSearchBarComponent ----

@Component({
  standalone: true,
  selector: 'course-member-search-bar',
  template: `
    <div class="search-bar-wrap">
      <span nz-icon nzType="search" nzTheme="outline" style="color:#bbb;margin-right:6px"></span>
      <input
        class="search-input"
        [placeholder]="placeholder"
        (input)="onSearch($event)"
      />
    </div>
    <ng-content></ng-content>
  `,
  styles: [`
    :host { display: block; }
    .search-bar-wrap { display: flex; align-items: center; border: 1px solid #d9d9d9; border-radius: 4px; padding: 6px 10px; background: #fff; }
    .search-input { border: none; outline: none; flex: 1; font-size: 0.9rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CourseMemberSearchBarComponent), multi: true }],
  imports: [CommonModule, NzIconModule],
})
export class CourseMemberSearchBarComponent implements ControlValueAccessor {
  @Input() placeholder = 'Rechercher...'
  @Input() filters: CourseMemberFilters = {}
  @Input() courseId = ''
  @Input() autoSelect = false

  total = 0
  searching = false

  private allMembers: CourseMember[] = []
  private onChange = (_: CourseMember[]) => {}
  private onTouched = () => {}
  private courseService = inject(CourseService)

  writeValue(_val: CourseMember[]): void {}
  registerOnChange(fn: (_: CourseMember[]) => void): void { this.onChange = fn }
  registerOnTouched(fn: () => void): void { this.onTouched = fn }

  ngOnInit(): void {
    if (!this.courseId) return
    this.searching = true
    const fakeCourse = { id: this.courseId } as Course
    this.courseService.searchMembers(fakeCourse, this.filters).subscribe({
      next: (res) => {
        this.allMembers = res.resources
        this.total = res.total ?? res.resources.length
        this.searching = false
        this.onChange(this.allMembers)
      },
      error: () => { this.searching = false },
    })
  }

  protected onSearch(event: Event): void {
    const q = (event.target as HTMLInputElement).value.toLowerCase()
    const filtered = q
      ? this.allMembers.filter((m) =>
          (m.user?.username ?? '').toLowerCase().includes(q) ||
          ((m.user as any)?.firstName ?? '').toLowerCase().includes(q) ||
          ((m.user as any)?.lastName ?? '').toLowerCase().includes(q)
        )
      : this.allMembers
    this.onChange(filtered)
  }
}

// ---- CourseMemberSearchModalComponent ----

@Component({
  standalone: true,
  selector: 'course-member-search-modal',
  template: `
    <div *ngIf="visible" class="modal-backdrop" (click)="close()">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <h3>{{ title }}</h3>
        <ng-content></ng-content>
        <div class="modal-footer">
          <button nz-button nzType="primary" (click)="confirm()">{{ okTitle }}</button>
          <button nz-button (click)="close()">Annuler</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
    .modal-box { background: #fff; border-radius: 8px; padding: 1.5rem; min-width: 400px; }
    h3 { margin: 0 0 1rem; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzButtonModule],
})
export class CourseMemberSearchModalComponent {
  @Input() title = 'Ajouter des membres'
  @Input() okTitle = 'OK'
  @Input() multi = false
  @Input() excludes: string[] = []
  @Input() courseId = ''
  @Input() allowGroup = false

  @Output() closed = new EventEmitter<CourseMember[]>()

  protected visible = false

  open(): void { this.visible = true }
  close(): void { this.visible = false; this.closed.emit([]) }
  confirm(): void { this.visible = false; this.closed.emit([]) }
}

// ---- CoursePipesModule ----

@NgModule({ imports: [DisplayCourseMemberRolePipe], exports: [DisplayCourseMemberRolePipe] })
export class CoursePipesModule {}

// ---- CourseOrderingFilterIndicator ----

export function CourseOrderingFilterIndicator(ordering: CourseOrderings): FilterIndicator<CourseFilters> {
  return {
    match: (filters) => filters.order === ordering,
    remove: (filters) => ({ ...filters, order: undefined, direction: undefined }),
    describe: (filters) => {
      const value = `${ordering}-${filters.direction ?? COURSE_ORDERING_DIRECTIONS[ordering]}`
      return ({
        'NAME-ASC':         'Trier par Nom de A à Z',
        'NAME-DESC':        'Trier par Nom de Z à A',
        'CREATED_AT-DESC':  'Trier par Création : Récent-Ancient',
        'CREATED_AT-ASC':   'Trier par Création : Ancient-Récent',
        'UPDATED_AT-DESC':  'Trier par MàJ : Récente-Ancienne',
        'UPDATED_AT-ASC':   'Trier par MàJ : Ancienne-Récente',
      } as Record<string, string>)[value] ?? `Trier par ${ordering}`
    },
  }
}

