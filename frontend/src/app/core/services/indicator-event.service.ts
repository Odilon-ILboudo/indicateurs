// web/src/app/core/services/indicator-event.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface IndicatorEvent {
  type: string;
  userId?: string;
  courseId?: string;
  activityId?: string;
  exerciseId?: string;
  sessionId?: string;
  timestamp: Date;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

@Injectable({ providedIn: 'root' })
export class IndicatorEventService {
  private readonly http = inject(HttpClient);
  private readonly ingestUrl = environment.indicatorsApiUrl + '/ingest';
  
  private eventQueue: IndicatorEvent[] = [];
  private flushTimer: any;
  
  // L'utilisateur doit être passé depuis le composant qui appelle
  private currentUserId: string = 'anonymous';

  constructor() {
    // Envoyer les événements par lots toutes les 5 secondes
    this.flushTimer = setInterval(() => {
      this.flush();
    }, 5000);
  }

  setCurrentUserId(userId: string): void {
    this.currentUserId = userId;
  }

  sendEvent(event: Omit<IndicatorEvent, 'timestamp' | 'userId'>): void {
    const fullEvent: IndicatorEvent = {
      ...event,
      userId: this.currentUserId,
      timestamp: new Date(),
    };
    
    this.eventQueue.push(fullEvent);
    
    // Si la file est trop grosse, envoyer immédiatement
    if (this.eventQueue.length >= 50) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;
    
    const events = [...this.eventQueue];
    this.eventQueue = [];
    
    try {
      await this.http.post(this.ingestUrl + '/batch', events).toPromise();
    } catch (error) {
      console.error('Failed to send events:', error);
      this.eventQueue.unshift(...events);
    }
  }

  // Méthodes utilitaires pour envoyer des événements spécifiques
  sendExerciseAnswered(activityId: string, exerciseId: string, score: number, isCorrect: boolean, attempt: number): void {
    this.sendEvent({
      type: 'exercise.answered',
      activityId,
      exerciseId,
      payload: { score, isCorrect, attempt }
    });
  }

  sendSessionCompleted(activityId: string, durationInSeconds: number): void {
    this.sendEvent({
      type: 'session.completed',
      activityId,
      payload: { durationInSeconds }
    });
  }

  sendSessionStarted(courseId: string, activityId: string): void {
    this.sendEvent({
      type: 'session.start',
      courseId,
      activityId,
      payload: {}
    });
  }

  sendActivityViewed(activityId: string): void {
    this.sendEvent({
      type: 'activity.viewed',
      activityId,
      payload: {}
    });
  }

  sendCourseEnrolled(courseId: string): void {
    this.sendEvent({
      type: 'course.enrolled',
      courseId,
      payload: {}
    });
  }
}