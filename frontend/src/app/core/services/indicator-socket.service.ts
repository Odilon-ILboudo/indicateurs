import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject, filter } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface IndicatorUpdateEvent {
  indicatorId: string;
  indicatorName: string;
  contextType: string;
  contextId: string;
  value: number;
  eventType: string;
  timestamp: Date;
}

@Injectable({ providedIn: 'root' })
export class IndicatorSocketService implements OnDestroy {
  private socket: Socket;
  private updates$ = new Subject<IndicatorUpdateEvent>();
  private connected = false;

  constructor() {
    const serverUrl = environment.apiUrl.replace('/api', '');
    this.socket = io(`${serverUrl}/indicators`, {
      transports: ['websocket'],
      autoConnect: false,
    });

    this.socket.on('connect', () => {
      this.connected = true;
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
    });

    this.socket.on('indicator.updated', (payload: IndicatorUpdateEvent) => {
      this.updates$.next(payload);
    });
  }

  connect(): void {
    if (!this.connected) this.socket.connect();
  }

  disconnect(): void {
    if (this.connected) this.socket.disconnect();
  }

  /** Observable filtré par indicatorId + contextType + contextId */
  watchIndicator(
    indicatorId: string,
    contextType: string,
    contextId: string,
  ): Observable<IndicatorUpdateEvent> {
    return this.updates$.pipe(
      filter(e =>
        e.indicatorId === indicatorId &&
        e.contextType === contextType &&
        e.contextId === contextId,
      ),
    );
  }

  /** Observable de toutes les mises à jour (pour un dashboard global) */
  watchAll(): Observable<IndicatorUpdateEvent> {
    return this.updates$.asObservable();
  }

  ngOnDestroy(): void {
    this.socket.disconnect();
    this.updates$.complete();
  }
}
