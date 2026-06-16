// Stub: @platon/shared/ui
import {
  AfterContentInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  ContentChildren,
  Directive,
  EventEmitter,
  forwardRef,
  inject,
  Input,
  NgModule,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  Pipe,
  PipeTransform,
  QueryList,
  TemplateRef,
  booleanAttribute,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule, ActivatedRoute } from '@angular/router'
import { Observable, Subscription, combineLatest, of } from 'rxjs'
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators'
import { HttpErrorResponse } from '@angular/common/http'
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { NzTooltipModule } from 'ng-zorro-antd/tooltip'
import { NzInputNumberModule } from 'ng-zorro-antd/input-number'
import { MatIconModule } from '@angular/material/icon'
import { MatChipsModule } from '@angular/material/chips'
import { HTTP_STATUS_CODE } from './core-common'

// ---- Types ----

export declare type LayoutState = 'LOADING' | 'READY' | 'NOT_FOUND' | 'SERVER_ERROR' | 'FORBIDDEN'

export function layoutStateFromError(error: unknown): LayoutState {
  const status = (error as HttpErrorResponse)?.status ?? HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR
  if (status === HTTP_STATUS_CODE.UNAUTHORIZED || status === HTTP_STATUS_CODE.FORBIDDEN) return 'FORBIDDEN'
  if (status >= HTTP_STATUS_CODE.BAD_REQUEST && status < HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR) return 'NOT_FOUND'
  return 'SERVER_ERROR'
}

export interface SearchBar<T> {
  placeholder?: string
  value?: string
  clearOnSelect?: boolean
  filterer?: {
    run: (query: string) => Observable<T[]>
  }
  onSearch?: (query?: string) => void
  onSelect?: (item: T) => void
  onFilter?: () => void
  onReady?: () => void
  complete?: (item: T) => string
}

export interface FilterIndicator<T = unknown> {
  match: (filters: T) => boolean
  remove: (filters: T) => T
  describe(filters: T): string | Promise<string>
}

export const PeriodFilterMatcher: FilterIndicator<{ period?: number }> = {
  match: (filters) => filters.period != null && filters.period !== 0,
  remove: (filters) => ({ ...filters, period: undefined }),
  describe: (filters) => {
    const labels: Record<number, string> = { 1: '1 jour', 7: '1 semaine', 31: '1 mois', 180: '6 mois', 365: '1 an' }
    return `Modifié dans la période : ${labels[filters.period ?? 0] ?? `${filters.period} jours`}`
  },
}

// ---- Pipes ----

