import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, map, of, tap } from 'rxjs';
import { CourseActivity, IndicatorDefinition, IndicatorFeedback, IndicatorFeedbacksResult, IndicatorNotification, IndicatorSnapshot, IndicatorValue, StepDebugResult, TeacherCourse, ViewResult, EventTypeOption, EventRule, CreateEventRuleBody, InstallTriggerResult, IndicatorPin, IndicatorPinContextType, IndicatorThresholds } from '../models/indicator.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class IndicatorService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/indicators`;
  private readonly preferencesUrl = `${environment.apiUrl}/preferences`;

  private indicatorsCache$ = new BehaviorSubject<IndicatorDefinition[] | null>(null);
  private indicatorsLoaded = false;

  // Cache in-memory des préférences viz : indicatorId - vizId (chargé depuis la BDD au démarrage).
  private readonly vizPreferencesCache = new Map<string, string>();

  // Cache in-memory des visualisations activées par l'utilisateur : indicatorId -vizIds[] (absent = toutes activées).
  private readonly vizVisibilityCache = new Map<string, string[]>();

  // Lecture

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

  loadAllForAdmin(): Observable<IndicatorDefinition[]> {
    return this.http.get<IndicatorDefinition[]>(`${this.apiUrl}/all`);
  }

  getIndicatorValue(indicatorId: string, contextType: string, contextId: string): Observable<IndicatorValue> {
    const url = `${this.apiUrl}/${indicatorId}/values?contextType=${contextType}&contextId=${contextId}`;
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

  getUserPreferences(userId: string): Observable<{ activeIndicators: string[]; vizPreferences: Record<string, string>; vizVisibility: Record<string, string[]> }> {
    return this.http.get<{ activeIndicators: string[]; vizPreferences: Record<string, string>; vizVisibility: Record<string, string[]> }>(
      `${this.preferencesUrl}?userId=${encodeURIComponent(userId)}`,
    ).pipe(
      tap(prefs => {
        if (prefs.vizPreferences) {
          for (const [indicatorId, vizId] of Object.entries(prefs.vizPreferences)) {
            this.vizPreferencesCache.set(indicatorId, vizId);
          }
        }
        if (prefs.vizVisibility) {
          for (const [indicatorId, vizIds] of Object.entries(prefs.vizVisibility)) {
            this.vizVisibilityCache.set(indicatorId, vizIds);
          }
        }
      }),
    );
  }

  getUserPreference(userId: string, indicatorId: string): Observable<any> {
    return this.http.get<any>(
      `${this.preferencesUrl}/${encodeURIComponent(indicatorId)}?userId=${encodeURIComponent(userId)}`,
    );
  }

  // Écriture

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

  recalculateIndicator(indicatorId: string): Observable<{ processed: number; updated: number; failed: number }> {
    return this.http.post<{ processed: number; updated: number; failed: number }>(
      `${this.apiUrl}/${indicatorId}/recalculate`, {},
    );
  }

  // DSL preview

  previewFormulaRaw(
    formula: any,
    context: { userId?: string; groupId?: string; activityId?: string; courseId?: string },
  ): Observable<{ result: any }> {
    return this.http.post<{ result: any }>(`${this.apiUrl}/preview`, { formula, context });
  }

  previewFormulaSteps(
    formula: any,
    context: { userId?: string; groupId?: string; activityId?: string; courseId?: string },
  ): Observable<{ steps: StepDebugResult[] }> {
    return this.http.post<{ steps: StepDebugResult[] }>(`${this.apiUrl}/preview-steps`, { formula, context });
  }

  // Logs

  getExecutionLogs(indicatorId: string, limit = 50): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${indicatorId}/logs?limit=${limit}`);
  }

  getPlatonSchema(): Observable<{ name: string; columns: { name: string; type: string }[] }[]> {
    return this.http.get<{ name: string; columns: { name: string; type: string }[] }[]>(
      `${this.apiUrl}/schema`,
    );
  }

  getFullSchema(): Observable<{
    tables: { name: string; columns: { name: string; type: string; nullable: boolean }[] }[];
    relations: { sourceTable: string; sourceColumn: string; targetTable: string; targetColumn: string }[];
  }> {
    return this.http.get<any>(`${this.apiUrl}/schema/full`);
  }

  // Calcul de vue

  /*
  Calcule la formule d'un indicateur pour un contexte donné et persiste le résultat.
  - learner  : contextId = userId
  - group    : contextId = groupId, activityId OU courseId (voir isCourseAware)
  - course   : contextId = courseId, activityId requis
  - activity : contextId = activityId
  */
  computeView(
    indicatorId: string,
    contextType: string,
    contextId: string,
    activityId?: string,
    vizId?: string,
    courseId?: string,
  ): Observable<ViewResult> {
    return this.http.post<ViewResult>(`${this.apiUrl}/${indicatorId}/compute-view`, {
      contextType,
      contextId,
      ...(activityId ? { activityId } : {}),
      ...(vizId    ? { vizId }    : {}),
      ...(courseId ? { courseId } : {}),
    });
  }

  /* Recherche des cours par nom (toutes ressources PLaTon, pas seulement celles de
   l'utilisateur courant) - 10 résultats par page côté backend. `query` vide renvoie les
   premiers cours par ordre alphabétique. `offset` pour charger la page suivante.
  */
  searchCourses(query: string, offset = 0): Observable<TeacherCourse[]> {
    return this.http.get<TeacherCourse[]>(`${this.apiUrl}/courses/search?q=${encodeURIComponent(query)}&offset=${offset}`);
  }

  getCourseActivities(courseId: string): Observable<CourseActivity[]> {
    return this.http.get<CourseActivity[]>(`${this.apiUrl}/course/${courseId}/activities`);
  }

  /* Groupes de TP du cours - endpoint déjà utilisé pour la gestion des membres (courses.service.ts
   côté API), réutilisé ici plutôt que de dépendre du cache de recherche de cours (qui peut ne
   plus contenir le cours sélectionné une fois la liste rechargée).
  */
  getCourseGroups(courseId: string): Observable<{ id: string; name: string }[]> {
    /*
    "id" ici = CourseGroups.id (même champ que renvoyait déjà PlatonService#searchCourses
    pour ses groupes en cache) - pas group_id, un identifiant différent.
    L'endpoint renvoie { resources, total } (comme searchMembers) - pas un tableau brut.
    */
    return this.http.get<{ resources: { id: string; groupId: string; courseId: string; name: string }[]; total: number }>(
      `${environment.apiUrl}/v1/courses/${courseId}/groups`,
    ).pipe(
      map(res => res.resources.map(g => ({ id: g.id, name: g.name }))),
    );
  }

  getCourseStudents(courseId: string): Observable<{ id: string; name: string }[]> {
    return this.http.get<{ id: string; email: string; first_name: string; last_name: string }[]>(
      `${this.apiUrl}/course/${courseId}/students`,
    ).pipe(
      map(students => students.map(s => ({ id: s.id, name: `${s.first_name} ${s.last_name}`.trim() || s.email }))),
    );
  }

  // Snapshots

  getSnapshots(indicatorId: string, scope: { activityId: string } | { courseId: string }): Observable<IndicatorSnapshot[]> {
    const [key, value] = Object.entries(scope)[0];
    return this.http.get<IndicatorSnapshot[]>(
      `${this.apiUrl}/${indicatorId}/snapshots?${key}=${encodeURIComponent(value)}`,
    );
  }

  createSnapshot(
    indicatorId: string,
    body: { contextType: string; contextId: string; activityId?: string; courseId?: string; title: string },
  ): Observable<IndicatorSnapshot> {
    return this.http.post<IndicatorSnapshot>(`${this.apiUrl}/${indicatorId}/snapshots`, body);
  }

  updateSnapshotTitle(indicatorId: string, snapshotId: string, title: string): Observable<IndicatorSnapshot> {
    return this.http.patch<IndicatorSnapshot>(
      `${this.apiUrl}/${indicatorId}/snapshots/${snapshotId}`,
      { title },
    );
  }

  deleteSnapshot(indicatorId: string, snapshotId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${indicatorId}/snapshots/${snapshotId}`);
  }

  /*
  Pins (figer un indicateur sur un cours/activité)
  Totalement indépendant des préférences perso (ci-dessous) : aucune écriture
  croisée entre les deux, cf. IndicatorPinsService côté backend.
  */

  listPins(contextType: IndicatorPinContextType, contextId: string): Observable<IndicatorPin[]> {
    return this.http.get<IndicatorPin[]>(
      `${this.apiUrl}/pins?contextType=${contextType}&contextId=${encodeURIComponent(contextId)}`,
    );
  }

  // Nombre de pins par indicateur (tous cours/activités confondus), pour le label admin.
  countPinsByIndicator(): Observable<Record<string, number>> {
    return this.http.get<Record<string, number>>(`${this.apiUrl}/pins/counts`);
  }

  createPin(
    indicatorId: string,
    contextType: IndicatorPinContextType,
    contextId: string,
    thresholdsOverride?: IndicatorThresholds | null,
  ): Observable<IndicatorPin> {
    return this.http.post<IndicatorPin>(`${this.apiUrl}/${indicatorId}/pins`, { contextType, contextId, thresholdsOverride });
  }

  deletePin(indicatorId: string, contextType: IndicatorPinContextType, contextId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/${indicatorId}/pins?contextType=${contextType}&contextId=${encodeURIComponent(contextId)}`,
    );
  }

  //  Préférences viz (persistées en BDD via user-preferences) ─

  //Lit la visualisation active depuis le cache in-memory (chargé au démarrage via getUserPreferences)
  getVizPreference(indicatorId: string): string | null {
    return this.vizPreferencesCache.get(indicatorId) ?? null;
  }

  // Persiste la visualisation choisie en BDD et met à jour le cache local.
  setVizPreference(userId: string, indicatorId: string, vizId: string): void {
    this.vizPreferencesCache.set(indicatorId, vizId);
    this.http.patch(
      `${this.preferencesUrl}/${encodeURIComponent(indicatorId)}?userId=${encodeURIComponent(userId)}`,
      { activeVizId: vizId },
    ).subscribe();
  }

  // Visualisations que l'utilisateur a choisi d'afficher pour cet indicateur. `null` = toutes (réglage par défaut). */
  getEnabledVizIds(indicatorId: string): string[] | null {
    return this.vizVisibilityCache.get(indicatorId) ?? null;
  }

  // Indique si une visualisation donnée doit être affichée à l'utilisateur (toutes le sont par défaut).
  isVizEnabled(indicatorId: string, vizId: string): boolean {
    const enabled = this.vizVisibilityCache.get(indicatorId);
    return !enabled || enabled.includes(vizId);
  }

  // Persiste la liste des visualisations activées en BDD et met à jour le cache local. `null` réinitialise au défaut (toutes).
  setEnabledVizIds(userId: string, indicatorId: string, vizIds: string[] | null): void {
    if (vizIds) {
      this.vizVisibilityCache.set(indicatorId, vizIds);
    } else {
      this.vizVisibilityCache.delete(indicatorId);
    }
    this.http.patch(
      `${this.preferencesUrl}/${encodeURIComponent(indicatorId)}?userId=${encodeURIComponent(userId)}`,
      { enabledVizIds: vizIds },
    ).subscribe();
  }

  // Met à jour les préférences de l'utilisateur pour un indicateur (couleur personnalisée, visualisation active, etc.).
  updateUserPreference(userId: string, indicatorId: string, data: {
    displayPreferences?: { color?: string; icon?: string };
    activeVizId?: string;
  }): Observable<any> {
    if (data.activeVizId && data.displayPreferences === undefined) {
      this.vizPreferencesCache.set(indicatorId, data.activeVizId);
    }
    return this.http.patch(
      `${this.preferencesUrl}/${encodeURIComponent(indicatorId)}?userId=${encodeURIComponent(userId)}`,
      data,
    );
  }

  private invalidateCache(): void {
    this.indicatorsLoaded = false;
    this.indicatorsCache$.next(null);
  }

  // Feedbacks

  submitFeedback(indicatorId: string, userId: string, rating: number, comment?: string): Observable<IndicatorFeedback> {
    return this.http.post<IndicatorFeedback>(
      `${this.apiUrl}/${encodeURIComponent(indicatorId)}/feedback`,
      { userId, rating, comment },
    );
  }

  getFeedbacks(indicatorId: string): Observable<IndicatorFeedbacksResult> {
    return this.http.get<IndicatorFeedbacksResult>(
      `${this.apiUrl}/${encodeURIComponent(indicatorId)}/feedback`,
    );
  }

  deleteFeedback(indicatorId: string, feedbackId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/${encodeURIComponent(indicatorId)}/feedback/${encodeURIComponent(feedbackId)}`,
    );
  }

  // Notifications

  searchSimilar(q: string, excludeId?: string): Observable<IndicatorDefinition[]> {
    const params = excludeId ? `?q=${encodeURIComponent(q)}&excludeId=${encodeURIComponent(excludeId)}` : `?q=${encodeURIComponent(q)}`;
    return this.http.get<IndicatorDefinition[]>(`${this.apiUrl}/search${params}`);
  }

  sendNotification(indicatorId: string, title: string, message: string): Observable<IndicatorNotification> {
    return this.http.post<IndicatorNotification>(
      `${this.apiUrl}/${encodeURIComponent(indicatorId)}/notify`,
      { title, message },
    );
  }

  getNotifications(): Observable<IndicatorNotification[]> {
    return this.http.get<IndicatorNotification[]>(`${this.apiUrl}/notifications/all`);
  }

  // Types d'événements

  getEventTypes(configuredOnly = false): Observable<EventTypeOption[]> {
    const q = configuredOnly ? '?configured=true' : '';
    return this.http.get<EventTypeOption[]>(`${environment.apiUrl}/event-types${q}`);
  }

  createEventType(body: { name: string; label: string; description?: string }): Observable<EventTypeOption> {
    return this.http.post<EventTypeOption>(`${environment.apiUrl}/event-types`, body);
  }

  // Règles de déclenchement dynamiques

  getEventRules(): Observable<EventRule[]> {
    return this.http.get<EventRule[]>(`${environment.apiUrl}/event-rules`);
  }

  createEventRule(body: CreateEventRuleBody): Observable<EventRule> {
    return this.http.post<EventRule>(`${environment.apiUrl}/event-rules`, body);
  }

  updateEventRule(id: string, body: Partial<CreateEventRuleBody>): Observable<EventRule> {
    return this.http.patch<EventRule>(`${environment.apiUrl}/event-rules/${id}`, body);
  }

  deleteEventRule(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/event-rules/${id}`);
  }

  previewInstallSql(id: string): Observable<{ sql: string }> {
    return this.http.get<{ sql: string }>(`${environment.apiUrl}/event-rules/${id}/preview-sql`);
  }

  installTrigger(id: string): Observable<InstallTriggerResult> {
    return this.http.post<InstallTriggerResult>(`${environment.apiUrl}/event-rules/${id}/install`, {});
  }

  previewUninstallSql(id: string): Observable<{ sql: string }> {
    return this.http.get<{ sql: string }>(`${environment.apiUrl}/event-rules/${id}/preview-uninstall-sql`);
  }

  deleteAndUninstallEventRule(id: string): Observable<InstallTriggerResult> {
    return this.http.post<InstallTriggerResult>(`${environment.apiUrl}/event-rules/${id}/uninstall`, {});
  }

  reactivateEventRule(id: string): Observable<EventRule> {
    return this.http.post<EventRule>(`${environment.apiUrl}/event-rules/${id}/reactivate`, {});
  }

  previewHardDeleteSql(id: string): Observable<{ sql: string }> {
    return this.http.get<{ sql: string }>(`${environment.apiUrl}/event-rules/${id}/preview-hard-delete-sql`);
  }

  hardDeleteEventRule(id: string): Observable<InstallTriggerResult> {
    return this.http.post<InstallTriggerResult>(`${environment.apiUrl}/event-rules/${id}/hard-delete`, {});
  }

  deleteEventType(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/event-types/${id}`);
  }
}
