import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { forkJoin } from 'rxjs';
import { IndicatorService } from '../../core/services/indicator.service';
import { IndicatorDefinition, IndicatorFeedback, IndicatorScope, contextIcon } from '../../core/models/indicator.model';
import { IndicatorListStateService } from '../../core/services/indicator-list-state.service';
import { IndicatorBuilderComponent, CONTEXT_LABELS, IndicatorFamilyPreset } from './indicator-builder.component';
import { NewIndicatorChoiceModalComponent, NewIndicatorChoiceResult } from './new-indicator-choice-modal.component';
import { buildIndicatorDisplayRows, IndicatorDisplayRow } from '../../shared/utils/indicator-family-grouping';
import { LogsModalComponent } from './logs-modal.component';
import { IndicatorFamilyStartModalComponent, FamilyStartResult } from './indicator-family-start-modal.component';

//  Composant principal

@Component({
  selector: 'ui-admin-indicator-manager',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule,
    NzTableModule, NzButtonModule, NzModalModule,
    NzSwitchModule, NzTagModule, NzToolTipModule,
    NzPopconfirmModule, NzBadgeModule, NzDividerModule,
    NzEmptyModule, NzSpinModule, NzTabsModule, NzRateModule,
    NzSelectModule, NzInputModule, NzPaginationModule,
  ],
  templateUrl: './admin-indicator-manager.component.html',
  styleUrls: ['./admin-indicator-manager.component.scss'],
})
export class AdminIndicatorManagerComponent implements OnInit {
  private readonly indicatorSvc = inject(IndicatorService);
  private readonly modalSvc     = inject(NzModalService);
  private readonly messageSvc   = inject(NzMessageService);
  private readonly cdr          = inject(ChangeDetectorRef);
  private readonly router       = inject(Router);
  private readonly listState    = inject(IndicatorListStateService);
  @ViewChild('renameFamilyTpl') private renameFamilyTplRef!: TemplateRef<any>;
  renameFamilyInput = '';
  readonly contextIcon = contextIcon;

  renameFamily(row: { familyName: string; members: IndicatorDefinition[] }): void {
    this.renameFamilyInput = row.familyName;
    this.modalSvc.create({
      nzTitle: 'Renommer la famille',
      nzContent: this.renameFamilyTplRef,
      nzWidth: 420,
      nzCentered: true,
      nzOkText: 'Renommer',
      nzCancelText: 'Annuler',
      nzOnOk: () => {
        const newName = this.renameFamilyInput.trim();
        if (!newName || newName === row.familyName) return Promise.resolve();
        return Promise.all(row.members.map(m =>
          this.indicatorSvc.updateIndicator(m.id, { familyName: newName }).toPromise()
        )).then(() => {
          this.indicators = this.indicators.map(i =>
            i.familyName === row.familyName ? { ...i, familyName: newName } : i
          );
          if (this.expandedFamilies.has(row.familyName)) {
            this.expandedFamilies.delete(row.familyName);
            this.expandedFamilies.add(newName);
          }
          this.applyGroupingFilter();
          this.messageSvc.success(`Famille renommée en « ${newName} »`);
        }).catch(() => this.messageSvc.error('Erreur lors du renommage'));
      },
    });
  }

  indicators: IndicatorDefinition[] = [];
  displayRows: IndicatorDisplayRow[] = [];
  /* Cartes de l'onglet Familles (une par famille) - affichées en grille de 3, paginées à 5
   lignes (15/page) via `pagedFamilyCards`.
  */
  familyCards: { familyName: string; members: IndicatorDefinition[] }[] = [];
  familyPageIndex = 1;
  readonly familyPageSize = 15;
  expandedFamilies = new Set<string>();
  groupingFilter: 'families' | 'standalone' = 'standalone';
  completenessFilter: 'all' | 'complete' | 'incomplete' = 'all';
  searchText = '';
  contextTypeFilterValue: IndicatorScope | 'all' = 'all';
  readonly contextTypeOptions: { value: IndicatorScope; label: string }[] = [
    { value: 'learner', label: 'Apprenant' },
    { value: 'teacher', label: 'Enseignant' },
    { value: 'admin', label: 'Admin' },
    { value: 'course', label: 'Cours' },
    { value: 'activity', label: 'Activité' },
    { value: 'group', label: 'Groupe' },
  ];

