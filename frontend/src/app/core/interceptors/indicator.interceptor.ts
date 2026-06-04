import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs/operators';
import { IndicatorEventService } from '../services/indicator-event.service';

export const indicatorInterceptor: HttpInterceptorFn = (req, next) => {
  const eventService = inject(IndicatorEventService);
  const methodsToTrack = ['POST', 'PUT', 'PATCH', 'DELETE'];
  
  if (methodsToTrack.includes(req.method)) {
    return next(req).pipe(
      tap(event => {
        // Vérifier si c'est une réponse HTTP
        if (event.type === 4 && event.status === 200) { // HttpEventType.Response
          extractAndSendEvents(req, event.body, eventService);
        }
      })
    );
  }
  
  return next(req);
};

function extractAndSendEvents(req: any, response: any, eventService: IndicatorEventService): void {
  // Extraction des IDs
  const extractId = (url: string, resource: string): string | null => {
    const regex = new RegExp(`/${resource}/([^/]+)`);
    const match = url.match(regex);
    return match ? match[1] : null;
  };
  
  // Cas: Réponse à un exercice
  if (req.url.includes('/exercises/') && req.url.includes('/answers')) {
    const exerciseId = extractId(req.url, 'exercises');
    const activityId = extractId(req.url, 'activities');
    
    eventService.sendExerciseAnswered(
      activityId || 'unknown',
      exerciseId || 'unknown',
      response?.score || 0,
      response?.isCorrect || false,
      response?.attempt || 1
    );
  }
  
  // Cas: Démarrage d'une session
  if (req.url.includes('/sessions') && req.method === 'POST') {
    eventService.sendSessionStarted(
      req.body?.courseId,
      req.body?.activityId
    );
  }
  
  // Cas: Complétion d'une session
  if (req.url.includes('/sessions') && req.method === 'PUT' && req.url.includes('/complete')) {
    eventService.sendSessionCompleted(
      req.body?.activityId,
      req.body?.durationInSeconds || 0
    );
  }
}