// Simplified port of @platon/core/browser UserService (only findByIdOrName, used by user-avatar)
import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable, of } from 'rxjs'
import { catchError, map, shareReplay, tap } from 'rxjs/operators'

import { environment } from '../../environments/environment'
import { ListResponse, User, UserFilters, UserGroup, UserGroupFilters } from '../core-common'

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient)

  private users = new Map<string, User>()
  private findOneRequests = new Map<string, Observable<User | undefined>>()

  search(filters: UserFilters): Observable<ListResponse<User>> {
    return this.http
      .get<{ success: boolean; data: ListResponse<User> }>(`${environment.apiUrl}/users`, {
        params: filters as Record<string, string>,
      })
      .pipe(
        map((res) => (res?.success ? res.data : { resources: [], total: 0 })),
        catchError(() => of({ resources: [], total: 0 }))
      )
  }

  searchUserGroups(_filters: UserGroupFilters): Observable<ListResponse<UserGroup>> {
    return of({ resources: [], total: 0 })
  }

  findByIdOrName(idOrUsername: string): Observable<User | undefined> {
    const cache = this.users.get(idOrUsername)
    if (cache != null) {
      return of(cache)
    }

    const request = this.findOneRequests.get(idOrUsername)
    if (request != null) {
      return request
    }

    const obs = this.http.get<{ success: boolean; data: User }>(`${environment.apiUrl}/users/${idOrUsername}`).pipe(
      map((res) => (res?.success ? res.data : undefined)),
      catchError(() => of(undefined)),
      shareReplay(1),
      tap((user) => {
        if (user != null) {
          this.users.set(idOrUsername, user)
        }
      })
    )
    this.findOneRequests.set(idOrUsername, obs)
    return obs
  }
}