  /* Non-null : la vue courante est la page dédiée d'une famille (route
   /dashboard/indicators/family/:name) - la liste est alors restreinte à cette seule famille,
   affichée à plat (jamais repliée), et les onglets Uniques/Familles n'ont plus de sens.
  */
  @Input() familyNameFilter: string | null = null;
  //Nombre de pins par indicateur (tous cours/activités confondus) - label informatif
  pinCountsByIndicatorId: Record<string, number> = {};
  loading = false;
  recalculating = new Set<string>();
  logsLoading    = new Set<string>();

  //  Gestion membres de famille

  openAddExistingToFamily(familyName: string): void {
    this.addExistingFamilyName = familyName;
    this.addExistingSelectedIds = [];
    this.standaloneIndicators = this.indicators.filter(i => !i.familyName);
    this.standaloneOptions = this.standaloneIndicators.map(i => ({ label: i.name, value: i.id }));
    this.addExistingModalVisible = true;
  }

  toggleAddExistingSelection(id: string): void {
    this.previewedStandaloneId = null;
    const idx = this.addExistingSelectedIds.indexOf(id);
    if (idx === -1) this.addExistingSelectedIds.push(id);
    else this.addExistingSelectedIds.splice(idx, 1);
  }

  /* Assigne la famille à tous les indicateurs sélectionnés en parallèle (un seul aller-retour
   visible pour l'utilisateur) plutôt qu'un par un - voir historique de cette limitation.
  */
  confirmAddExistingToFamily(): void {
    if (!this.addExistingSelectedIds.length) return;
    this.addExistingLoading = true;
    const ids = [...this.addExistingSelectedIds];
    forkJoin(ids.map(id => this.indicatorSvc.updateIndicator(id, { familyName: this.addExistingFamilyName }))).subscribe({
      next: updatedList => {
        this.cleanupFamilyPlaceholder(this.addExistingFamilyName);
        const updatedIds = new Set(updatedList.map(u => u.id));
        this.indicators = this.indicators.map(i => updatedIds.has(i.id) ? { ...i, familyName: this.addExistingFamilyName } : i);
        this.expandedFamilies.add(this.addExistingFamilyName);
        this.applyGroupingFilter();
        this.addExistingLoading = false;
        this.addExistingModalVisible = false;
        this.cdr.markForCheck();
        this.messageSvc.success(
          `${ids.length} indicateur${ids.length > 1 ? 's' : ''} ajouté${ids.length > 1 ? 's' : ''} à la famille « ${this.addExistingFamilyName} »`,
        );
      },
      error: () => { this.addExistingLoading = false; this.messageSvc.error('Erreur lors de l\'ajout'); },
    });
  }

  createNewInFamily(familyName: string): void {
    const preset: IndicatorFamilyPreset = { familyName, contextType: 'learner', name: '', description: '', requiredEvents: [] };

    const choiceRef = this.modalSvc.create<NewIndicatorChoiceModalComponent, { indicators: IndicatorDefinition[] }>({
      nzTitle: `Nouvel indicateur dans « ${familyName} »`,
      nzContent: NewIndicatorChoiceModalComponent,
      nzData: { indicators: this.indicators.filter(i => !i.isFamilyPlaceholder) },
      nzFooter: null,
      nzWidth: 480,
      nzCentered: true,
    });
    choiceRef.afterClose.subscribe((choice: NewIndicatorChoiceResult | null | undefined) => {
      if (!choice) return;

      const nzData: Record<string, unknown> = { familyPreset: preset };
      if (choice.mode === 'reuse') nzData['reuseSeed'] = choice;
      else if (choice.mode === 'import') nzData['importSeed'] = { pipeline: choice.pipeline, meta: choice.meta };

      const ref = this.modalSvc.create({
        nzTitle: `Nouvel indicateur dans « ${familyName} »`,
        nzContent: IndicatorBuilderComponent,
        nzData,
        nzFooter: null,
        nzWidth: '95vw',
        nzCentered: true,
        nzBodyStyle: { 'max-height': '80vh', 'overflow-y': 'auto' },
      });
      ref.afterClose.subscribe(created => {
        if (created) {
          this.cleanupFamilyPlaceholder(familyName);
          this.load();
          this.expandedFamilies.add(familyName);
        }
      });
    });
  }

  openRemoveFromFamily(ind: IndicatorDefinition): void {
    this.removeModalIndicator = ind;
    this.removeModalVisible = true;
  }

