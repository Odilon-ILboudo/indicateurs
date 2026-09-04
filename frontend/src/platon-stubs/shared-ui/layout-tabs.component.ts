import {
  AfterContentInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChildren,
  Input,
  OnDestroy,
  QueryList,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { RouterModule, ActivatedRoute } from '@angular/router'
import { Observable, Subscription } from 'rxjs'
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton'
import { LayoutState } from './layout-types'
import { UiLayoutTabDirective } from './layout-tab.directive'

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
