import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Group {
  id: string;
  name: string;
  courseId: string;
  courseName: string;
}

@Injectable({ providedIn: 'root' })
export class GroupService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/groups`;

  getGroupsForTeacher(teacherId: string): Observable<Group[]> {
    return this.http.get<Group[]>(`${this.apiUrl}?teacherId=${encodeURIComponent(teacherId)}`);
  }

  getGroupMembers(groupId: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/members?groupId=${encodeURIComponent(groupId)}`);
  }
}