  confirmRemoveFromFamily(action: 'detach' | 'delete'): void {
    const ind = this.removeModalIndicator;
    if (!ind) return;
    this.removeLoading = true;

    if (action === 'detach') {
      this.indicatorSvc.updateIndicator(ind.id, { familyName: null }).subscribe({
        next: () => {
          this.indicators = this.indicators.map(i => i.id === ind.id ? { ...i, familyName: null as any } : i);
          this.applyGroupingFilter();
          this.removeLoading = false;
          this.removeModalVisible = false;
          this.cdr.markForCheck();
          this.messageSvc.success(`« ${ind.name} » retiré de la famille - maintenant indicateur unique`);
        },
        error: () => { this.removeLoading = false; this.messageSvc.error('Erreur'); },
      });
    } else {
      this.indicatorSvc.deleteIndicator(ind.id).subscribe({
        next: () => {
          this.indicators = this.indicators.filter(i => i.id !== ind.id);
          this.applyGroupingFilter();
          this.removeLoading = false;
          this.removeModalVisible = false;
          this.cdr.markForCheck();
          this.messageSvc.success(`« ${ind.name} » supprimé définitivement`);
        },
        error: () => { this.removeLoading = false; this.messageSvc.error('Erreur'); },
      });
    }
  }

  // Ajout d'un indicateur existant à une famille
  addExistingModalVisible = false;
  addExistingFamilyName = '';
  addExistingSelectedIds: string[] = [];
  addExistingLoading = false;
  standaloneIndicators: IndicatorDefinition[] = [];
  standaloneOptions: { label: string; value: string }[] = [];
  previewedStandaloneId: string | null = null;
  get previewedStandaloneIndicator(): IndicatorDefinition | null {
    return this.standaloneIndicators.find(i => i.id === this.previewedStandaloneId) ?? null;
  }

  // Retrait d'un indicateur d'une famille
  removeModalVisible = false;
  removeModalIndicator: IndicatorDefinition | null = null;
  removeLoading = false;

  //  Notification
  notifModalVisible = false;
  notifIndicator: IndicatorDefinition | null = null;
  notifTitle = '';
  notifMessage = '';
  notifSending = false;

  //  Feedbacks 
  feedbackModalVisible = false;
  feedbackIndicator: IndicatorDefinition | null = null;
  feedbacks: IndicatorFeedback[] = [];
  feedbacksCount = 0;
  feedbacksAverage = 0;
  feedbacksLoading = false;
  deletingFeedback = new Set<string>();

  ngOnInit(): void {
    if (!this.familyNameFilter) {
      this.groupingFilter = this.listState.admin.groupingFilter;
      this.completenessFilter = this.listState.admin.completenessFilter;
      this.searchText = this.listState.admin.searchText;
      this.contextTypeFilterValue = this.listState.admin.contextTypeFilterValue;
    }
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.indicatorSvc.loadAllForAdmin().subscribe({
      next: list => { this.indicators = list; this.applyGroupingFilter(); this.loading = false; this.cdr.markForCheck(); },
      error: ()  => { this.loading = false; this.cdr.markForCheck(); },
    });

    this.indicatorSvc.countPinsByIndicator().subscribe({
      next: counts => { this.pinCountsByIndicatorId = counts; this.cdr.markForCheck(); },
      error: () => { this.pinCountsByIndicatorId = {}; this.cdr.markForCheck(); },
    });
  }

  // Bascule entre l'onglet "Indicateurs uniques" (0) et "Familles" (1).
  onTabChange(index: number): void {
    this.groupingFilter = index === 0 ? 'standalone' : 'families';
    this.applyGroupingFilter();
  }

