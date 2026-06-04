// frontend/src/app/core/services/indicator.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, map, of, tap } from 'rxjs';
import { ContextConfig, CourseActivity, IndicatorDefinition, IndicatorValue, TeacherCourse, ViewResult } from '../models/indicator.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class IndicatorService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/indicators`;
  private readonly preferencesUrl = `${environment.apiUrl}/preferences`;

  private indicatorsCache$ = new BehaviorSubject<IndicatorDefinition[] | null>(null);
  private indicatorsLoaded = false;

  // ── Lecture ──────────────────────────────────────────────────────────────

  loadIndicators(): Observable<IndicatorDefinition[]> {
    if (this.indicatorsLoaded && this.indicatorsCache$.value) {
      return of(this.indicatorsCache$.value);
    }
    return this.http.get<IndicatorDefinition[]>(this.apiUrl).pipe(
      tap(indicators => {
        this.indicatorsCache$.next(indicators);
        this.indicatorsLoaded = true;
      }),
    );
  }

  /** Charge TOUS les indicateurs (actifs + inactifs) pour l'interface admin. */
  loadAllForAdmin(): Observable<IndicatorDefinition[]> {
    return this.http.get<IndicatorDefinition[]>(`${this.apiUrl}/all`);
  }

  getIndicatorValue(indicatorId: string, contextId: string): Observable<IndicatorValue> {
    const url = `${this.apiUrl}/${indicatorId}/values?contextType=learner&contextId=${contextId}`;
    return this.http.get<{ values: IndicatorValue[] }>(url).pipe(
      map(response => response.values[0] || { value: 0, timestamp: new Date() }),
    );
  }

  getIndicatorHistory(indicatorId: string, contextId: string, limit = 30): Observable<IndicatorValue[]> {
    const url = `${this.apiUrl}/${indicatorId}/values?contextType=learner&contextId=${contextId}&limit=${limit}`;
    return this.http.get<{ values: IndicatorValue[] }>(url).pipe(
      map(response => response.values),
    );
  }

  getUserPreferences(userId: string): Observable<{ activeIndicators: string[] }> {
    return this.http.get<{ activeIndicators: string[] }>(
      `${this.preferencesUrl}?userId=${encodeURIComponent(userId)}`,
    );
  }

  // ── Écriture ─────────────────────────────────────────────────────────────

  /** Crée un nouvel indicateur depuis le builder admin (remplace le seed script). */
  createIndicator(data: Partial<IndicatorDefinition> & { formula?: any }): Observable<IndicatorDefinition> {
    this.invalidateCache();
    return this.http.post<IndicatorDefinition>(this.apiUrl, data);
  }

  updateIndicator(indicatorId: string, data: any): Observable<IndicatorDefinition> {
    this.invalidateCache();
    return this.http.patch<IndicatorDefinition>(`${this.apiUrl}/${indicatorId}`, data);
  }

  updateIndicatorStatus(indicatorId: string, isActive: boolean): Observable<IndicatorDefinition> {
    this.invalidateCache();
    return this.http.patch<IndicatorDefinition>(`${this.apiUrl}/${indicatorId}/status`, { isActive });
  }

  deleteIndicator(indicatorId: string): Observable<void> {
    this.invalidateCache();
    return this.http.delete<void>(`${this.apiUrl}/${indicatorId}`);
  }

  setUserIndicatorVisibility(userId: string, indicatorId: string, isVisible: boolean, userRole?: string): Observable<any> {
    return this.http.patch(
      `${this.preferencesUrl}/${encodeURIComponent(indicatorId)}?userId=${encodeURIComponent(userId)}`,
      { isVisible, ...(userRole ? { userRole } : {}) },
    );
  }

  getIndicatorUsageCount(indicatorId: string): Observable<number> {
    return this.http.get<{ usageCount: number }>(`${this.apiUrl}/${indicatorId}/usage`).pipe(
      map(r => r.usageCount),
    );
  }

  /** Prévisualise une formule DSL sur des données réelles sans persister. */
  previewFormula(formula: any, context: { userId: string; activityId: string }): Observable<{ value: number }> {
    return this.http.post<{ value: number }>(`${this.apiUrl}/preview`, { formula, context });
  }

  /** Recalcule toutes les valeurs d'un indicateur DSL pour tous les utilisateurs actifs. */
  recalculateIndicator(indicatorId: string): Observable<{ processed: number; updated: number; failed: number }> {
    return this.http.post<{ processed: number; updated: number; failed: number }>(
      `${this.apiUrl}/${indicatorId}/recalculate`, {},
    );
  }

  // ── Versioning des formules (tâche 4) ─────────────────────────────────────

  getFormulaHistory(indicatorId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${indicatorId}/formula-history`);
  }

  rollbackFormula(indicatorId: string, versionId: string): Observable<IndicatorDefinition> {
    return this.http.post<IndicatorDefinition>(
      `${this.apiUrl}/${indicatorId}/rollback/${versionId}`, {},
    );
  }

  // ── Logs d'exécution (tâche 5) ────────────────────────────────────────────

  getExecutionLogs(indicatorId: string, limit = 50): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${indicatorId}/logs?limit=${limit}`);
  }

  /** Retourne les tables PLaTon disponibles et leurs colonnes (pour le builder). */
  getPlatonSchema(): Observable<{ name: string; columns: { name: string; type: string }[] }[]> {
    return this.http.get<{ name: string; columns: { name: string; type: string }[] }[]>(
      `${this.apiUrl}/schema`,
    );
  }

  // ── Multi-contexte / Multi-vue ────────────────────────────────────────────

  /** Retourne les contextConfigs effectifs d'un indicateur (avec rétro-compatibilité legacy). */
  getContextConfigs(indicatorId: string): Observable<ContextConfig[]> {
    return this.http.get<ContextConfig[]>(`${this.apiUrl}/${indicatorId}/context-configs`);
  }

  /**
   * Calcule une vue spécifique pour un contexte donné et persiste le résultat.
   * - learner : contextId = userId
   * - group   : contextId = groupId (CourseGroups.id)
   * - course  : contextId = courseId
   */
  computeView(
    indicatorId: string,
    contextType: string,
    contextId: string,
    viewId: string,
    activityId?: string,
  ): Observable<ViewResult> {
    return this.http.post<ViewResult>(`${this.apiUrl}/${indicatorId}/compute-view`, {
      contextType,
      contextId,
      viewId,
      ...(activityId ? { activityId } : {}),
    });
  }

  getTeacherContext(teacherId: string): Observable<TeacherCourse[]> {
    return this.http.get<TeacherCourse[]>(`${this.apiUrl}/teacher/${teacherId}/context`);
  }

  getCourseActivities(courseId: string): Observable<CourseActivity[]> {
    return this.http.get<CourseActivity[]>(`${this.apiUrl}/course/${courseId}/activities`);
  }

  /** Pré-calcule toutes les vues de tous les indicateurs actifs pour un contexte donné. Fire-and-forget. */
  precomputeContext(contextType: string, contextId: string, activityId: string): Observable<{ computed: number }> {
    return this.http.post<{ computed: number }>(`${this.apiUrl}/precompute-context`, {
      contextType, contextId, activityId,
    });
  }

  /**
   * Prévisualise le résultat brut d'un pipeline DSL sans persister.
   * Retourne le résultat tel quel (number | object | array).
   */
  previewFormulaRaw(
    formula: any,
    context: { userId?: string; groupId?: string; activityId?: string },
  ): Observable<{ result: any }> {
    return this.http.post<{ result: any }>(`${this.apiUrl}/preview`, { formula, context });
  }

  private invalidateCache(): void {
    this.indicatorsLoaded = false;
    this.indicatorsCache$.next(null);
  }
}
