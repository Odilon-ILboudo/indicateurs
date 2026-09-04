import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core'
import { CommonModule } from '@angular/common'
import { RouterModule } from '@angular/router'
import { MatIconModule } from '@angular/material/icon'
import { NzBadgeModule } from 'ng-zorro-antd/badge'
import { NzProgressModule } from 'ng-zorro-antd/progress'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { NzToolTipModule } from 'ng-zorro-antd/tooltip'
import { Course } from '../course-common'

@Component({
  standalone: true,
  selector: 'course-item',
  template: `
    @if (item.statistic) {
      <nz-ribbon [nzText]="ribbonTpl" [nzColor]="progressColor">
        <ng-container *ngTemplateOutlet="articleTpl"></ng-container>
      </nz-ribbon>
    } @else {
      <ng-container *ngTemplateOutlet="articleTpl"></ng-container>
    }

    <ng-template #ribbonTpl>
      <nz-progress [nzPercent]="item.statistic?.progression ?? 0" [nzSteps]="5" nzSize="small" />
    </ng-template>

    <ng-template #articleTpl>
      <article class="mat-elevation-z1" [routerLink]="[item.id]">
        <div class="article-content-wrapper">
          <header class="article-header">
            <div class="article-image">
              <mat-icon>local_library</mat-icon>
            </div>
            <div class="article-title">{{ item.name }}</div>
          </header>
          <p class="article-description">{{ item.desc }}</p>
          <footer class="article-footer">
            <ng-container *ngIf="item.statistic">
              <div class="action" nz-tooltip="Enseignants">
                <mat-icon class="action-icon">supervised_user_circle</mat-icon>
                <span class="action-title">{{ item.statistic.teacherCount }}</span>
              </div>
              <div class="action" nz-tooltip="Élèves">
                <mat-icon class="action-icon">people</mat-icon>
                <span class="action-title">{{ item.statistic.studentCount }}</span>
              </div>
              <div class="action" nz-tooltip="Activités">
                <mat-icon class="action-icon">widgets</mat-icon>
                <span class="action-title">{{ item.statistic.activityCount }}</span>
              </div>
            </ng-container>
            <div class="spacer"></div>
            <div class="action" nz-tooltip="Dernière mise à jour">
              <i nz-icon nzType="history" nzTheme="outline"></i>
              <span class="action-title">{{ item.updatedAt | date:'dd/MM/yyyy' }}</span>
            </div>
          </footer>
        </div>
      </article>
    </ng-template>
  `,
  styles: [`
    :host { display: block; cursor: pointer; }
    nz-ribbon { display: block; width: 100%; }
    article {
      width: 100%;
      box-sizing: border-box;
      border-radius: .5rem;
      transition: box-shadow .5s;
      background: var(--brand-background-card, #fafafa);
    }
    article:hover {
      box-shadow: 0 2px 4px -1px rgba(0,0,0,.2), 0 4px 5px rgba(0,0,0,.14), 0 1px 10px rgba(0,0,0,.12) !important;
    }
    .article-content-wrapper { padding: 12px; }
    .article-header { display: flex; align-items: center; height: 3em; margin: 0 0 8px; overflow: hidden; }
    .article-image { width: 24px; height: 24px; display: flex; align-items: center; flex-shrink: 0; }
    .article-image mat-icon { width: 24px; height: 24px; font-size: 24px; color: var(--brand-text-secondary, #555); }
    .article-title {
      margin: 0 0 0 8px;
      max-width: 70%;
      max-height: 3em;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 1rem;
      font-weight: 500;
      color: var(--brand-text-primary, #222);
    }
    .article-description {
      margin: 0 0 8px;
      height: 1.5em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.875rem;
      color: var(--brand-text-secondary, #555);
    }
    .article-footer { display: flex; align-items: center; }
    .action {
      display: flex; align-items: center;
      color: var(--brand-text-secondary, #555);
      margin-right: 2px;
    }
    .action-icon { font-size: 18px; width: 18px; height: 18px; }
    .action-title { margin: 0 8px 0 2px; font-size: 0.8rem; line-height: 18px; }
    .spacer { flex: 1; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, MatIconModule, NzBadgeModule, NzProgressModule, NzIconModule, NzToolTipModule],
})
export class CourseItemComponent implements OnChanges {
  @Input() item!: Course
  @Input() simple = false

  protected progressColor = '#ff4d4f'

  ngOnChanges(): void {
    const p = this.item?.statistic?.progression ?? 0
    if (p >= 100) this.progressColor = '#52c41a'
    else if (p >= 75) this.progressColor = '#52c41a'
    else if (p >= 50) this.progressColor = '#1890ff'
    else if (p >= 25) this.progressColor = '#faad14'
    else this.progressColor = '#ff4d4f'
  }
}
