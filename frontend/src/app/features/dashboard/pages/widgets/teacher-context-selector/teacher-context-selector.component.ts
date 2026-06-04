import {
  Component, OnInit, Output, EventEmitter, inject, ChangeDetectorRef, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { MatIconModule } from '@angular/material/icon';
import { DashboardSettingsService } from '../../../../../core/services/dashboard-settings.service';
import { IndicatorService } from '../../../../../core/services/indicator.service';
import { RoleService } from '../../../../../core/services/role.service';
import { DashboardContext, TeacherCourse, CourseActivity, IndicatorScope } from '../../../../../core/models/indicator.model';
import { environment } from '../../../../../../environments/environment';

@Component({
  selector: 'app-teacher-context-selector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, NzSelectModule, NzFormModule, NzSpinModule, NzDividerModule, MatIconModule],
  template: `
    <div class="teacher-ctx">
      <div class="ctx-row">

        <!-- Sélecteur cours -->
        <div class="ctx-field">
          <label class="ctx-label"><mat-icon>school</mat-icon> Cours</label>
          <nz-select
            [(ngModel)]="selectedCourseId"
            (ngModelChange)="onCourseChange($event)"
            nzPlaceHolder="Sélectionner un cours"
            nzShowSearch
            [nzLoading]="loadingCourses"
            style="width: 220px">
            <nz-option
              *ngFor="let c of courses"
              [nzValue]="c.id"
              [nzLabel]="c.name">
            </nz-option>
          </nz-select>
        </div>

        <!-- Sélecteur activité -->
        <ng-container *ngIf="selectedCourseId">
          <div class="ctx-field">
            <label class="ctx-label"><mat-icon>assignment</mat-icon> Activité</label>
            <nz-select
              [(ngModel)]="selectedActivityId"
              (ngModelChange)="onActivityChange($event)"
              nzPlaceHolder="Sélectionner une activité"
              nzShowSearch
              [nzLoading]="loadingActivities"
              style="width: 240px">
              <nz-option
                *ngFor="let a of activities"
                [nzValue]="a.id"
                [nzLabel]="a.name">
              </nz-option>
            </nz-select>
          </div>
        </ng-container>

        <!-- Sélecteur scope : cours entier ou groupe (affiché après l'activité) -->
        <ng-container *ngIf="selectedCourse">
          <div class="ctx-field">
            <label class="ctx-label"><mat-icon>layers</mat-icon> Voir par</label>
            <nz-select
              [(ngModel)]="selectedScopeType"
              (ngModelChange)="onScopeTypeChange($event)"
              style="width: 200px">
              <nz-option nzValue="course" nzLabel="Cours entier"></nz-option>
              <nz-option-group
                *ngIf="selectedCourse.groups.length > 0"
                nzLabel="Groupes de TP">
                <nz-option
                  *ngFor="let g of selectedCourse.groups"
                  [nzValue]="'group:' + g.id"
                  [nzLabel]="g.name">
                </nz-option>
              </nz-option-group>
            </nz-select>
          </div>
        </ng-container>

      </div>
    </div>
  `,
  styles: [`
    .teacher-ctx {
      background: #f6f8fa;
      border: 1px solid #e8ecf0;
      border-radius: 10px;
      padding: 12px 20px;
      margin-bottom: 20px;
    }
    .ctx-row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 20px;
    }
    .ctx-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ctx-label {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      color: #8c8c8c;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .ctx-label mat-icon {
      font-size: 13px;
      line-height: 1;
    }
  `],
})
export class TeacherContextSelectorComponent implements OnInit {
  private readonly indicatorService = inject(IndicatorService);
  private readonly roleService = inject(RoleService);
  private readonly settingsService = inject(DashboardSettingsService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Output() contextChange = new EventEmitter<DashboardContext>();

  courses: TeacherCourse[] = [];
  activities: CourseActivity[] = [];
  loadingCourses = false;
  loadingActivities = false;

  selectedCourseId: string | null = null;
  selectedScopeType = 'course';
  selectedActivityId: string | null = null;

  get selectedCourse(): TeacherCourse | null {
    return this.courses.find(c => c.id === this.selectedCourseId) ?? null;
  }

  ngOnInit(): void {
    const saved = this.settingsService.getTeacherState();
    this.loadingCourses = true;
    this.indicatorService.getTeacherContext(environment.defaultUserId).subscribe({
      next: courses => {
        this.courses = courses;
        this.loadingCourses = false;

        // Restaurer la sélection précédente si elle existe
        if (saved.courseId && courses.some(c => c.id === saved.courseId)) {
          this.selectedCourseId = saved.courseId;
          this.selectedScopeType = saved.scopeType;
          this.loadingActivities = true;
          this.indicatorService.getCourseActivities(saved.courseId).subscribe({
            next: activities => {
              this.activities = activities;
              this.loadingActivities = false;
              if (saved.activityId && activities.some(a => a.id === saved.activityId)) {
                this.selectedActivityId = saved.activityId;
                // Réémettre le contexte sauvegardé immédiatement
                if (saved.context) this.contextChange.emit(saved.context);
              }
              this.cdr.markForCheck();
            },
            error: () => { this.loadingActivities = false; this.cdr.markForCheck(); },
          });
        }

        this.cdr.markForCheck();
      },
      error: () => { this.loadingCourses = false; this.cdr.markForCheck(); },
    });
  }

  onCourseChange(courseId: string): void {
    this.selectedScopeType = 'course';
    this.selectedActivityId = null;
    this.activities = [];
    this.saveState();

    if (!courseId) return;

    this.loadingActivities = true;
    this.indicatorService.getCourseActivities(courseId).subscribe({
      next: activities => {
        this.activities = activities;
        this.loadingActivities = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loadingActivities = false; this.cdr.markForCheck(); },
    });
  }

  onScopeTypeChange(_: string): void {
    this.emitContext();
  }

  onActivityChange(_: string): void {
    this.emitContext();
  }

  private emitContext(): void {
    if (!this.selectedCourseId || !this.selectedActivityId) return;

    const isGroup = this.selectedScopeType.startsWith('group:');
    const scope: IndicatorScope = isGroup ? 'group' : 'course';
    const scopeId = isGroup ? this.selectedScopeType.split(':')[1] : this.selectedCourseId;

    const ctx: DashboardContext = {
      scope,
      scopeId,
      userId: environment.defaultUserId,
      activityId: this.selectedActivityId,
    };

    // Résoudre les noms pour affichage en lecture seule dans les pages enfants
    const courseName = this.selectedCourse?.name ?? '';
    const activityName = this.activities.find(a => a.id === this.selectedActivityId)?.name ?? this.selectedActivityId;
    const scopeName = isGroup
      ? (this.selectedCourse?.groups.find(g => g.id === scopeId)?.name ?? 'Groupe')
      : 'Cours entier';

    this.saveState(ctx, courseName, activityName, scopeName);
    this.contextChange.emit(ctx);

    // Déclencher le pré-calcul dès la sélection cours + activité, avant tout clic sur une carte
    this.indicatorService.precomputeContext(scope, scopeId, this.selectedActivityId)
      .subscribe({ error: () => {} });
  }

  private saveState(context?: DashboardContext, courseName?: string, activityName?: string, scopeName?: string): void {
    const prev = this.settingsService.getTeacherState();
    this.settingsService.saveTeacherState({
      courseId: this.selectedCourseId,
      activityId: this.selectedActivityId,
      scopeType: this.selectedScopeType,
      context: context ?? prev.context,
      courseName: courseName ?? prev.courseName,
      activityName: activityName ?? prev.activityName,
      scopeName: scopeName ?? prev.scopeName,
    });
  }
}
