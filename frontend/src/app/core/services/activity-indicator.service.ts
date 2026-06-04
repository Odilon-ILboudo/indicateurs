// frontend/src/app/core/services/activity-indicator.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ActivityAttemptsData {
  userId: string;
  activityId: string;
  activityName: string;
  value: number;
  interpretation: string;
}

@Injectable({ providedIn: 'root' })
export class ActivityIndicatorService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/indicators/activity-attempts`;

  /**
   * Récupère la valeur de l'indicateur pour un utilisateur sur une activité
   * @param userId L'ID de l'utilisateur
   * @param activityId L'ID de l'activité
   * @returns Observable contenant les données de l'indicateur
   */
  /*getValue(userId: string, activityId: string): Observable<ActivityAttemptsData> {
    return this.http.get<ActivityAttemptsData>(`${this.apiUrl}/value?userId=${userId}&activityId=${activityId}`);
  }*/

  getValue(userId: string, activityId: string, indicatorId: string): Observable<ActivityAttemptsData> {
    return this.http.get<ActivityAttemptsData>(`${this.apiUrl}/value?userId=${userId}&activityId=${activityId}&indicatorId=${indicatorId}`);
  }
}