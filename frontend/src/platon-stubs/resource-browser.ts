// Stub: @platon/feature/resource/browser
import { ChangeDetectionStrategy, Component, EventEmitter, Injectable, Input, NgModule, Output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { HttpClient, HttpParams } from '@angular/common/http'
import { RouterModule } from '@angular/router'
import { Observable, of } from 'rxjs'
import { map } from 'rxjs/operators'
import { NzEmptyModule } from 'ng-zorro-antd/empty'
import { NzTagModule } from 'ng-zorro-antd/tag'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { MatIconModule } from '@angular/material/icon'

import {
  CircleTree,
  CreateResourceInvitation,
  FileVersion,
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
  ResourceOrderings,
  ResourceStatus,
  ResourceTypes,
  UpdateResource,
} from './resource-common'
import { FilterIndicator } from './shared-ui'
import { Topic, Level, User } from './core-common'
import { ActivityExerciseGroup } from './feature-compiler'
import { environment } from '../environments/environment'

const API = `${environment.apiUrl}/v1`

function buildParams(filters: Record<string, unknown>): HttpParams {
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

  find(query: { id: string; expands?: ResourceExpandableFields[]; markAsViewed?: boolean }): Observable<Resource> {
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
    // We use userId from environment since we don't have real username→userId lookup
    return this.http
      .get<{ resource: Resource }>(`${API}/resources/user-circle`, {
        params: new HttpParams().set('userId', environment.defaultUserId),
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
    return of({ path: '/', type: 'dir' as const, children: [] })
  }

  versions(_resourceOrId: Resource | string): Observable<FileVersions> {
    return of({ current: 'latest', versions: [], all: [] })
  }

  log(_resource: Resource): Observable<GitLogResult[]> {
    return of([])
  }

  release(_resource: Resource, _opts: { name: string; message: string }): Observable<void> {
    return of(undefined)
  }

  exerciseTree(_resource: Resource, _version?: string): Observable<ActivityExerciseGroup[]> {
    return of([])
  }
}

// ---- Status constants ----

export const RESOURCE_STATUS_NAMES: Record<string, string> = {
  READY: 'Prêt',
  BUGGED: 'Buggé',
  DEPRECATED: 'Déprécié',
  NOT_TESTED: 'Non testé',
}

export const RESOURCE_STATUS_COLORS_HEX: Record<string, string> = {
  READY: '#27ae60',
  BUGGED: '#e74c3c',
  DEPRECATED: '#f39c12',
  NOT_TESTED: '#95a5a6',
}

// ---- ResourceVersionComponent ----

@Component({
  standalone: true,
  selector: 'resource-version',
  template: `<div *ngIf="version" class="version-info"><strong>{{ version.tag }}</strong> - {{ version.message }}</div>`,
  styles: [`.version-info { font-size: 0.85rem; color: #666; margin: 0.5rem 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ResourceVersionComponent {
  @Input() version?: FileVersion
}

// ---- ResourceVersioningComponent ----

@Component({
  standalone: true,
  selector: 'resource-versioning',
  template: `
    <div *ngIf="visible" class="versioning-modal-backdrop" (click)="close()">
      <div class="versioning-modal" (click)="$event.stopPropagation()">
        <h3>Nouvelle version</h3>
        <input [(ngModel)]="tag" placeholder="Nom de la version (ex: v1.0)" />
        <input [(ngModel)]="message" placeholder="Message" />
        <div class="modal-footer">
          <button (click)="create()">Créer</button>
          <button (click)="close()">Annuler</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .versioning-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
    .versioning-modal { background: #fff; border-radius: 8px; padding: 1.5rem; min-width: 360px; }
    input { display: block; width: 100%; margin: 0.5rem 0; padding: 6px 10px; border: 1px solid #d9d9d9; border-radius: 4px; }
    .modal-footer { display: flex; gap: 0.5rem; margin-top: 1rem; justify-content: flex-end; }
    button { padding: 6px 14px; border-radius: 4px; border: 1px solid #d9d9d9; cursor: pointer; }
    button:first-child { background: #1890ff; color: #fff; border-color: #1890ff; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
})
export class ResourceVersioningComponent {
  @Input() resource?: Resource
  @Output() versionCreated = new EventEmitter<string>()

  protected visible = false
  protected tag = ''
  protected message = ''

  open(): void { this.visible = true }
  close(): void { this.visible = false }
  create(): void { this.visible = false; this.versionCreated.emit(this.tag) }
}

// ---- ResourceFilesComponent ----

@Component({
  standalone: true,
  selector: 'resource-files',
  template: `
    <div class="files-container">
      <div *ngIf="!tree || !tree.children?.length" style="padding:2rem;color:#888;text-align:center">
        Aucun fichier disponible
      </div>
      <ul *ngIf="tree?.children?.length" class="file-tree">
        <li *ngFor="let f of tree!.children" class="file-item" (click)="selected.emit(f)">
          <span nz-icon [nzType]="f.type === 'dir' ? 'folder' : 'file'" nzTheme="outline"></span>
          {{ f.path.split('/').pop() }}
        </li>
      </ul>
    </div>
  `,
  styles: [`
    .files-container { border: 1px solid #f0f0f0; border-radius: 4px; min-height: 200px; }
    .file-tree { list-style: none; padding: 0.5rem; margin: 0; }
    .file-item { display: flex; align-items: center; gap: 0.5rem; padding: 6px 8px; cursor: pointer; border-radius: 4px; }
    .file-item:hover { background: #f5f5f5; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzIconModule],
})
export class ResourceFilesComponent {
  @Input() tree?: ResourceFile
  @Input() exerciseTree?: unknown[]
  @Input() gitLog?: GitLogResult[]

  @Output() selected = new EventEmitter<ResourceFile>()
  @Output() afterUpload = new EventEmitter<void>()

  download(): void { /* stub */ }
  upload(): void { /* stub */ }
}

// ---- ResourceEventListComponent ----

@Component({
  standalone: true,
  selector: 'resource-event-list',
  template: `
    <div *ngIf="items.length === 0" style="padding:2rem;text-align:center;color:#888">Aucun événement</div>
    <ul *ngIf="items.length > 0" class="event-list">
      <li *ngFor="let e of items" class="event-item">
        <span class="event-type">{{ e.type }}</span>
        <span class="event-date">{{ e.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
      </li>
    </ul>
  `,
  styles: [`
    .event-list { list-style: none; padding: 0; margin: 0; }
    .event-item { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #f0f0f0; }
    .event-type { font-weight: 500; }
    .event-date { font-size: 0.82rem; color: #888; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ResourceEventListComponent {
  @Input() items: ResourceEvent[] = []
}

// ---- ResourceMemberTableComponent ----

@Component({
  standalone: true,
  selector: 'resource-member-table',
  template: `
    <table class="member-table" *ngIf="members.length">
      <thead><tr><th>Utilisateur</th><th>Rôle</th><th *ngIf="canDelete || canAccept">Actions</th></tr></thead>
      <tbody>
        <tr *ngFor="let m of members">
          <td>{{ m.userId }}</td>
          <td>{{ m.role }}</td>
          <td *ngIf="canDelete || canAccept">
            <button *ngIf="canAccept" (click)="accept.emit(m)">Accepter</button>
            <button *ngIf="canDelete && !excludeFromDelete.includes(m.userId)" (click)="deleted.emit(m)">Retirer</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p *ngIf="!members.length" style="color:#888;padding:1rem">Aucun membre</p>
  `,
  styles: [`.member-table { width: 100%; border-collapse: collapse; } th,td { padding: 0.5rem 1rem; border-bottom: 1px solid #f0f0f0; text-align: left; } button { margin: 0 4px; padding: 2px 8px; cursor: pointer; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ResourceMemberTableComponent {
  @Input() members: ResourceMember[] = []
  @Input() canDelete = false
  @Input() canAccept = false
  @Input() excludeFromDelete: string[] = []

  @Output() deleted = new EventEmitter<ResourceMember>()
  @Output() accept = new EventEmitter<ResourceMember>()
}

// ---- ResourceInvitationFormComponent ----

@Component({
  standalone: true,
  selector: 'resource-invitation-form',
  template: `
    <div class="invitation-form">
      <input [(ngModel)]="userId" placeholder="ID de l'utilisateur" />
      <button (click)="sendInvitation()">Inviter</button>
    </div>
  `,
  styles: [`.invitation-form { display: flex; gap: 0.5rem; margin-bottom: 1rem; } input { flex: 1; padding: 6px 10px; border: 1px solid #d9d9d9; border-radius: 4px; } button { padding: 6px 14px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
})
export class ResourceInvitationFormComponent {
  @Input() excludes: string[] = []
  @Output() send = new EventEmitter<CreateResourceInvitation>()

  protected userId = ''

  sendInvitation(): void {
    if (this.userId) {
      this.send.emit({ userId: this.userId, role: 'collaborator' })
      this.userId = ''
    }
  }
}

// ---- ResourceInvitationTableComponent ----

@Component({
  standalone: true,
  selector: 'resource-invitation-table',
  template: `
    <table *ngIf="invitations.length" class="inv-table">
      <thead><tr><th>Utilisateur</th><th *ngIf="editable">Actions</th></tr></thead>
      <tbody>
        <tr *ngFor="let inv of invitations">
          <td>{{ inv.inviteeId || inv.userId }}</td>
          <td *ngIf="editable"><button (click)="deleted.emit(inv)">Annuler</button></td>
        </tr>
      </tbody>
    </table>
    <p *ngIf="!invitations.length" style="color:#888;padding:1rem">Aucune invitation</p>
  `,
  styles: [`.inv-table { width: 100%; border-collapse: collapse; } th,td { padding: 0.5rem 1rem; border-bottom: 1px solid #f0f0f0; text-align: left; } button { padding: 2px 8px; cursor: pointer; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ResourceInvitationTableComponent {
  @Input() invitations: ResourceInvitation[] = []
  @Input() editable = false

  @Output() deleted = new EventEmitter<ResourceInvitation>()
}

// ---- CircleTreeComponent ----

@Component({
  standalone: true,
  selector: 'resource-circle-tree',
  template: `
    <div class="circle-tree">
      <div *ngIf="tree?.name" class="circle-node">
        <mat-icon>account_tree</mat-icon>
        <span>{{ tree!.name }}</span>
        <div *ngFor="let child of tree!.children" class="circle-child">
          <mat-icon>folder</mat-icon>
          <span>{{ child.name }}</span>
        </div>
      </div>
      <p *ngIf="!tree?.name" style="color:#888">Aucun cercle</p>
    </div>
  `,
  styles: [`
    .circle-tree { min-width: 200px; }
    .circle-node, .circle-child { display: flex; align-items: center; gap: 0.5rem; padding: 4px 0; cursor: pointer; }
    .circle-child { padding-left: 1.5rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
})
export class CircleTreeComponent {
  @Input() tree?: CircleTree
}

// ---- ResourceItemComponent (must be before ResourceListComponent) ----

@Component({
  standalone: true,
  selector: 'resource-item',
  template: `
    <div *ngIf="item" class="resource-item" [routerLink]="[item.id, 'overview']">
      <div class="resource-icon">
        <mat-icon>{{ getIcon(item.type) }}</mat-icon>
      </div>
      <div class="resource-info">
        <div class="resource-name">{{ item.name }}</div>
        <div class="resource-desc" *ngIf="!simple && item.desc">{{ item.desc }}</div>
        <div class="resource-meta" *ngIf="!simple">
          <nz-tag *ngIf="item.status" [nzColor]="getStatusColor(item.status)">{{ item.status }}</nz-tag>
          <nz-tag *ngIf="item.type">{{ item.type }}</nz-tag>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .resource-item {
      display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem;
      border-radius: 8px; cursor: pointer;
      background: var(--brand-surface, #fff);
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      transition: box-shadow 0.2s;
    }
    .resource-item:hover { box-shadow: 0 3px 10px rgba(0,0,0,0.1); }
    .resource-icon mat-icon { font-size: 1.75rem; width: 1.75rem; height: 1.75rem; color: var(--brand-color-primary, #1890ff); }
    .resource-info { flex: 1; }
    .resource-name { font-weight: 500; color: var(--brand-text-primary, #333); }
    .resource-desc { font-size: 0.82rem; color: var(--brand-text-secondary, #888); }
    .resource-meta { display: flex; gap: 0.5rem; margin-top: 4px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, MatIconModule, NzTagModule],
})
export class ResourceItemComponent {
  @Input() item?: Resource
  @Input() simple = false
  @Output() levelClicked = new EventEmitter<string>()
  @Output() topicClicked = new EventEmitter<string>()

  protected getIcon(type: string): string {
    const icons: Record<string, string> = { CIRCLE: 'folder', EXERCISE: 'assignment', ACTIVITY: 'play_circle_filled' }
    return icons[type] ?? 'description'
  }

  protected getStatusColor(status: string): string {
    const colors: Record<string, string> = { READY: 'green', BUGGED: 'red', DEPRECATED: 'orange', NOT_TESTED: 'default' }
    return colors[status] ?? 'default'
  }
}

// ---- ResourceListComponent (after ResourceItemComponent) ----

@Component({
  standalone: true,
  selector: 'resource-list',
  template: `
    <div *ngIf="items.length > 0; else empty" class="resource-list">
      <resource-item
        *ngFor="let item of items"
        [item]="item"
        [simple]="simple"
        (levelClicked)="levelClicked.emit($event)"
        (topicClicked)="topicClicked.emit($event)"
      />
    </div>
    <ng-template #empty>
      <nz-empty [nzNotFoundContent]="emptyContent">
        <ng-template #emptyContent><ng-content></ng-content></ng-template>
      </nz-empty>
    </ng-template>
  `,
  styles: [`.resource-list { display: flex; flex-direction: column; gap: 0.75rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzEmptyModule, ResourceItemComponent],
})
export class ResourceListComponent {
  @Input() items: Resource[] = []
  @Input() simple = false
  @Output() levelClicked = new EventEmitter<string>()
  @Output() topicClicked = new EventEmitter<string>()
}

// ---- ResourceFiltersComponent ----

@Component({
  standalone: true,
  selector: 'resource-filters',
  template: `<ng-template></ng-template>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ResourceFiltersComponent {
  @Input() filters: ResourceFilters = {}
  @Input() levels: Level[] = []
  @Input() topics: Topic[] = []
  @Input() circles: CircleTree[] = []
  @Input() owners: User[] = []
  @Output() triggered = new EventEmitter<ResourceFilters>()

  open(): void { /* stub */ }
}

// ---- ResourceSharingComponent ----

@Component({
  standalone: true,
  selector: 'resource-sharing',
  template: `<p style="padding: 0.5rem;">Partage de la ressource {{ resourceId }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ResourceSharingComponent {
  @Input() resourceId?: string
  @Input() canEditSharing = false
}

// ---- ResourcePipesModule ----

@NgModule({})
export class ResourcePipesModule {}

// ---- Filter indicator helper functions ----

export function ResourceTypeFilterIndicator(type: ResourceTypes): FilterIndicator<ResourceFilters> {
  const labels: Record<string, string> = { CIRCLE: 'Cercle', EXERCISE: 'Exercice', ACTIVITY: 'Activité' }
  return {
    match: (f) => (f.types ?? []).includes(type as keyof typeof ResourceTypes),
    remove: (f) => ({ ...f, types: (f.types ?? []).filter((t) => t !== type) }),
    describe: () => labels[type] ?? type,
  }
}

export function ResourceStatusFilterIndicator(status: ResourceStatus): FilterIndicator<ResourceFilters> {
  const labels: Record<string, string> = { READY: 'Prêt', BUGGED: 'Buggé', DEPRECATED: 'Déprécié', NOT_TESTED: 'Non testé' }
  return {
    match: (f) => (f.status ?? []).includes(status as keyof typeof ResourceStatus),
    remove: (f) => ({ ...f, status: (f.status ?? []).filter((s) => s !== status) }),
    describe: () => labels[status] ?? status,
  }
}

export function ResourceOrderingFilterIndicator(ordering: ResourceOrderings): FilterIndicator<ResourceFilters> {
  const labels: Record<string, string> = { NAME: 'Nom', CREATED_AT: 'Date créé', UPDATED_AT: 'Date modifié', RELEVANCE: 'Pertinence' }
  return {
    match: (f) => f.order === ordering,
    remove: (f) => ({ ...f, order: undefined }),
    describe: () => `Tri : ${labels[ordering] ?? ordering}`,
  }
}

export function ResourceDependOnFilterIndicator(): FilterIndicator<ResourceFilters> {
  return {
    match: (f) => (f.dependOn ?? []).length > 0,
    remove: (f) => ({ ...f, dependOn: undefined }),
    describe: () => 'Dépend de',
  }
}

export function TopicFilterIndicator(topic: Topic): FilterIndicator<ResourceFilters> {
  return {
    match: (f) => (f.topics ?? []).includes(topic.id),
    remove: (f) => ({ ...f, topics: (f.topics ?? []).filter((id) => id !== topic.id) }),
    describe: () => topic.name,
  }
}

export function AntiTopicFilterIndicator(topic: Topic): FilterIndicator<ResourceFilters> {
  return {
    match: (f) => (f.antiTopics ?? []).includes(topic.id),
    remove: (f) => ({ ...f, antiTopics: (f.antiTopics ?? []).filter((id) => id !== topic.id) }),
    describe: () => `Exclure : ${topic.name}`,
  }
}

export function LevelFilterIndicator(level: Level): FilterIndicator<ResourceFilters> {
  return {
    match: (f) => (f.levels ?? []).includes(level.id),
    remove: (f) => ({ ...f, levels: (f.levels ?? []).filter((id) => id !== level.id) }),
    describe: () => level.name,
  }
}

export function OwnerFilterIndicator(owner: User): FilterIndicator<ResourceFilters> {
  return {
    match: (f) => (f.owners ?? []).includes(owner.id),
    remove: (f) => ({ ...f, owners: (f.owners ?? []).filter((id) => id !== owner.id) }),
    describe: () => owner.username,
  }
}

export function CircleFilterIndicator(circle: CircleTree): FilterIndicator<ResourceFilters> {
  return {
    match: (f) => (f.parents ?? []).includes(circle.id),
    remove: (f) => ({ ...f, parents: (f.parents ?? []).filter((id) => id !== circle.id) }),
    describe: () => circle.name,
  }
}

export const ExerciseConfigurableFilterIndicator: FilterIndicator<ResourceFilters> = {
  match: (f) => f.configurable === true,
  remove: (f) => ({ ...f, configurable: undefined }),
  describe: () => 'Configurable',
}

export function antTagColorFromPercentage(_value: number): string {
  return 'blue'
}
