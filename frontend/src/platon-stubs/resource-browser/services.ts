// Stub: @platon/feature/resource/browser services
import { Injectable } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Observable, of } from 'rxjs'
import { map } from 'rxjs/operators'

import {
  CircleTree,
  CreateResource,
  CreateResourceInvitation,
  FileVersions,
  GitLogResult,
  Resource,
  ResourceEvent,
  ResourceEventFilters,
  ResourceExpandableFields,
  ResourceFile,
  ResourceFilters,
  ResourceInvitation,
  ResourceMember,
  ResourceMemberFilters,
  UpdateResource,
} from '../resource-common'
import { User } from '../core-common'
import { ActivityExerciseGroup } from '../feature-compiler'
import { environment } from '../../environments/environment'

export const API = `${environment.apiUrl}/v1`

export function buildParams(filters: Record<string, unknown>): HttpParams {
  let params = new HttpParams()
  for (const [key, val] of Object.entries(filters)) {
    if (val == null || val === '' || key === 'expands') continue
    if (Array.isArray(val)) {
      for (const v of val) params = params.append(key, String(v))
    } else {
      params = params.set(key, String(val))
    }
  }
  return params
}

// ---- ResourceService ----

@Injectable({ providedIn: 'root' })
export class ResourceService {
  constructor(private readonly http: HttpClient) {}

  search(filters: ResourceFilters = {}): Observable<{ resources: Resource[]; total: number }> {
    return this.http.get<{ resources: Resource[]; total: number }>(
      `${API}/resources`,
      { params: buildParams(filters as Record<string, unknown>) },
    )
  }

  find(query: { id: string; expands?: ResourceExpandableFields[]; selects?: string[]; markAsViewed?: boolean }): Observable<Resource> {
    return this.http
      .get<{ resource: Resource }>(`${API}/resources/${query.id}`)
      .pipe(map((r) => r.resource))
  }

  tree(): Observable<CircleTree> {
    return this.http
      .get<{ resource: CircleTree }>(`${API}/resources/tree`)
      .pipe(map((r) => r.resource))
  }

  circle(_username: string): Observable<Resource> {
    const userId = JSON.parse(localStorage.getItem('currentUser') || '{}')?.id ?? ''
    return this.http
      .get<{ resource: Resource }>(`${API}/resources/user-circle`, {
        params: new HttpParams().set('userId', userId),
      })
      .pipe(map((r) => r.resource))
  }

  completion(): Observable<{ names: string[]; topics: string[]; levels: string[] }> {
    return this.http
      .get<{ resource: { names: string[]; topics: string[]; levels: string[] } }>(`${API}/resources/completion`)
      .pipe(map((r) => r.resource))
  }

  listOwners(): Observable<User[]> {
    return this.http
      .get<{ resources: User[] }>(`${API}/resources/owners`)
      .pipe(map((r) => r.resources))
  }

  update(_id: string, _input: UpdateResource): Observable<Resource> {
    return of({} as Resource)
  }

  create(_input: CreateResource): Observable<Resource> {
    return of({} as Resource)
  }

  delete(_resource: Resource): Observable<void> {
    return of(undefined)
  }

  join(_resource: Resource): Observable<void> {
    return of(undefined)
  }

  createWatcher(_resource: Resource): Observable<void> {
    return of(undefined)
  }

  deleteWatcher(_resource: Resource, _userId: string): Observable<void> {
    return of(undefined)
  }

  searchMembers(_resource: Resource, _filters?: ResourceMemberFilters): Observable<{ resources: ResourceMember[]; total: number }> {
    return of({ resources: [], total: 0 })
  }

  deleteMember(_resource: Resource, _userId: string): Observable<void> {
    return of(undefined)
  }

  acceptJoin(_resource: Resource, _userId: string): Observable<void> {
    return of(undefined)
  }

  declineJoin(_resource: Resource, _userId: string): Observable<void> {
    return of(undefined)
  }

  listInvitations(_resource: Resource): Observable<{ resources: ResourceInvitation[]; total: number }> {
    return of({ resources: [], total: 0 })
  }

  createInvitation(_resource: Resource, _input: CreateResourceInvitation): Observable<ResourceInvitation> {
    return of({} as ResourceInvitation)
  }

  deleteInvitation(_invitation: ResourceInvitation): Observable<void> {
    return of(undefined)
  }

  listEvents(_resource: Resource, _filters?: ResourceEventFilters): Observable<{ resources: ResourceEvent[]; total: number }> {
    return of({ resources: [], total: 0 })
  }

  duplicate(_id: string): Observable<Resource> {
    return of({} as Resource)
  }

  moveToOwnerCircle(_resource: Resource): Observable<void> {
    return of(undefined)
  }

  updateTemplate(_id: string, _templateId: string, _version: string): Observable<void> {
    return of(undefined)
  }

  deleteTemplate(_id: string): Observable<void> {
    return of(undefined)
  }

  updateCertification(_id: string, _certified: boolean): Observable<void> {
    return of(undefined)
  }

  editorUrl(_id: string, _version?: string, _templateId?: string): string {
    return '#'
  }

  previewUrl(_id: string, _version?: string): string {
    return '#'
  }
}

// ---- ResourceFileService ----

@Injectable({ providedIn: 'root' })
export class ResourceFileService {
  tree(_resource: Resource, _version?: string): Observable<ResourceFile> {
    return of({ path: '/', type: 'folder' as const, children: [] })
  }

  upload(_folder: ResourceFile, _file: File): Observable<void> {
    return of(undefined)
  }

  versions(_resourceOrId: Resource | string): Observable<FileVersions> {
    return of({ current: 'latest', versions: [], all: [] })
  }

  log(_resource: Resource): Observable<GitLogResult[]> {
    return of([])
  }

  release(_resource: Resource | string, _opts: { name: string; message: string }): Observable<void> {
    return of(undefined)
  }

  exerciseTree(_resource: Resource, _version?: string): Observable<ActivityExerciseGroup[]> {
    return of([])
  }

  content(_resource: string): Observable<string> {
    return of('')
  }
}
