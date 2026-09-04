// Stub: @platon/core/browser
import { booleanAttribute, ChangeDetectionStrategy, ChangeDetectorRef, Component, Directive, EventEmitter, inject, Injectable, Input, NgModule, Output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { FormsModule } from '@angular/forms'
import { firstValueFrom, Observable, of } from 'rxjs'
import { User, UserGroup, UserRoles, UserFilters } from './core-common'
import { Topic, Level, ListResponse } from './core-common'
import { Routes } from '@angular/router'
import { UserSearchBarComponent } from './core-browser/user-search-bar/user-search-bar.component'

@Injectable({ providedIn: 'root' })
export class AuthService {
  private cachedUser?: User

  constructor(private http: HttpClient) {}

  async ready(): Promise<User> {
    if (this.cachedUser) return this.cachedUser
    const stored = localStorage.getItem('currentUser')
    if (stored) {
      this.cachedUser = JSON.parse(stored)
      return this.cachedUser!
    }
    this.cachedUser = {
      id: '',
      username: 'anonymous',
      firstName: 'Utilisateur',
      lastName: '',
      role: UserRoles.student,
      email: '',
    }
    return this.cachedUser
  }
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  success(message: string): void {
    console.log('[Dialog success]', message)
  }

  error(message: string): void {
    console.error('[Dialog error]', message)
  }

  info(message: string): void {
    console.log('[Dialog info]', message)
  }

  warning(message: string): void {
    console.warn('[Dialog warning]', message)
  }

  async loading(title: string, action: () => Promise<void>): Promise<void> {
    await action()
  }
}

@NgModule({})
export class DialogModule {}

@Injectable({ providedIn: 'root' })
export class StorageService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set<T>(key: string, value: T): Observable<any> {
    localStorage.setItem(key, JSON.stringify(value))
    return of(undefined)
  }

  get<T>(key: string, defaultValue?: T): Observable<T> {
    const raw = localStorage.getItem(key)
    return of(raw == null ? (defaultValue as T) : (JSON.parse(raw) as T))
  }

  remove(key: string): Observable<void> {
    localStorage.removeItem(key)
    return of(undefined)
  }
}

export { UserAvatarComponent } from './core-browser/user-avatar/user-avatar.component'
export { UserGroupAvatarComponent } from './core-browser/user-group-avatar/user-group-avatar.component'
export { UserSearchBarComponent } from './core-browser/user-search-bar/user-search-bar.component'
export { UserService } from './core-browser/user.service'

@Injectable({ providedIn: 'root' })
export class TagService {
  listTopics(): Observable<Topic[]> {
    return of([])
  }

  listLevels(): Observable<Level[]> {
    return of([])
  }

  createTopic(_input: { name: string; force?: boolean }): Observable<Topic & { existing?: boolean }> {
    return of({ id: crypto.randomUUID(), name: _input.name })
  }

  createLevel(_input: { name: string; force?: boolean }): Observable<Level & { existing?: boolean }> {
    return of({ id: crypto.randomUUID(), name: _input.name })
  }
}

// withAuthGuard: no real auth needed - returns route as-is
export function withAuthGuard(route: Record<string, unknown>, _roles?: string[]): Record<string, unknown> {
  return route
}

/*
---- UserSearchModalComponent ----
La barre <user-search-bar> pilote la sélection via [(ngModel)] ; "confirm" émet cette
sélection - sans elle, "closed" émettait toujours [] au clic.
*/

@Component({
  standalone: true,
  selector: 'user-search-modal',
  template: `
    <div *ngIf="visible" class="search-modal-backdrop" (click)="close()">
      <div class="search-modal" (click)="$event.stopPropagation()">
        <h3>{{ title }}</h3>
        <ng-content></ng-content>
        <user-search-bar
          [filters]="filters"
          [multi]="multi"
          [excludes]="excludes"
          [allowGroup]="allowGroup"
          [(ngModel)]="selection"
        />
        <div class="modal-actions">
          <button class="ok" (click)="confirm()" [disabled]="!ready">{{ okTitle }}</button>
          <button (click)="close()">Annuler</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .search-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
    .search-modal { background: #fff; border-radius: 8px; padding: 1.5rem; min-width: 400px; max-width: 600px; max-height: 80vh; overflow-y: auto; }
    h3 { margin: 0 0 1rem; }
    .modal-actions { display: flex; gap: 0.5rem; margin-top: 1rem; justify-content: flex-end; }
    button { padding: 6px 14px; border-radius: 4px; border: 1px solid #d9d9d9; cursor: pointer; }
    button.ok { background: #1890ff; color: #fff; border-color: #1890ff; }
    button.ok:disabled { background: #d9d9d9; border-color: #d9d9d9; cursor: not-allowed; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, UserSearchBarComponent],
})
export class UserSearchModalComponent {
  @Input() title = 'Sélectionner'
  @Input() okTitle = 'OK'
  @Input({ transform: booleanAttribute }) multi = false
  @Input() excludes: string[] = []
  @Input() filters: UserFilters = {}
  @Input({ transform: booleanAttribute }) allowGroup = false

  @Output() closed = new EventEmitter<(User | UserGroup)[]>()

  private readonly changeDetectorRef = inject(ChangeDetectorRef)

  protected visible = false
  protected selection: (User | UserGroup)[] = []

  protected get ready(): boolean {
    const n = this.selection.length
    return !this.multi ? n === 1 : n > 0
  }

  /*
  `open()` est appelé depuis le template du PARENT (via une référence #addModal), pas par un
  événement interne à ce composant OnPush : sans markForCheck() ici, Angular ne re-vérifie
  jamais ce composant et la modale reste invisible malgré `visible = true`.
  */
  open(): void {
    this.visible = true
    this.selection = []
    this.changeDetectorRef.markForCheck()
  }

  close(): void {
    this.visible = false
    this.closed.emit([])
    this.changeDetectorRef.markForCheck()
  }

  confirm(): void {
    if (!this.ready) return
    this.visible = false
    this.closed.emit(this.selection)
    this.selection = []
    this.changeDetectorRef.markForCheck()
  }
}

// ---- CoreEchartsDirective ----

@Directive({
  standalone: true,
  selector: '[coreEcharts]',
})
export class CoreEchartsDirective {
  @Input() options?: unknown
  @Input() autoResize = true

  @Output() chartClick = new EventEmitter<unknown>()
}