  /* Reconstruit `displayRows` selon le mode courant, combiné aux filtres recherche/contexte/
   complétude. En mode "page de famille" (`familyNameFilter`), la liste est restreinte à
   cette seule famille et toujours affichée à plat (onglet Uniques/Familles ignoré) ; sinon,
   comportement habituel (onglet + familles jamais dépliées, le clic navigue).
  */
  applyGroupingFilter(): void {
    let filtered: IndicatorDefinition[];
    if (this.familyNameFilter) {
      filtered = this.indicators.filter(ind => ind.familyName === this.familyNameFilter);
      this.expandedFamilies.add(this.familyNameFilter);
    } else {
      /*
      Persiste l'état des filtres/onglet de la liste principale pour que "Retour à la
      liste" les restaure au lieu de repartir des valeurs par défaut.
      */
      this.listState.admin.groupingFilter = this.groupingFilter;
      this.listState.admin.completenessFilter = this.completenessFilter;
      this.listState.admin.searchText = this.searchText;
      this.listState.admin.contextTypeFilterValue = this.contextTypeFilterValue;
      filtered = this.groupingFilter === 'families'
        ? this.indicators.filter(ind => !!ind.familyName)
        : this.indicators.filter(ind => !ind.familyName);
    }
    if (this.searchText.trim()) {
      const q = this.searchText.trim().toLowerCase();
      filtered = filtered.filter(ind => ind.name.toLowerCase().includes(q));
    }
    if (this.contextTypeFilterValue !== 'all') {
      filtered = filtered.filter(ind => ind.contextType === this.contextTypeFilterValue);
    }
    if (this.completenessFilter !== 'all') {
      filtered = filtered.filter(ind =>
        this.completenessFilter === 'complete' ? ind.isComplete : !ind.isComplete);
    }
    const rows = buildIndicatorDisplayRows(filtered, this.expandedFamilies);
    /*
    En page de famille dédiée, la ligne d'en-tête de famille est redondante avec le titre
    de la page (voir header ci-dessus) : on ne garde que les membres, à plat.
    */
    this.displayRows = this.familyNameFilter ? rows.filter(r => r.kind !== 'family') : rows;
    this.familyCards = rows.filter((r): r is Extract<IndicatorDisplayRow, { kind: 'family' }> => r.kind === 'family');
    this.familyPageIndex = 1;
  }

  get pagedFamilyCards(): { familyName: string; members: IndicatorDefinition[] }[] {
    const start = (this.familyPageIndex - 1) * this.familyPageSize;
    return this.familyCards.slice(start, start + this.familyPageSize);
  }

  /* Clic sur une ligne de famille dans la liste principale : navigue vers sa page dédiée
   plutôt que de la déplier sur place.
  */
  openFamilyPage(familyName: string): void {
    this.router.navigate(['/dashboard/indicators/family', familyName]);
  }

  goBackToList(): void {
    this.router.navigate(['/dashboard/indicators']);
  }

  /* Nombre d'indicateurs de la famille affichée (indépendant des filtres recherche/contexte/
   complétude appliqués sur cette page, contrairement à `displayRows`).
  */
  familyMemberCount(): number {
    return this.indicators.filter(ind => ind.familyName === this.familyNameFilter).length;
  }

  hasFormula(ind: IndicatorDefinition): boolean {
    return !!ind.formula?.pipeline?.length;
  }

  //  Modales 

  openBuilder(indicator?: IndicatorDefinition): void {
    // Édition d'un indicateur existant : pas de choix préalable, on ouvre directement le wizard.
    if (indicator) {
      this.openBuilderModal({ indicator });
      return;
    }
    /*
    Création : demande d'abord comment démarrer (zéro / réutilisation / import), puis ouvre
    le wizard déjà pré-rempli en conséquence.
    */
    const choiceRef = this.modalSvc.create<NewIndicatorChoiceModalComponent, { indicators: IndicatorDefinition[] }>({
      nzTitle: 'Nouvel indicateur',
      nzContent: NewIndicatorChoiceModalComponent,
      nzData: { indicators: this.indicators.filter(i => !i.isFamilyPlaceholder) },
      nzFooter: null,
      nzWidth: 480,
      nzCentered: true,
    });
    choiceRef.afterClose.subscribe((choice: NewIndicatorChoiceResult | null | undefined) => {
      if (!choice) return;
      if (choice.mode === 'blank') this.openBuilderModal({});
      else if (choice.mode === 'reuse') this.openBuilderModal({ reuseSeed: choice });
      else this.openBuilderModal({ importSeed: { pipeline: choice.pipeline, meta: choice.meta } });
    });
  }

  private openBuilderModal(nzData: Record<string, unknown>): void {
    const indicator = nzData['indicator'] as IndicatorDefinition | undefined;
    const ref = this.modalSvc.create({
      nzTitle: indicator ? `Modifier : ${indicator.name}` : 'Nouvel indicateur',
      nzContent: IndicatorBuilderComponent,
      nzData,
      nzFooter: null,
      nzWidth: '95vw',
      nzCentered: true,
      nzBodyStyle: { 'max-height': '80vh', 'overflow-y': 'auto' },
    });
    ref.afterClose.subscribe(saved => { if (saved) this.load(); });
  }

