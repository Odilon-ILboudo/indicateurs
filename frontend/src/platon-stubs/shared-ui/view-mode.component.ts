import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NzIconModule } from 'ng-zorro-antd/icon'

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
