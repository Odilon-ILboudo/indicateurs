// web/src/app/shared/components/indicator-selector/indicator-selector.component.ts
import { Component, OnInit, Output, EventEmitter, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule, NzModalService, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { IndicatorService } from '../../core/services/indicator.service';
import { DashboardSettingsService } from '../../core/services/dashboard-settings.service';
import { RoleService } from '../../core/services/role.service';

const REQUIRED_EVENT_LABELS: Record<string, string> = {
  'exercise.answered': 'Réponse à un exercice',
  'exercise.viewed': 'Ouverture d’un exercice',
  'activity.completed': 'Activité terminée',
  'activity.started': 'Début d’activité',
  'session.started': 'Début de session',
  'session.completed': 'Fin de session',
  'lesson.started': 'Début de leçon',
  'lesson.completed': 'Fin de leçon',
  'resource.viewed': 'Consultation d’une ressource',
};
import { IndicatorDefinition, IndicatorScope, IndicatorVisualization } from '../../core/models/indicator.model';
import { buildIndicatorDisplayRows, IndicatorDisplayRow } from '../../shared/utils/indicator-family-grouping';
import { getCurrentUserId } from '../../core/auth/current-user';

// ── Constantes DSL ────────────────────────────────────────────────────────────

const STEP_COLORS: Record<string, string> = {
  fetch:     '#1890ff',
  filter:    '#52c41a',
  groupBy:   '#fa8c16',
  findFirst: '#722ed1',
  extract:   '#eb2f96',
  aggregate: '#13c2c2',
  round:     '#faad14',
  divide:    '#ff4d4f',
  js:        '#595959',
};

const STEP_LABELS: Record<string, string> = {
  fetch:     'Données',
  filter:    'Filtre',
  groupBy:   'Grouper',
  findFirst: '1er résultat',
  extract:   'Extraire',
  aggregate: 'Agréger',
  round:     'Arrondir',
  divide:    'Diviser',
  js:        'Code JS',
};

const VIZ_COLORS: Record<string, string> = {
  card:        '#1890ff',
  gauge:       '#722ed1',
  'line-chart':'#13c2c2',
  'bar-chart': '#fa8c16',
  histogram:   '#eb2f96',
  chart:       '#52c41a',
  table:       '#595959',
};

const VIZ_ICONS: Record<string, string> = {
  card:        'credit_card',
  gauge:       'speed',
  'line-chart':'show_chart',
  'bar-chart': 'bar_chart',
  histogram:   'leaderboard',
  chart:       'show_chart',
  table:       'table_chart',
};

const VIZ_LABELS: Record<string, string> = {
  card:        'Carte',
  gauge:       'Jauge',
  'line-chart':'Graphique ligne',
  'bar-chart': 'Barres horizontales',
  histogram:   'Histogramme',
  chart:       'Graphique',
  table:       'Tableau',
};

const CTX_LABELS: Record<string, string> = {
  learner:  'Apprenant',
  group:    'Groupe de TP',
  course:   'Cours',
  activity: 'Activité',
  teacher:  'Enseignant',
  admin:    'Admin',
};

const CTX_ICONS: Record<string, string> = {
  learner:  'person',
  group:    'group',
  course:   'school',
  activity: 'assignment',
  teacher:  'co_present',
  admin:    'admin_panel_settings',
};

// ── Modal de détail d'un indicateur ──────────────────────────────────────────

@Component({
  selector: 'ui-indicator-view-modal',
  standalone: true,
  imports: [CommonModule, MatIconModule, NzTagModule, NzDividerModule, NzEmptyModule],
  template: `
    <div class="view-modal">

      <!-- ── Statut + description ── -->
      <div class="header-section">
        <span class="status-badge" [class.active]="ind.isActive">
          {{ ind.isActive ? '● Actif' : '● Inactif' }}
        </span>
        <span class="circle-badge" *ngIf="ind.circleName">
          <mat-icon>folder_special</mat-icon>
          Cercle : {{ ind.circleName }}
        </span>
        <p class="ind-description" *ngIf="ind.description; else noDesc">{{ ind.description }}</p>
        <ng-template #noDesc>
          <p class="ind-description empty">Aucune description renseignée</p>
        </ng-template>
      </div>

      <!-- ── Section 1 : Informations générales ── -->
      <div class="section">
        <div class="section-title">
          <mat-icon>info_outline</mat-icon>
          Informations générales
        </div>

        <div class="info-grid">

          <div class="info-row">
            <span class="info-label">Contextes</span>
            <div class="info-value tags-row">
              <nz-tag *ngFor="let ctx of contexts" nzColor="blue">{{ ctxLabel(ctx) }}</nz-tag>
              <span *ngIf="!contexts.length" class="empty-val">-</span>
            </div>
          </div>

          <div class="info-row">
            <span class="info-label">Déclencheurs</span>
            <div class="info-value tags-row">
              <nz-tag *ngFor="let ev of triggerLabels" nzColor="purple">{{ ev }}</nz-tag>
              <span *ngIf="!(ind.requiredEvents?.length)" class="empty-val">Aucun</span>
            </div>
          </div>

          <div class="info-row">
            <span class="info-label">Mise à jour</span>
            <span class="info-value update-row">
              <!---<mat-icon class="update-icon" [class.realtime]="ind.requiredEvents?.length">
                {{ ind.requiredEvents?.length ? 'bolt' : 'schedule' }}
              </mat-icon>-->
              {{ ind.requiredEvents?.length
                  ? 'Temps réel à chaque événement'
                  : 'Cron quotidien uniquement (... AM)' }}
            </span>
          </div>

          <div class="info-row">
            <span class="info-label">Utilisations</span>
            <span class="info-value">
              {{ ind.usageCount ?? 0 }}
              utilisateur{{ (ind.usageCount ?? 0) !== 1 ? 's' : '' }} actif{{ (ind.usageCount ?? 0) !== 1 ? 's' : '' }}
            </span>
          </div>

        </div>
      </div>

      <!-- ── Section 2 : Visualisations ── -->
      <div class="section" *ngIf="ind.visualizations?.length">
        <div class="section-title">
          <mat-icon>bar_chart</mat-icon>
          Visualisations
          <span class="section-count">{{ ind.visualizations.length }} configurée{{ ind.visualizations.length > 1 ? 's' : '' }}</span>
        </div>

        <div class="view-card" *ngFor="let viz of ind.visualizations">
          <div class="view-header">
            <mat-icon class="view-viz-icon" [style.color]="viz.color">{{ viz.icon || vizIcon(viz.type) }}</mat-icon>
            <span class="view-label">{{ viz.label || vizLabel(viz.type) }}</span>
            <span class="view-type-chip" [style.background]="viz.color || vizColor(viz.type)">
              {{ vizLabel(viz.type) }}
            </span>
          </div>

          <div class="view-meta" *ngIf="viz.unit || viz.color">
            <span class="meta-item" *ngIf="viz.unit">
              <span class="meta-k">Unité :</span> {{ viz.unit }}
            </span>
            <span class="meta-item color-item" *ngIf="viz.color">
              <span class="meta-k">Couleur :</span>
              <span class="color-dot" [style.background]="viz.color"></span>
            </span>
          </div>

          <div class="thresholds-row" *ngIf="viz.thresholds as t">
            <span class="meta-k">Seuils :</span>
            <span class="threshold good">Bon ≤ {{ t.good }}{{ viz.unit ?? '' }}</span>
            <span class="threshold warning">Moyen ≤ {{ t.warning }}{{ viz.unit ?? '' }}</span>
            <span class="threshold danger">Critique &gt; {{ t.warning }}{{ viz.unit ?? '' }}</span>
          </div>

          <div class="pipeline-row" *ngIf="vizPipeline(viz).length">
            <span class="meta-k pipeline-label">
              Pipeline{{ usesOwnFormula(viz) ? '' : ' (formule globale)' }} :
            </span>
            <div class="pipeline-steps">
              <ng-container *ngFor="let s of vizPipeline(viz); let last = last">
                <span class="step-chip"
                  [style.background]="stepColor(s.type)"
                  [title]="s.label || s.type">
                  {{ stepLabel(s.type) }}
                </span>
                <span *ngIf="!last" class="step-arrow">→</span>
              </ng-container>
            </div>
          </div>

          <div class="view-no-formula" *ngIf="!vizPipeline(viz).length">
            <mat-icon>warning_amber</mat-icon>
            Aucune formule configurée pour cette visualisation
          </div>
        </div>
      </div>

      <!-- ── Aucune configuration ── -->
      <nz-empty
        *ngIf="!ind.visualizations?.length"
        nzNotFoundContent="Aucune configuration de visualisation disponible."
        style="margin: 24px 0">
      </nz-empty>

    </div>
  `,
  styles: [`
    .view-modal {
      font-size: 14px;
      line-height: 1.6;
      color: #262626;
    }

    /* ── Header statut + description ── */
    .header-section {
      margin-bottom: 20px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 10px;
      background: #fff2f0;
      color: #cf1322;
    }
    .status-badge.active {
      background: #f6ffed;
      color: #389e0d;
    }
    .family-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 10px;
      margin-left: 8px;
      background: #f9f0ff;
      color: #722ed1;

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        line-height: 14px;
      }
    }
    .ind-description {
      color: #595959;
      margin: 8px 0 0;
      font-size: 14px;
    }
    .ind-description.empty {
      color: #bfbfbf;
      font-style: italic;
    }

    /* ── Sections ── */
    .section {
      border: 1px solid #f0f0f0;
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 16px;
      background: #fafafa;
    }
    .section:last-child {
      margin-bottom: 0;
    }
    .section-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      color: #8c8c8c;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 14px;
    }
    .section-title mat-icon {
      font-size: 15px;
      line-height: 1;
      color: #1890ff;
    }
    .section-count {
      margin-left: auto;
      font-size: 11px;
      font-weight: 400;
      color: #bfbfbf;
      text-transform: none;
      letter-spacing: 0;
    }

    /* ── Grille d'infos ── */
    .info-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .info-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .info-label {
      flex-shrink: 0;
      width: 120px;
      font-size: 12px;
      font-weight: 600;
      color: #8c8c8c;
      padding-top: 3px;
    }
    .info-value {
      flex: 1;
      color: #262626;
      font-size: 13px;
    }
    .tags-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
    }
    .empty-val {
      color: #bfbfbf;
      font-style: italic;
    }
    .update-row {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .update-icon {
      font-size: 15px;
      line-height: 1;
      color: #8c8c8c;
    }
    .update-icon.realtime {
      color: #fa8c16;
    }

    /* ── Contexte ── */
    .ctx-block {
      margin-bottom: 4px;
    }
    .ctx-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .ctx-icon {
      font-size: 18px;
      color: #1890ff;
    }
    .ctx-name {
      font-weight: 700;
      font-size: 14px;
      color: #1a1a1a;
    }
    .ctx-count-badge {
      font-size: 11px;
      background: #e6f7ff;
      color: #1890ff;
      padding: 1px 8px;
      border-radius: 10px;
      font-weight: 500;
    }

    /* ── Carte de vue ── */
    .view-card {
      border: 1px solid #e8e8e8;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 8px;
      background: white;
    }
    .view-card:last-child {
      margin-bottom: 0;
    }
    .view-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .view-viz-icon {
      font-size: 18px;
      color: #595959;
    }
    .view-label {
      font-weight: 600;
      font-size: 13px;
      flex: 1;
      color: #1a1a1a;
    }
    .view-type-chip {
      font-size: 11px;
      color: white;
      padding: 2px 10px;
      border-radius: 12px;
      font-weight: 500;
    }

    /* ── Méta ── */
    .view-meta {
      display: flex;
      gap: 16px;
      margin-bottom: 6px;
      font-size: 13px;
      color: #595959;
    }
    .meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .meta-k {
      font-weight: 600;
      color: #8c8c8c;
      font-size: 12px;
    }
    .color-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 1px solid rgba(0, 0, 0, 0.15);
      display: inline-block;
    }

    /* ── Seuils ── */
    .thresholds-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      flex-wrap: wrap;
      font-size: 12px;
    }
    .threshold {
      padding: 2px 10px;
      border-radius: 6px;
      font-weight: 500;
    }
    .threshold.good    { background: #f6ffed; color: #389e0d; }
    .threshold.warning { background: #fff7e6; color: #d46b08; }
    .threshold.danger  { background: #fff2f0; color: #cf1322; }

    /* ── Pipeline ── */
    .pipeline-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 4px;
    }
    .pipeline-label {
      padding-top: 3px;
    }
    .pipeline-steps {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      flex: 1;
    }
    .step-chip {
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      color: white;
      cursor: default;
    }
    .step-arrow {
      color: #d9d9d9;
      font-size: 12px;
    }

    /* ── Avertissement ── */
    .view-no-formula {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: #fa8c16;
      margin-top: 4px;
    }
    .view-no-formula mat-icon {
      font-size: 14px;
      line-height: 1.4;
    }
  `],
})
export class IndicatorViewModalComponent {
  readonly modalData = inject(NZ_MODAL_DATA) as { indicator: IndicatorDefinition };
  private readonly roleService = inject(RoleService);

  get ind(): IndicatorDefinition { return this.modalData.indicator; }

  get triggerLabels(): string[] {
    const events = this.ind.requiredEvents ?? [];
    if (this.isAdminUser()) return events;
    return events.map(event => REQUIRED_EVENT_LABELS[event] ?? event);
  }

  get contexts(): string[] {
    return this.ind.contextType ? [this.ind.contextType] : [];
  }

  isAdminUser(): boolean {
    return this.roleService.getRole() === 'admin';
  }

  ctxLabel(ctx: string): string  { return CTX_LABELS[ctx] ?? ctx; }
  ctxIcon(ctx: string): string   { return CTX_ICONS[ctx] ?? 'label'; }
  vizLabel(type: string): string { return VIZ_LABELS[type] ?? type; }
  vizIcon(type: string): string  { return VIZ_ICONS[type] ?? 'widgets'; }
  vizColor(type: string): string { return VIZ_COLORS[type] ?? '#8c8c8c'; }
  stepLabel(type: string): string { return STEP_LABELS[type] ?? type; }
  stepColor(type: string): string { return STEP_COLORS[type] ?? '#8c8c8c'; }

  /** Pipeline de l'indicateur (partagé par toutes ses visualisations). */
  vizPipeline(_viz: IndicatorVisualization): { id: string; type: string; label?: string }[] {
    return this.ind.formula?.pipeline ?? [];
  }

  /** Toujours false : toutes les visualisations partagent la formule de l'indicateur. */
  usesOwnFormula(_viz: IndicatorVisualization): boolean {
    return false;
  }
}

// ── Composant principal ───────────────────────────────────────────────────────

@Component({
  selector: 'ui-indicator-selector',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule, MatTooltipModule,
    NzTableModule, NzSwitchModule, NzSelectModule, NzInputModule,
    NzModalModule, NzTagModule, NzSpinModule, NzRadioModule, NzEmptyModule,
  ],
  templateUrl: './indicator-selector.component.html',
  styleUrls: ['./indicator-selector.component.scss']
})
export class IndicatorSelectorComponent implements OnInit {
  private readonly indicatorService = inject(IndicatorService);
  private readonly settingsService = inject(DashboardSettingsService);
  private readonly roleService = inject(RoleService);
  private readonly modalService = inject(NzModalService);
  private readonly messageService = inject(NzMessageService);
  private cdr = inject(ChangeDetectorRef);