@Pipe({ standalone: true, name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform(value: number): string {
    if (!value) return '0 min'
    const hours = Math.floor(value / 3600)
    const minutes = Math.floor((value % 3600) / 60)
    if (hours > 0) return `${hours}h ${minutes}min`
    return `${minutes} min`
  }
}

// ---- UiLayoutTabDirective ----

@Directive({ standalone: true, selector: 'ui-layout-tab' })
export class UiLayoutTabDirective {
  @Input() link!: string | string[]
  @Input() linkParams?: Record<string, unknown>

  @ContentChild(TemplateRef, { static: true })
  templateRef!: TemplateRef<void>
}

// ---- UiLayoutTabsComponent ----

@Component({
  standalone: true,
  selector: 'ui-layout-tabs',
  template: `
    <nz-skeleton [nzActive]="true" [nzLoading]="state === 'LOADING'">
      <ng-content></ng-content>
    </nz-skeleton>
    <ng-container *ngIf="state === 'READY'">
      <nav class="tab-nav">
        <a
          *ngFor="let tab of tabs; trackBy: trackByIndex"
          class="tab-link"
          [routerLink]="tab.link"
          [queryParams]="tab.linkParams || null"
          routerLinkActive="tab-active"
          [routerLinkActiveOptions]="{ exact: false }"
        >
          <ng-container *ngTemplateOutlet="tab.templateRef"></ng-container>
        </a>
      </nav>
    </ng-container>
    <ng-container [ngSwitch]="state">
      <ng-container *ngSwitchCase="'READY'">
        <router-outlet />
      </ng-container>
      <ng-container *ngSwitchCase="'LOADING'">
        <nz-skeleton [nzActive]="true" [nzLoading]="true">
          <p></p>
        </nz-skeleton>
      </ng-container>
      <ng-container *ngSwitchCase="'NOT_FOUND'">
        <p style="padding:2rem;text-align:center">Ressource non trouvée</p>
      </ng-container>
      <ng-container *ngSwitchCase="'FORBIDDEN'">
        <p style="padding:2rem;text-align:center">Accès refusé</p>
      </ng-container>
      
      <ng-container *ngSwitchCase="'SERVER_ERROR'">
        <p style="padding:2rem;text-align:center">Erreur serveur</p>
      </ng-container>
    </ng-container>
  `,
  styles: [`
    :host { display: block; }
    .tab-nav {
      display: flex;
      border-bottom: 1px solid var(--brand-border-color, rgba(0,0,0,0.12));
      margin-bottom: 1.5rem;
      overflow-x: auto;
    }
    .tab-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 12px 16px;
      color: var(--brand-text-secondary, rgba(85,85,85,0.87));
      text-decoration: none;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      font-size: 14px;
      white-space: nowrap;
      transition: color 0.2s, border-color 0.2s;
      cursor: pointer;
    }
    .tab-link:hover {
      color: var(--brand-color-primary, #171c8f);
    }
    .tab-active {
      color: var(--brand-color-primary, #171c8f) !important;
      border-bottom-color: var(--brand-color-primary, #171c8f) !important;
      font-weight: 500;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, NzSkeletonModule],
})
export class UiLayoutTabsComponent implements AfterContentInit, OnDestroy {
  private readonly subscriptions: Subscription[] = []

  @Input() state: LayoutState = 'READY'

  @ContentChildren(UiLayoutTabDirective)
  query!: QueryList<UiLayoutTabDirective>

  protected tabs: UiLayoutTabDirective[] = []
  protected selectedTabIndex = 0

  constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  async ngAfterContentInit(): Promise<void> {
    const handleChanges = (results: UiLayoutTabDirective[]) => {
      this.tabs = Array.from(results)
      this.changeDetectorRef.markForCheck()
    }

    handleChanges(this.query.toArray())

    this.subscriptions.push(
      (this.query.changes as Observable<UiLayoutTabDirective[]>).subscribe((results) => {
        handleChanges(results)
      })
    )

    await this.refreshSelectedTabIndex()
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  protected trackByIndex(index: number): number {
    return index
  }

  private async refreshSelectedTabIndex(): Promise<void> {
    const path = this.route.snapshot.firstChild?.routeConfig?.path?.split('?')[0]
    const links = this.tabs.map((t) => (Array.isArray(t.link) ? t.link[0] : t.link))
    this.selectedTabIndex = links.findIndex((l) => l === path)
    this.changeDetectorRef.markForCheck()
  }
}

// ---- UiStatisticCardComponent ----

export const positiveGreenColor = (value: number) => {
  if (value >= 80) return '#52C41A'
  if (value > 40 && value < 90) return 'var(--brand-text-primary, #090A39D9)'
  if (value == 0) return '#FF1414'
  return '#FAAD14'
}

export const positiveRedColor = (value: number) => {
  if (value >= 80) return '#FAAD14'
  if (value > 40 && value < 90) return 'var(--brand-text-primary, #090A39D9)'
  return '#52C41A'
}

@Component({
  standalone: true,
  selector: 'ui-statistic-card',
  template: `
    <div class="statistic-card" (click)="onCardClick()" [ngClass]="{ editable: edit }">
      <div [style.background-color]="ribbonColor" class="ribbon" *ngIf="icon || matIcon || nzIcon">
        <span>
          <ng-container *ngIf="icon">
            <ng-container *ngTemplateOutlet="icon"></ng-container>
          </ng-container>
          <mat-icon class="ribbon-icon" *ngIf="matIcon">{{ matIcon }}</mat-icon>
          <span class="ribbon-icon" *ngIf="nzIcon" nz-icon [nzType]="nzIcon" nzTheme="outline"></span>
        </span>
      </div>
      <div class="value" [style.color]="valueColor">
        <ng-container *ngIf="!isEditing">{{ value }} {{ valueSuffix }}</ng-container>
        <ng-container *ngIf="isEditing">
          <nz-input-number
            (keydown)="onKeydown($event)"
            nzId="input-edit-value"
            [(ngModel)]="value"
            nzMin="0"
            nzMax="100"
            (focusout)="onFocusOut()"
          />
        </ng-container>
      </div>
      <div class="description">
        {{ description }} <mat-icon *ngIf="tooltip" [nz-tooltip]="tooltip">info_circle</mat-icon>
      </div>
      <div>
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .statistic-card {
      position: relative;
      width: 100%;
      padding: 20px;
      background-color: var(--brand-background-components, #fff);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      border-radius: 8px;
    }
    .value {
      font-size: 1.8em;
      font-weight: bold;
      color: var(--brand-text-primary, #000);
    }
    .description {
      display: flex;
      gap: 4px;
      align-items: center;
      margin-top: 10px;
      font-size: 16px;
      color: var(--brand-text-secondary, #666);
    }
    .ribbon {
      position: absolute;
      top: 0;
      right: 0;
      width: 32px;
      height: 32px;
      background-color: #3498db;
      clip-path: polygon(100% 0, 100% 70%, 50% 100%, 0 70%, 0 0);
      border-top-right-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .ribbon .ribbon-icon {
      margin: 0;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .editable {
      cursor: pointer;
      user-select: none;
    }
    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, NzIconModule, NzTooltipModule, NzInputNumberModule],
})
export class UiStatisticCardComponent implements OnChanges {
  protected isEditing = false

  @Input() icon?: TemplateRef<unknown>
  @Input() nzIcon?: string
  @Input() matIcon?: string
  @Input() value!: number | string
  @Input() valueSuffix = ''
  @Input() valueColor = 'var(--brand-text-primary, #000)'
  @Input() tooltip?: string
  @Input() description!: string
  @Input() ribbonColor = '#3498db'
  @Input({ transform: booleanAttribute }) shouldBePositive?: boolean
  @Input({ transform: booleanAttribute }) shouldBeZero?: boolean
  @Input() edit = false

  @Output() valueChanged = new EventEmitter<number>()

  ngOnChanges() {
    if (this.shouldBePositive) {
      this.valueColor = positiveGreenColor(Number(this.value))
    }
    if (this.shouldBeZero) {
      this.valueColor = positiveRedColor(Number(this.value))
    }
  }

  onCardClick() {
    if (this.edit) {
      this.isEditing = true
      setTimeout(() => {
        const input = document.getElementById('input-edit-value')
        if (input) input.focus()
      }, 0)
    }
  }

  onFocusOut() {
    this.isEditing = false
    this.valueChanged.emit(Number(this.value))
  }

  onKeydown(event: KeyboardEvent) {
    event.stopPropagation()
    event.stopImmediatePropagation()
    if (event.key === 'Enter') {
      this.isEditing = false
      this.valueChanged.emit(Number(this.value))
    } else if (event.key === 'Escape') {
      this.isEditing = false
    }
    this.ngOnChanges()
  }
}

export { UiSearchBarComponent } from './shared-ui/search-bar/search-bar.component'
export { UiFilterIndicatorComponent } from './shared-ui/filter-indicators/filter-indicators.component'
export { UiModalTemplateComponent } from './shared-ui/modal-template/modal-template.component'

// ---- UiViewModeComponent ----

@Component({
  standalone: true,
  selector: 'ui-view-mode',
  template: `
    <div class="view-mode-toggle">
      <button
        *ngFor="let m of modes"
        class="mode-btn"
        [class.active]="mode === m"
        (click)="setMode(m)"
      >
        <span nz-icon [nzType]="getIcon(m)" nzTheme="outline"></span>
      </button>
    </div>
  `,
  styles: [`
    .view-mode-toggle { display: flex; gap: 4px; }
    .mode-btn { background: var(--brand-surface, #fff); border: 1px solid var(--brand-border, #d9d9d9); border-radius: 4px; padding: 4px 8px; cursor: pointer; }
    .mode-btn.active { background: var(--brand-color-primary, #1890ff); color: white; border-color: var(--brand-color-primary, #1890ff); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzIconModule],
})
export class UiViewModeComponent implements OnInit {
  @Input() storageKey = 'view-mode'
  @Input() defaultMode = 'cards'
  @Input() modes: string[] = ['cards', 'table']

  mode = 'cards'

  ngOnInit(): void {
    this.mode = localStorage.getItem(this.storageKey) || this.defaultMode
  }

  protected setMode(m: string): void {
    this.mode = m
    localStorage.setItem(this.storageKey, m)
  }

  protected getIcon(m: string): string {
    const icons: Record<string, string> = { cards: 'appstore', table: 'table', list: 'unordered-list' }
    return icons[m] || 'appstore'
  }
}

// ---- UiModalIFrameComponent ----

@Component({
  standalone: true,
  selector: 'ui-modal-iframe',
  template: `
    <div *ngIf="visible" class="iframe-modal" [style.width]="width" [style.height]="height">
      <button *ngIf="closable" class="close-btn" (click)="close()">×</button>
      <iframe *ngIf="url" [src]="url" class="iframe-content"></iframe>
    </div>
  `,
  styles: [`
    .iframe-modal { position: fixed; top: 0; left: 0; z-index: 1000; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }
    .close-btn { position: absolute; top: 1rem; right: 1rem; background: white; border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.2rem; }
    .iframe-content { width: 90vw; height: 90vh; border: none; }
  `],
  imports: [CommonModule],
})
export class UiModalIFrameComponent {
  @Input() width = '100vw'
  @Input() height = '100vh'
  @Input() closable = true

  @Output() closed = new EventEmitter<void>()

  protected visible = false
  protected url?: string

  open(url: string): void {
    this.url = url
    this.visible = true
  }

  close(): void {
    this.visible = false
    this.url = undefined
    this.closed.emit()
  }
}

// ---- UiQRCodeComponent ----

@Component({
  standalone: true,
  selector: 'ui-qrcode',
  template: `
    <div class="qrcode-placeholder" [title]="value">
      <span nz-icon nzType="qrcode" nzTheme="outline" style="font-size:4rem;color:#888"></span>
      <p class="qrcode-value" *ngIf="value">{{ value }}</p>
    </div>
  `,
  styles: [`
    .qrcode-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .qrcode-value { font-size: 0.7rem; color: #888; word-break: break-all; text-align: center; max-width: 160px; margin-top: 0.5rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzIconModule],
})
export class UiQRCodeComponent {
  @Input() value = ''
}

// ---- UiError403Component ----

@Component({
  standalone: true,
  selector: 'ui-error-403',
  template: `
    <div class="error-403">
      <span nz-icon nzType="lock" nzTheme="outline" style="font-size:3rem;color:#ccc"></span>
      <p>Vous n'avez pas les droits nécessaires pour accéder à cette section.</p>
    </div>
  `,
  styles: [`.error-403 { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem; color: #888; text-align: center; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NzIconModule],
})
export class UiError403Component {}

// ---- UiFilePreviewComponent ----

@Component({
  standalone: true,
  selector: 'ui-file-preview',
  template: `<div class="file-preview"><ng-content></ng-content></div>`,
  styles: [`.file-preview { width: 100%; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class UiFilePreviewComponent {
  @Input() url?: string
  @Input() language?: string
}

// ---- UiLayoutBlockComponent ----

@Component({
  standalone: true,
  selector: 'ui-layout-block',
  template: `
    @if (state === 'LOADING') {
      <div style="display:flex;align-items:center;justify-content:center;padding:2rem;color:#888">Chargement…</div>
    } @else if (state === 'ERROR') {
      <div style="display:flex;align-items:center;justify-content:center;padding:2rem;color:#f44">Erreur de chargement</div>
    } @else {
      <ng-content></ng-content>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class UiLayoutBlockComponent {
  @Input() state: string = 'READY'
}
