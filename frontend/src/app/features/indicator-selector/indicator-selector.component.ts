import { Component, Input, OnInit, Output, EventEmitter, inject, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
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
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { IndicatorService } from '../../core/services/indicator.service';
import { DashboardSettingsService } from '../../core/services/dashboard-settings.service';
import { RoleService } from '../../core/services/role.service';
import { IndicatorListStateService } from '../../core/services/indicator-list-state.service';
import { ROUTE_BASE_PATH } from '../../core/tokens/route-base-path.token';

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
import { IndicatorDefinition, IndicatorScope, IndicatorVisualization, contextIcon } from '../../core/models/indicator.model';
import { buildIndicatorDisplayRows, IndicatorDisplayRow } from '../../shared/utils/indicator-family-grouping';
import { getCurrentUserId } from '../../core/auth/current-user';

//  Constantes DSL

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

//  Modal de détail d'un indicateur 

@Component({
  selector: 'ui-indicator-view-modal',
  standalone: true,
  imports: [CommonModule, MatIconModule, NzTagModule, NzDividerModule, NzEmptyModule],
  templateUrl: './indicator-view-modal.component.html',
  styleUrls: ['./indicator-view-modal.component.scss'],
})
export class IndicatorViewModalComponent {
  readonly modalData = inject(NZ_MODAL_DATA) as { indicator: IndicatorDefinition; allIndicators?: IndicatorDefinition[] };
  private readonly roleService = inject(RoleService);

  get ind(): IndicatorDefinition { return this.modalData.indicator; }

  get baseIndicatorName(): string | null {
    if (!this.ind.baseIndicatorId) return null;
    return this.modalData.allIndicators?.find(i => i.id === this.ind.baseIndicatorId)?.name ?? null;
  }

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
  readonly contextIcon = contextIcon;
  vizLabel(type: string): string { return VIZ_LABELS[type] ?? type; }
  vizColor(type: string): string { return VIZ_COLORS[type] ?? '#8c8c8c'; }
  stepLabel(type: string): string { return STEP_LABELS[type] ?? type; }
  stepColor(type: string): string { return STEP_COLORS[type] ?? '#8c8c8c'; }

  // Pipeline de l'indicateur (partagé par toutes ses visualisations).
  vizPipeline(_viz: IndicatorVisualization): { id: string; type: string; label?: string }[] {
    return this.ind.formula?.pipeline ?? [];
  }

  // Toujours false : toutes les visualisations partagent la formule de l'indicateur.
  usesOwnFormula(_viz: IndicatorVisualization): boolean {
    return false;
  }
}

//  Composant principal 

@Component({
  selector: 'ui-indicator-selector',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule, MatTooltipModule,
    NzTableModule, NzSwitchModule, NzSelectModule, NzInputModule,
    NzModalModule, NzTagModule, NzSpinModule, NzRadioModule, NzEmptyModule,
    NzPaginationModule,
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
  private readonly router = inject(Router);
  private readonly listState = inject(IndicatorListStateService);
  private readonly routeBasePath = inject(ROUTE_BASE_PATH, { optional: true }) ?? '/dashboard';

  @Output() indicatorsChanged = new EventEmitter<void>();

  /** Non-null : la vue courante est la page dédiée d'une famille - la liste est alors
   restreinte à cette seule famille, affichée à plat (jamais repliée).
  */
  @Input() familyNameFilter: string | null = null;

  allIndicators: IndicatorDefinition[] = [];
  displayRows: IndicatorDisplayRow[] = [];
  /** Cartes de l'onglet Familles (une par famille) - affichées en grille de 3, paginées à 5
   lignes (15/page) via `pagedFamilyCards`.
  */
  familyCards: { familyName: string; members: IndicatorDefinition[] }[] = [];
  familyPageIndex = 1;
  readonly familyPageSize = 15;
  expandedFamilies = new Set<string>();
  isLoading = true;

  filters = {
    scope: 'all' as 'all' | IndicatorScope,
    sortBy: 'popular' as 'popular' | 'unpopular' | 'name',
    grouping: 'standalone' as 'standalone' | 'families',
  };

  searchKeyword = '';

  ngOnInit(): void {
    if (!this.familyNameFilter) {
      this.filters.scope = this.listState.selector.scope;
      this.filters.sortBy = this.listState.selector.sortBy;
      this.filters.grouping = this.listState.selector.grouping;
      this.searchKeyword = this.listState.selector.searchKeyword;
    }
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
    if (!this.familyNameFilter) {
      /*
      Persiste l'état des filtres/onglet de la liste principale pour que "Retour à la
      liste" les restaure au lieu de repartir des valeurs par défaut.
      */
      this.listState.selector.scope = this.filters.scope;
      this.listState.selector.sortBy = this.filters.sortBy;
      this.listState.selector.grouping = this.filters.grouping;
      this.listState.selector.searchKeyword = this.searchKeyword;
    }

    let filtered = [...this.allIndicators]
      .filter(ind => this.roleService.canSeeIndicatorContext(ind.contextType, ind.visibilityRoles));

    if (this.filters.scope !== 'all') {
      filtered = filtered.filter(ind => ind.contextType === this.filters.scope);
    }

    if (this.familyNameFilter) {
      filtered = filtered.filter(ind => ind.familyName === this.familyNameFilter);
      this.expandedFamilies.add(this.familyNameFilter);
    } else {
      filtered = this.filters.grouping === 'families'
        ? filtered.filter(ind => !!ind.familyName)
        : filtered.filter(ind => !ind.familyName);
    }

    const kw = this.searchKeyword.trim().toLowerCase();
    if (kw) {
      filtered = filtered.filter(ind =>
        ind.name.toLowerCase().includes(kw) ||
        (ind.description ?? '').toLowerCase().includes(kw) ||
        (ind.familyName ?? '').toLowerCase().includes(kw),
      );
    }

    if (this.filters.sortBy === 'popular') {
      filtered.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    } else if (this.filters.sortBy === 'unpopular') {
      filtered.sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0));
    } else {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    const rows = buildIndicatorDisplayRows(filtered, this.expandedFamilies);
    /*
    En page de famille dédiée, la ligne d'en-tête de famille est redondante avec le titre
    de la page : on ne garde que les membres, à plat.
    */
    this.displayRows = this.familyNameFilter ? rows.filter(r => r.kind !== 'family') : rows;
    this.familyCards = rows.filter((r): r is Extract<IndicatorDisplayRow, { kind: 'family' }> => r.kind === 'family');
    this.familyPageIndex = 1;
  }

  get pagedFamilyCards(): { familyName: string; members: IndicatorDefinition[] }[] {
    const start = (this.familyPageIndex - 1) * this.familyPageSize;
    return this.familyCards.slice(start, start + this.familyPageSize);
  }

  /** Clic sur une ligne de famille dans la liste principale : navigue vers sa page dédiée
   plutôt que de la déplier sur place.
  */
  openFamilyPage(familyName: string): void {
    this.router.navigate([`${this.routeBasePath}/indicators/selector-family`, familyName]);
  }

  goBackToList(): void {
    this.router.navigate([`${this.routeBasePath}/indicators`]);
  }

  /** Nombre d'indicateurs de la famille affichée (indépendant des filtres recherche/tri
   appliqués sur cette page, contrairement à `displayRows`).
  */
  familyMemberCount(): number {
    return this.allIndicators.filter(ind => ind.familyName === this.familyNameFilter).length;
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
      nzData: { indicator, allIndicators: this.allIndicators },
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

  //  Choix des visualisations à afficher (par utilisateur) ─

  isVizEnabled(indicatorId: string, vizId: string): boolean {
    return this.indicatorService.isVizEnabled(indicatorId, vizId);
  }

  // Active/désactive une visualisation pour l'utilisateur. Empêche de tout désactiver.
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