  /* Ouvre la modale de démarrage d'une famille, puis enchaîne le builder pour chaque contexte
   sélectionné - ou crée directement une famille vide si aucun contexte n'a été choisi.
  */
  openFamilyWizard(): void {
    const startRef = this.modalSvc.create({
      nzTitle: 'Créer une famille d\'indicateurs',
      nzContent: IndicatorFamilyStartModalComponent,
      nzFooter: null,
      nzWidth: 520,
    });
    startRef.afterClose.subscribe((result: FamilyStartResult | null) => {
      if (!result) return;
      if (!result.contextTypes.length) { this.createEmptyFamily(result); return; }
      const [first, ...queue] = result.contextTypes;
      this.openFamilyMember(result, first, queue);
    });
  }

  /* Crée une famille sans indicateur réel pour l'instant (ligne technique isFamilyPlaceholder,
   toujours isActive=false donc invisible des utilisateurs finaux) - à compléter plus tard via
   "Ajouter un indicateur" sur la ligne de famille.
  */
  private createEmptyFamily(result: FamilyStartResult): void {
    this.indicatorSvc.createIndicator({
      name: `${result.familyName} (famille)`,
      familyName: result.familyName,
      description: result.description,
      isActive: false,
      isFamilyPlaceholder: true,
      requiredEvents: [],
      visualizations: [],
    }).subscribe({
      next: () => {
        this.messageSvc.success(`Famille "${result.familyName}" créée, sans indicateur pour l'instant.`);
        this.load();
      },
      error: () => this.messageSvc.error('Impossible de créer la famille.'),
    });
  }

  //Supprime le placeholder de famille vide dès qu'un premier vrai indicateur la rejoint
  private cleanupFamilyPlaceholder(familyName: string): void {
    const placeholder = this.indicators.find(i => i.familyName === familyName && i.isFamilyPlaceholder);
    if (placeholder) this.indicatorSvc.deleteIndicator(placeholder.id).subscribe();
  }

  /* Ouvre d'abord le choix de démarrage (zéro / réutiliser / import) pour ce membre de la
   famille, puis le builder pré-rempli en conséquence, puis enchaîne sur le suivant à la
   fermeture. Supprime au passage le placeholder de famille vide si c'est le premier vrai membre.
  */
  private openFamilyMember(start: FamilyStartResult, contextType: IndicatorScope, queue: IndicatorScope[]): void {
    const preset: IndicatorFamilyPreset = {
      familyName: start.familyName,
      description: start.description,
      requiredEvents: [],
      contextType,
      name: `${start.familyName} - ${CONTEXT_LABELS[contextType]}`,
    };

    const choiceRef = this.modalSvc.create<NewIndicatorChoiceModalComponent, { indicators: IndicatorDefinition[] }>({
      nzTitle: preset.name,
      nzContent: NewIndicatorChoiceModalComponent,
      nzData: { indicators: this.indicators.filter(i => !i.isFamilyPlaceholder) },
      nzFooter: null,
      nzWidth: 480,
      nzCentered: true,
    });
    choiceRef.afterClose.subscribe((choice: NewIndicatorChoiceResult | null | undefined) => {
      if (!choice) return;

      const nzData: Record<string, unknown> = { familyPreset: preset, familyQueue: queue };
      if (choice.mode === 'reuse') nzData['reuseSeed'] = choice;
      else if (choice.mode === 'import') nzData['importSeed'] = { pipeline: choice.pipeline, meta: choice.meta };

      const ref = this.modalSvc.create({
        nzTitle: preset.name,
        nzContent: IndicatorBuilderComponent,
        nzData,
        nzFooter: null,
        nzWidth: '95vw',
        nzCentered: true,
        nzBodyStyle: { 'max-height': '80vh', 'overflow-y': 'auto' },
      });
      ref.afterClose.subscribe(saved => {
        if (saved) this.cleanupFamilyPlaceholder(start.familyName);
        this.load();
        if (saved && queue.length) {
          const [next, ...rest] = queue;
          this.openFamilyMember(start, next, rest);
        }
      });
    });
  }

  openLogs(indicator: IndicatorDefinition): void {
    this.logsLoading.add(indicator.id);
    this.indicatorSvc.getExecutionLogs(indicator.id, 100).subscribe({
      next: logs => {
        this.logsLoading.delete(indicator.id);
        this.modalSvc.create({
          nzTitle: `Logs d'exécution - ${indicator.name}`,
          nzContent: LogsModalComponent,
          nzData: { logs },
          nzFooter: null,
          nzWidth: 1000,
        });
      },
      error: () => {
        this.logsLoading.delete(indicator.id);
        this.messageSvc.error('Impossible de charger les logs');
      },
    });
  }

