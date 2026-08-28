import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { combineLatest } from 'rxjs';

import { MatIconModule } from '@angular/material/icon';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSpinModule } from 'ng-zorro-antd/spin';

import { IndicatorService } from '../../../../core/services/indicator.service';
import { RoleService } from '../../../../core/services/role.service';
import { DashboardSettingsService } from '../../../../core/services/dashboard-settings.service';
import { DashboardContext, IndicatorDefinition, IndicatorScope } from '../../../../core/models/indicator.model';
import { IndicatorCardComponent } from '../../../../shared/ui/indicator-card/indicator-card.component';
import { GroupSnapshotsPanelComponent } from '../../../courses/course/activity/group-snapshots-panel.component';
import { isActivityAware, isCourseAware } from '../../../../shared/utils/indicator-formula.util';
import { getCurrentUserId } from '../../../../core/auth/current-user';

type ContextKind = 'activity' | 'course';

/**
 * Page "indicateurs de ce contexte" - montrable en mode embarqué, atteinte via query params
 * (?contextType=activity&activityId=...&courseId=...&activityName=...&courseName=... ou
 * contextType=course sans activityId) plutôt que via CoursePresenter/ActivityPresenter (qui
 * dépendent de @platon/* et n'ont pas de sens hors de l'app standalone).
 *
 * Reprend les mêmes trois sections que activity.page.ts (Mes statistiques / Indicateurs du
 * contexte / Indicateurs par groupe), fusionnées avec l'équivalent cours de dashboard.page.ts +
 * my-stats.page.ts - ces deux pages standalone séparaient ce qui est unifié ici en une seule
 * page paramétrable par contextType.
 *
 * Volontairement absent de cette première version : la gestion des pins (figer un indicateur) -
 * nécessite une vérification de permission enseignant sur le contexte, hors périmètre initial.
 */
@Component({
  standalone: true,
  selector: 'app-context-indicators',
  templateUrl: './context-indicators.page.html',
  styleUrls: ['./context-indicators.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    NzDividerModule,
    NzEmptyModule,
    NzGridModule,
    NzSpinModule,
    IndicatorCardComponent,
    GroupSnapshotsPanelComponent,
  ],
})
export class ContextIndicatorsPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly indicatorService = inject(IndicatorService);
  private readonly roleService = inject(RoleService);
  private readonly settingsService = inject(DashboardSettingsService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected contextKind: ContextKind = 'activity';
  protected activityId = '';
  protected courseId = '';
  protected activityName = '';
  protected courseName = '';

  protected loading = true;
  protected collapsedGlobal = false;
  protected collapsedGroup = false;

  protected scopedIndicators: IndicatorDefinition[] = [];
  protected groupIndicators: IndicatorDefinition[] = [];
  protected learnerIndicators: IndicatorDefinition[] = [];
  protected teacherIndicators: IndicatorDefinition[] = [];
  protected adminIndicators: IndicatorDefinition[] = [];

  protected scopedContext: DashboardContext | null = null;
  protected learnerContext: DashboardContext | null = null;
  protected teacherContext: DashboardContext | null = null;
  protected adminContext: DashboardContext | null = null;

  protected queryParams: Record<string, string> = {};

  ngOnInit(): void {
    const q = this.route.snapshot.queryParams;
    this.contextKind = q['contextType'] === 'course' ? 'course' : 'activity';
    this.activityId = q['activityId'] ?? '';
    this.courseId = q['courseId'] ?? '';
    this.activityName = q['activityName'] ?? 'Activité';
    this.courseName = q['courseName'] ?? 'Cours';

    this.queryParams = this.contextKind === 'activity'
      ? { from: 'activity', activityId: this.activityId, courseId: this.courseId, activityName: this.activityName, courseName: this.courseName }
      : { from: 'course', courseId: this.courseId, courseName: this.courseName };

    this.loadIndicators();
  }

  protected personalQueryParams(contextType: string): Record<string, string> {
    return {
      ...this.queryParams,
      from: this.contextKind === 'activity' ? 'activity-personal' : 'course-personal',
      contextType,
    };
  }

  private loadIndicators(): void {
    this.loading = true;
    this.cdr.markForCheck();

    combineLatest([
      this.indicatorService.loadIndicators(),
      this.settingsService.getSettings(),
      this.roleService.role$,
    ]).subscribe({
      next: ([indicators, settings]) => {
        const visible = indicators.filter(ind =>
          this.roleService.canSeeIndicatorContext(ind.contextType, ind.visibilityRoles) &&
          settings.activeIndicators.includes(ind.id));

        const aware = this.contextKind === 'activity' ? isActivityAware : isCourseAware;

        this.scopedIndicators = visible.filter(ind => ind.contextType === this.contextKind);
        this.groupIndicators = visible.filter(ind => ind.contextType === 'group' && aware(ind.formula));
        this.learnerIndicators = visible.filter(ind => ind.contextType === 'learner' && aware(ind.formula));
        this.teacherIndicators = visible.filter(ind => ind.contextType === 'teacher' && aware(ind.formula));
        this.adminIndicators = visible.filter(ind => ind.contextType === 'admin' && aware(ind.formula));

        const scopeId = this.contextKind === 'activity' ? this.activityId : this.courseId;
        this.scopedContext = { scope: this.contextKind as IndicatorScope, scopeId, userId: '' };

        const personalCtx = (scope: 'learner' | 'teacher' | 'admin'): DashboardContext =>
          this.contextKind === 'activity'
            ? { scope, scopeId: getCurrentUserId(), userId: getCurrentUserId(), activityId: this.activityId }
            : { scope, scopeId: getCurrentUserId(), userId: getCurrentUserId(), courseId: this.courseId };
        this.learnerContext = personalCtx('learner');
        this.teacherContext = personalCtx('teacher');
        this.adminContext = personalCtx('admin');

        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
}
