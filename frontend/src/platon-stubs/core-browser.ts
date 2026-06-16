// Stub: @platon/core/browser
import { ChangeDetectionStrategy, Component, Directive, EventEmitter, Injectable, Input, NgModule, Output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { firstValueFrom, Observable, of } from 'rxjs'
import { environment } from '../environments/environment'
import { User, UserGroup, UserRoles } from './core-common'
import { Topic, Level, ListResponse } from './core-common'
import { Routes } from '@angular/router'

@Injectable({ providedIn: 'root' })
export class AuthService {
  private cachedUser?: User

  constructor(private http: HttpClient) {}

  async ready(): Promise<User> {
    if (this.cachedUser) return this.cachedUser
    try {
      const res = await firstValueFrom(
        this.http.get<{ success: boolean; data: User }>(`${environment.apiUrl}/users/${environment.defaultUserId}`)
      )
      if (res?.success && res.data) {
        this.cachedUser = res.data
        return res.data
      }
    } catch {
      // fall through to default
    }
    this.cachedUser = {
      id: environment.defaultUserId,
      username: 'default',
      firstName: 'Utilisateur',
      lastName: '',
      role: UserRoles.teacher,
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

// ---- UserSearchModalComponent ----

@Component({
  standalone: true,
  selector: 'user-search-modal',
  template: `
    <div *ngIf="visible" class="search-modal-backdrop" (click)="close()">
      <div class="search-modal" (click)="$event.stopPropagation()">
        <h3>{{ title }}</h3>
        <ng-content></ng-content>
        <div class="modal-actions">
          <button (click)="confirm()">{{ okTitle }}</button>
          <button (click)="close()">Annuler</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .search-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
    .search-modal { background: #fff; border-radius: 8px; padding: 1.5rem; min-width: 400px; max-width: 600px; }
    h3 { margin: 0 0 1rem; }
    .modal-actions { display: flex; gap: 0.5rem; margin-top: 1rem; justify-content: flex-end; }
    button { padding: 6px 14px; border-radius: 4px; border: 1px solid #d9d9d9; cursor: pointer; }
    button:first-child { background: #1890ff; color: #fff; border-color: #1890ff; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class UserSearchModalComponent {
  @Input() title = 'Sélectionner'
  @Input() okTitle = 'OK'
  @Input() multi = false
  @Input() excludes: string[] = []
  @Input() filters: Record<string, unknown> = {}
  @Input() allowGroup = false

  @Output() closed = new EventEmitter<(User | UserGroup)[]>()

  protected visible = false

  open(): void {
    this.visible = true
  }

  close(): void {
    this.visible = false
    this.closed.emit([])
  }

  confirm(): void {
    this.visible = false
    this.closed.emit([])
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