  //  Actions 

  toggleActive(indicator: IndicatorDefinition): void {
    this.indicatorSvc.updateIndicatorStatus(indicator.id, indicator.isActive).subscribe({
      next: () => {
        this.messageSvc.success(`Indicateur ${indicator.isActive ? 'activé' : 'désactivé'}`);
        /*
        Le filtre Complet/Incomplet doit refléter immédiatement le nouveau statut, sinon un
        indicateur juste (dés)activé peut rester visible dans un filtre qu'il ne remplit plus.
        */
        this.applyGroupingFilter();
        if (indicator.isActive) {
          this.notifIndicator = indicator;
          this.notifTitle = `Nouvel indicateur disponible : ${indicator.name}`;
          this.notifMessage = indicator.description
            ? `Cet indicateur est désormais disponible dans votre tableau de bord.\n\n${indicator.description}`
            : `Cet indicateur est désormais disponible dans votre tableau de bord.`;
          this.notifModalVisible = true;
        }
      },
      error: () => {
        indicator.isActive = !indicator.isActive;
        this.messageSvc.error('Erreur lors de la mise à jour du statut');
      },
    });
  }

  sendNotification(): void {
    if (!this.notifIndicator || !this.notifTitle.trim() || !this.notifMessage.trim()) return;
    this.notifSending = true;
    this.indicatorSvc.sendNotification(this.notifIndicator.id, this.notifTitle, this.notifMessage).subscribe({
      next: () => {
        this.notifSending = false;
        this.notifModalVisible = false;
        this.cdr.markForCheck();
        this.messageSvc.success('Notification envoyée');
      },
      error: () => {
        this.notifSending = false;
        this.cdr.markForCheck();
        this.messageSvc.error('Erreur lors de l\'envoi de la notification');
      },
    });
  }

  deleteIndicator(indicator: IndicatorDefinition): void {
    this.indicatorSvc.deleteIndicator(indicator.id).subscribe({
      next: () => {
        this.messageSvc.success(`Indicateur "${indicator.name}" supprimé`);
        this.indicators = this.indicators.filter(i => i.id !== indicator.id);
        this.applyGroupingFilter();
      },
      error: () => this.messageSvc.error('Erreur lors de la suppression'),
    });
  }

  recalculate(indicator: IndicatorDefinition): void {
    this.recalculating.add(indicator.id);
    this.indicatorSvc.recalculateIndicator(indicator.id).subscribe({
      next: ({ processed, updated, failed }) => {
        this.recalculating.delete(indicator.id);
        this.messageSvc.success(
          `Recalcul terminé - ${updated}/${processed} valeurs mises à jour` +
          (failed ? ` (${failed} erreurs)` : ''),
        );
      },
      error: err => {
        this.recalculating.delete(indicator.id);
        this.messageSvc.error(err?.error?.message ?? 'Erreur lors du recalcul');
      },
    });
  }

  openFeedbacks(ind: IndicatorDefinition): void {
    this.feedbackIndicator = ind;
    this.feedbacks = [];
    this.feedbacksCount = 0;
    this.feedbacksAverage = 0;
    this.feedbacksLoading = true;
    this.feedbackModalVisible = true;
    this.indicatorSvc.getFeedbacks(ind.id).subscribe({
      next: ({ feedbacks, count, averageRating }) => {
        this.feedbacks = feedbacks;
        this.feedbacksCount = count;
        this.feedbacksAverage = averageRating;
        this.feedbacksLoading = false;
      },
      error: () => { this.feedbacksLoading = false; },
    });
  }

  deleteFeedback(feedbackId: string): void {
    if (!this.feedbackIndicator) return;
    this.deletingFeedback.add(feedbackId);
    this.indicatorSvc.deleteFeedback(this.feedbackIndicator.id, feedbackId).subscribe({
      next: () => {
        this.feedbacks = this.feedbacks.filter(f => f.id !== feedbackId);
        this.feedbacksCount = this.feedbacks.length;
        this.feedbacksAverage = this.feedbacksCount > 0
          ? Math.round(this.feedbacks.reduce((s, f) => s + f.rating, 0) / this.feedbacksCount * 10) / 10
          : 0;
        this.deletingFeedback.delete(feedbackId);
      },
      error: () => { this.deletingFeedback.delete(feedbackId); },
    });
  }
}
