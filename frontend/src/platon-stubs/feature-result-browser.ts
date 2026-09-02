// Stub: @platon/feature/result/browser
import { ChangeDetectionStrategy, Component, Injectable, Input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Observable, of } from 'rxjs'
import { ActivityResults, CourseLeaderboardEntry, ActivityLeaderboardEntry, ResourceDashboardModel, UserActivityResultsDistribution, ExerciseResults, UserResults } from './feature-result-common'
import { environment } from '../environments/environment'

export type { ResourceDashboardModel, ActivityResults, ExerciseResults, UserResults, UserActivityResultsDistribution } from './feature-result-common'

const API = `${environment.apiUrl}`

@Injectable({ providedIn: 'root' })
export class ResultService {
  constructor(private readonly http: HttpClient) {}

  courseLeaderboard(_opts: { courseId: string }): Observable<CourseLeaderboardEntry[]> {
    return of([])
  }

  activityLeaderboard(_opts: { activityId: string }): Observable<ActivityLeaderboardEntry[]> {
    return of([])
  }

  resourceDashboard(_resourceId: string): Observable<ResourceDashboardModel> {
    return of({ session: { averageScore: 0, averageDuration: 0, successRate: 0, answerDistribution: [], scoreDistribution: [], durationDistribution: [] } })
  }

  activityResults(activityId: string): Observable<ActivityResults> {
    // Le contrôleur accepte n'importe quel courseId (param inutilisé), '_' en placeholder
    return this.http.get<ActivityResults>(`${API}/v1/courses/_/activities/${activityId}/results`)
  }

  activityResultsForDate(activityId: string, startDate: Date, endDate: Date): Observable<UserActivityResultsDistribution[]> {
    const params = new HttpParams()
      .set('start', startDate.toISOString())
      .set('end', endDate.toISOString())
    return this.http.get<UserActivityResultsDistribution[]>(
      `${API}/v1/courses/_/activities/${activityId}/results/date`,
      { params },
    )
  }
}

// ---- ResultByExercisesComponent ----

@Component({
  standalone: true,
  selector: 'result-by-exercises',
  template: `
    <div *ngIf="!results?.length" style="color:#888;padding:1rem">Aucun résultat par exercice</div>
    <table *ngIf="results?.length" class="result-table">
      <thead>
        <tr>
          <th>Exercice</th>
          <th>Note moy.</th>
          <th>Tentatives moy.</th>
          <th>Taux réussite</th>
          <th>Taux réponse</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let e of results">
          <td>{{ e.title }}</td>
          <td>{{ e.grades?.avg | number:'1.0-1' }}</td>
          <td>{{ e.attempts?.avg | number:'1.0-1' }}</td>
          <td>{{ e.successRate?.avg }}%</td>
          <td>{{ e.answerRate?.avg }}%</td>
        </tr>
      </tbody>
    </table>
  `,
  styles: [`
    .result-table { width:100%; border-collapse:collapse; font-size:0.9rem; }
    th,td { padding:0.5rem 0.75rem; text-align:left; border-bottom:1px solid var(--brand-border-color-light,#f0f0f0); }
    th { background:var(--brand-background-components,#fafafa); font-weight:600; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ResultByExercisesComponent {
  @Input() results: ExerciseResults[] = []
}

// ---- ResultByMembersComponent ----

@Component({
  standalone: true,
  selector: 'result-by-members',
  template: `
    <div *ngIf="!results?.length" style="color:#888;padding:1rem">Aucun résultat par apprenant</div>
    <div *ngIf="results?.length" style="overflow-x:auto">
      <table class="members-table">
        <thead>
          <tr>
            <th>Apprenant</th>
            <th>Note moy.</th>
            <th>Tentatives</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let u of results">
            <td>{{ u.firstName }} {{ u.lastName }}</td>
            <td>{{ getAvgGrade(u) | number:'1.0-1' }}</td>
            <td>{{ getTotalAttempts(u) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .members-table { width:100%; border-collapse:collapse; font-size:0.9rem; }
    th,td { padding:0.5rem 0.75rem; text-align:left; border-bottom:1px solid var(--brand-border-color-light,#f0f0f0); }
    th { background:var(--brand-background-components,#fafafa); font-weight:600; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ResultByMembersComponent {
  @Input() results: UserResults[] = []
  @Input() columnOrder?: string[]

  protected getAvgGrade(u: UserResults): number {
    const exs = Object.values(u.exercises ?? {})
    if (!exs.length) return 0
    return exs.reduce((sum, e) => sum + (e.grade ?? 0), 0) / exs.length
  }

  protected getTotalAttempts(u: UserResults): number {
    return Object.values(u.exercises ?? {}).reduce((sum, e) => sum + (e.attempts ?? 0), 0)
  }
}

// ---- ResultLegendComponent ----

@Component({
  standalone: true,
  selector: 'result-legend',
  template: `
    <div class="legend">
      <div class="legend-item"><span class="dot succeeded"></span>Réussi (100)</div>
      <div class="legend-item"><span class="dot part-succ"></span>Partiellement réussi</div>
      <div class="legend-item"><span class="dot failed"></span>Échoué</div>
      <div class="legend-item"><span class="dot not-started"></span>Non commencé</div>
    </div>
  `,
  styles: [`
    .legend { display:flex; flex-wrap:wrap; gap:0.75rem 1.5rem; padding:0.75rem 0; }
    .legend-item { display:flex; align-items:center; gap:0.4rem; font-size:0.82rem; }
    .dot { width:12px; height:12px; border-radius:50%; display:inline-block; }
    .succeeded { background:#27ae60; }
    .part-succ { background:#f39c12; }
    .failed { background:#e74c3c; }
    .not-started { background:#bdc3c7; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ResultLegendComponent {}

// ---- KCileComponent (Result K-Cile) ----

@Component({
  standalone: true,
  selector: 'result-k-cile',
  template: `
    <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:0.9rem">
      Analyse K-Cile ({{ data?.length ?? 0 }} apprenants, {{ bucket }} seaux)
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class KCileComponent {
  @Input() bucket = 10
  @Input() data: UserActivityResultsDistribution[] = []
  @Input() lastDate?: Date
  @Input() splitDate?: Date
}

// ---- ResultBoxPlotComponent ----

@Component({
  standalone: true,
  selector: 'result-box-plot',
  template: `
    <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:0.9rem">
      Boîte à moustaches ({{ data?.length ?? 0 }} exercices)
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ResultBoxPlotComponent {
  @Input() data: ExerciseResults[] = []
}

// ---- ResultValueDistributionComponent ----

@Component({
  standalone: true,
  selector: 'result-value-distribution',
  template: `
    <div style="display:flex;align-items:center;justify-content:center;padding:1rem;color:#888;font-size:0.9rem">
      {{ legend ?? 'Distribution' }}
    </div>
    <ng-content></ng-content>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ResultValueDistributionComponent {
  @Input() legend?: string
  @Input() date?: Date
  @Input() distribution?: unknown
  @Input() isTimeValues?: boolean
  @Input() color?: string
  @Input() colorGradient?: string[]
}

// ---- ResultAnswerDistributionComponent ----

@Component({
  standalone: true,
  selector: 'result-answer-distribution',
  template: `
    <div style="display:flex;align-items:center;justify-content:center;padding:1rem;color:#888;font-size:0.9rem">
      Répartition des réponses
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ResultAnswerDistributionComponent {
  @Input() distribution?: unknown
}