  @Output() indicatorsChanged = new EventEmitter<void>();

  allIndicators: IndicatorDefinition[] = [];
  displayRows: IndicatorDisplayRow[] = [];
  expandedCircles = new Set<string>();
  isLoading = true;

  filters = {
    scope: 'all' as 'all' | IndicatorScope,
    sortBy: 'popular' as 'popular' | 'unpopular' | 'name',
    grouping: 'standalone' as 'standalone' | 'circles',
  };

  searchKeyword = '';

  ngOnInit(): void {
    this.loadIndicators();
  }

  private loadIndicators(): void {
    this.isLoading = true;
    this.cdr.detectChanges();
    this.indicatorService.loadIndicators().subscribe({
      next: (indicators) => {
        this.allIndicators = indicators;
        this.applyFilters();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Failed to load indicators:', error);
        this.messageService.error('Erreur lors du chargement des indicateurs');
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  applyFilters(): void {
    let filtered = [...this.allIndicators]
      .filter(ind => this.roleService.canSeeIndicatorContext(ind.contextType));

    if (this.filters.scope !== 'all') {
      filtered = filtered.filter(ind => ind.contextType === this.filters.scope);
    }

    filtered = this.filters.grouping === 'circles'
      ? filtered.filter(ind => !!ind.circleName)
      : filtered.filter(ind => !ind.circleName);

    const kw = this.searchKeyword.trim().toLowerCase();
    if (kw) {
      filtered = filtered.filter(ind =>
        ind.name.toLowerCase().includes(kw) ||
        (ind.description ?? '').toLowerCase().includes(kw) ||
        (ind.circleName ?? '').toLowerCase().includes(kw),
      );
    }

    if (this.filters.sortBy === 'popular') {
      filtered.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    } else if (this.filters.sortBy === 'unpopular') {
      filtered.sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0));
    } else {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    this.displayRows = buildIndicatorDisplayRows(filtered, this.expandedCircles);
  }

  toggleCircle(circleName: string): void {
    if (this.expandedCircles.has(circleName)) {
      this.expandedCircles.delete(circleName);
    } else {
      this.expandedCircles.add(circleName);
    }
    this.applyFilters();
    this.cdr.detectChanges();
  }

  isActive(indicatorId: string): boolean {
    return this.settingsService.isActiveIndicator(indicatorId);
  }

  toggleIndicator(indicatorId: string, active: boolean): void {
    const indicator = this.allIndicators.find(i => i.id === indicatorId);
    const oldUsageCount = indicator?.usageCount || 0;

    if (active) {
      this.settingsService.addActiveIndicator(indicatorId);
      this.messageService.success(`Indicateur ajouté avec succès`);
      if (indicator) indicator.usageCount = oldUsageCount + 1;
    } else {
      this.settingsService.removeActiveIndicator(indicatorId);
      this.messageService.info(`Indicateur retiré avec succès`);
      if (indicator && oldUsageCount > 0) indicator.usageCount = oldUsageCount - 1;
    }

    this.applyFilters();
    this.cdr.detectChanges();
    this.indicatorsChanged.emit();
  }

  viewIndicator(indicator: IndicatorDefinition): void {
    this.modalService.create({
      nzTitle: indicator.name,
      nzContent: IndicatorViewModalComponent,
      nzData: { indicator },
      nzFooter: null,
      nzWidth: 860,
      nzCentered: true,
      nzBodyStyle: { 'max-height': '75vh', 'overflow-y': 'auto', padding: '4px 24px 20px' },
    });
  }

  getSupportedContexts(indicator: IndicatorDefinition): string[] {
    return indicator.contextType ? [indicator.contextType] : [];
  }

  getScopeLabel(scope?: string): string {
    const labels: Record<string, string> = {
      learner:  'Apprenant',
      group:    'Groupe de TP',
      activity: 'Activité',
      course:   'Cours',
      teacher:  'Enseignant',
      admin:    'Admin',
    };
    return scope ? (labels[scope] || scope) : '-';
  }

  getVizLabel(viz: string): string {
    return VIZ_LABELS[viz] || viz;
  }

  getVizIcon(viz: string): string {
    return VIZ_ICONS[viz] || 'widgets';
  }

  // ── Choix des visualisations à afficher (par utilisateur) ─────────────────

  isVizEnabled(indicatorId: string, vizId: string): boolean {
    return this.indicatorService.isVizEnabled(indicatorId, vizId);
  }

  /** Active/désactive une visualisation pour l'utilisateur. Empêche de tout désactiver. */
  toggleViz(indicator: IndicatorDefinition, viz: { id: string }, event: Event): void {
    event.stopPropagation();
    const all = indicator.visualizations ?? [];
    if (all.length <= 1) return;

    const current = this.indicatorService.getEnabledVizIds(indicator.id) ?? all.map(v => v.id);
    const isEnabled = current.includes(viz.id);

    if (isEnabled && current.length === 1) {
      this.messageService.info('Vous devez garder au moins une visualisation active.');
      return;
    }

    const next = isEnabled ? current.filter(id => id !== viz.id) : [...current, viz.id];
    const persisted = next.length === all.length ? null : next;
    this.indicatorService.setEnabledVizIds(getCurrentUserId(), indicator.id, persisted);
    this.cdr.detectChanges();
  }
}
