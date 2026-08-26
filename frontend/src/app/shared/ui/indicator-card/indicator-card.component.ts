import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, inject, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzColorPickerModule } from 'ng-zorro-antd/color-picker';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzMessageService } from 'ng-zorro-antd/message';
import { FormsModule } from '@angular/forms';
import { IndicatorService } from '../../../core/services/indicator.service';
import { IndicatorSocketService } from '../../../core/services/indicator-socket.service';
import { DashboardContext, IndicatorDefinition, IndicatorThresholds, IndicatorValue, IndicatorVisualization, contextIcon } from '../../../core/models/indicator.model';
import { getCurrentUserId } from '../../../core/auth/current-user';
import { IndicatorConfigModalComponent } from './indicator-config-modal.component';
import { ModalDataService } from './modal-data.service';

@Component({
  selector: 'ui-indicator-card',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule, MatCardModule, MatTooltipModule, MatButtonModule, RouterModule,
    NzModalModule, NzFormModule, NzSelectModule, NzColorPickerModule, NzButtonModule, NzPopconfirmModule
  ],
  templateUrl: './indicator-card.component.html',
  styleUrls: ['./indicator-card.component.scss']
})
export class IndicatorCardComponent implements OnInit, OnChanges, OnDestroy {
  private readonly indicatorService = inject(IndicatorService);
  private readonly socketService = inject(IndicatorSocketService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly modal = inject(NzModalService);
  private readonly message = inject(NzMessageService);
  private readonly modalData = inject(ModalDataService);

  private socketSub?: Subscription;

  @Input() indicator!: IndicatorDefinition;
  @Input() context!: DashboardContext;
  @Input() clickable: boolean = true;
  @Input() queryParams?: Record<string, string>;
  /** Surcharge le titre affiché dans la card (ex : snapshot.title pour les groupes). */
  @Input() displayTitle?: string;
  /** Affiche un bouton de suppression dans le card-context (à côté du bouton paramètres). */
  @Input() showDeleteButton = false;
  /** Indicateur figé (pin enseignant) pour le cours/l'activité affiché - actif et non
   *  désactivable pour tous les membres, indépendamment des préférences perso. */
  @Input() isPinned = false;
  /** Affiche le bouton figer/défiger (visible seulement si l'utilisateur courant a un
   *  droit d'écriture sur ce cours/cette activité - calculé par la page parente). */
  @Input() showPinButton = false;
  /** Seuils propres au pin, en override des seuils par défaut de l'indicateur (optionnel). */
  @Input() thresholdsOverride?: IndicatorThresholds | null;

  @Output() valueChange = new EventEmitter<IndicatorValue>();
  /** Émis avec le nouveau titre quand l'utilisateur confirme l'édition inline. */
  @Output() titleChange = new EventEmitter<string>();
  /** Émis quand l'utilisateur confirme la suppression via le popconfirm interne. */
  @Output() deleteClick = new EventEmitter<void>();
  /** Émis pour figer (si pas encore épinglé) ou défiger (confirmation déjà faite via
   *  popconfirm interne si épinglé) cet indicateur sur le contexte courant. */
  @Output() pinToggle = new EventEmitter<void>();

  @ViewChild('titleInput') private titleInputRef?: ElementRef<HTMLInputElement>;

  value: IndicatorValue | null = null;
  isLoading: boolean = true;
  activeVizId: string | null = null;
  userColorPreference: string | null = null;

  /** `mouseenter`/`mouseleave` ne remontent PAS (contrairement à mouseover/mouseout) : un
   *  stopPropagation() sur ces événements n'a aucun effet sur le tooltip du parent. Seul moyen
   *  fiable d'éviter deux tooltips superposés (carte + bouton) : désactiver explicitement celui
   *  de la carte tant que le pointeur est sur un élément qui a déjà le sien. */
  protected suppressCardTooltip = false;

  // Configuration modal
  isSavingConfig: boolean = false;

  // Édition inline du titre
  editingDisplayTitle = false;
  draftDisplayTitle = '';

  startTitleEdit(event: Event): void {
    if (!this.displayTitle) return;
    event.stopPropagation();
    event.preventDefault();
    this.draftDisplayTitle = this.displayTitle;
    this.editingDisplayTitle = true;
    setTimeout(() => this.titleInputRef?.nativeElement?.focus(), 0);
  }

  confirmTitleEdit(): void {
    if (!this.editingDisplayTitle) return;
    const newTitle = this.draftDisplayTitle.trim();
    this.editingDisplayTitle = false;
    if (newTitle && newTitle !== this.displayTitle) {
      this.titleChange.emit(newTitle);
    }
  }

  cancelTitleEdit(): void {
    this.editingDisplayTitle = false;
  }

  ngOnInit(): void {
    this.initActiveViz();
    this.loadUserColorPreference();
    this.loadValue();
    this.subscribeToSocket();
    this.socketService.connect();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Ne recharge que si `indicator`/`context` ont vraiment changé de référence - un binding
    // comme [queryParams]="someMethod()" (nouvel objet à chaque cycle de détection) ne doit
    // jamais déclencher un rechargement, sinon isLoading reste bloqué à true en boucle dès que
    // la détection de changements tourne souvent (ex. survol de la carte).
    if (!changes['indicator'] && !changes['context']) return;
    if (this.indicator && this.context) {
      this.initActiveViz();
      this.loadUserColorPreference();
      this.loadValue();
      this.subscribeToSocket();
    }
  }

  ngOnDestroy(): void {
    this.socketSub?.unsubscribe();
  }

  private subscribeToSocket(): void {
    this.socketSub?.unsubscribe();
    if (!this.indicator || !this.context) return;

    const contextId = this.context.scope === 'learner'
      ? this.context.userId
      : this.context.scopeId;

    this.socketSub = this.socketService
      .watchIndicator(this.indicator.id, this.context.scope, contextId)
      .subscribe(event => {
        this.value = {
          value: event.value,
          timestamp: new Date(event.timestamp),
          metadata: this.value?.metadata ?? null,
        };
        this.valueChange.emit(this.value);
        this.cdr.markForCheck();
      });
  }

  private loadUserColorPreference(): void {
    const userId = getCurrentUserId();
    this.indicatorService.getUserPreference(userId, this.indicator.id).subscribe({
      next: (preference) => {
        this.applyUserColorForActiveViz(preference?.displayPreferences);
      },
    });
  }

  private applyUserColorForActiveViz(displayPreferences?: any): void {
    if (displayPreferences && this.activeVizId) {
      // Couleur personnalisée pour cette visualisation spécifique
      const colorKey = `viz_${this.activeVizId}`;
      this.userColorPreference = displayPreferences[colorKey] || null;
    } else {
      this.userColorPreference = null;
    }
    this.cdr.detectChanges();
  }

  /** Visualisations que l'utilisateur a choisi de voir (toutes par défaut). */
  get visibleVisualizations(): IndicatorVisualization[] {
    const all = this.indicator?.visualizations ?? [];
    const visible = all.filter(v => this.indicatorService.isVizEnabled(this.indicator.id, v.id));
    return visible.length ? visible : all;
  }

  private initActiveViz(): void {
    if (!this.visibleVisualizations.length) return;
    const saved = this.indicatorService.getVizPreference(this.indicator.id);
    const valid = this.visibleVisualizations.find(v => v.id === saved);
    this.activeVizId = valid?.id ?? this.visibleVisualizations[0].id;
  }

  get activeViz(): IndicatorVisualization | undefined {
    return this.visibleVisualizations.find(v => v.id === this.activeVizId)
      ?? this.visibleVisualizations[0];
  }

  private loadValue(): void {
    this.isLoading = true;
    const scope = this.context.scope;

    // learner/teacher/admin + activityId OU courseId : indicateur personnel activity-aware ou
    // course-aware (filtré par activity_id ou course_id), calculé à la demande comme
    // course/group/activity, jamais depuis la valeur "globale" précalculée (voir
    // isActivityAware()/isCourseAware() et la page d'activité/de cours qui fournit ce contexte).
    const isPersonal = scope === 'learner' || scope === 'teacher' || scope === 'admin';
    const isScopedPersonal = isPersonal && (!!this.context.activityId || !!this.context.courseId);

    if (scope === 'course' || scope === 'group' || scope === 'activity' || isScopedPersonal) {
      // group/personnel : activityId (une activité) OU courseId (tout le cours, isCourseAware)
      // requis, l'un ou l'autre - voir DashboardContext.courseId.
      if ((scope === 'group' || isPersonal) && !this.context.activityId && !this.context.courseId) {
        this.isLoading = false;
        this.cdr.detectChanges();
        return;
      }

      const activityId = scope === 'activity' ? undefined : this.context.activityId;
      const courseId = (scope === 'group' || isPersonal) ? this.context.courseId : undefined;
      const vizId = this.activeViz?.id;

      this.indicatorService.computeView(
        this.indicator.id, scope, this.context.scopeId, activityId, vizId, courseId,
      ).subscribe({
        next: (result) => {
          this.value = { value: result.value, timestamp: new Date(), metadata: result.metadata };
          this.valueChange.emit(this.value);
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
      return;
    }

    // learner/teacher/admin : lecture de la valeur pré-calculée
    this.indicatorService.getIndicatorValue(
      this.indicator.id,
      scope,
      this.context.scopeId,
    ).subscribe({
      next: (value) => {
        this.value = value;
        this.valueChange.emit(value);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  refresh(): void {
    this.loadValue();
  }

  get viz() { return this.activeViz; }

  /** Icône fixe par contexte (apprenant/enseignant/cours/...) - jamais celle de la
   *  visualisation, pour rester reconnaissable d'un coup d'œil quel que soit l'indicateur. */
  readonly contextIcon = contextIcon;

  /** `null` si aucun seuil n'est configuré - le template retire alors la bordure de statut
   *  au lieu de retomber sur une couleur par défaut. */
  getThresholdColor(): string | null {
    if (!this.value) return null;
    const val = this.value.value;
    const t = this.thresholdsOverride ?? this.indicator?.thresholds;
    if (!t || (t.good == null && t.warning == null)) return null;
    if (t.good != null && val <= t.good)       return '#52c41a';
    if (t.warning != null && val <= t.warning) return '#fa8c16';
    return '#ff4d4f';
  }

  /** Couleur affichée pour la valeur/l'unité/l'icône : préférence perso de l'utilisateur en
   *  priorité, sinon la couleur configurée par l'admin à l'étape 2, sinon un gris neutre. */
  get displayColor(): string {
    return this.userColorPreference || this.activeViz?.color || '#7f8c8d';
  }

  isChartVisualization(): boolean {
    const t = this.activeViz?.type;
    return t === 'bar-chart' || t === 'histogram' || t === 'line-chart' || t === 'gauge';
  }

  getFormattedValue(): string {
    if (!this.value) return '-';
    if (this.isChartVisualization()) return '···';
    const val = this.value.value;
    if (Math.abs(val) >= 1000) {
      return (val / 1000) + 'k';
    }
    return String(val);
  }

  getTrendIcon(trend: string): string {
    switch (trend) {
      case 'up': return 'trending_up';
      case 'down': return 'trending_down';
      default: return 'trending_flat';
    }
  }

  getTrendLabel(trend: string): string {
    switch (trend) {
      case 'up': return 'En hausse par rapport aux dernières valeurs';
      case 'down': return 'En baisse par rapport aux dernières valeurs';
      default: return 'Stable par rapport aux dernières valeurs';
    }
  }

  getContextLabel(scope: string): string {
    const labels: Record<string, string> = {
      learner: 'Apprenant',
      teacher: 'Enseignant',
      admin: 'Admin',
      course: 'Cours',
      activity: 'Activité',
      group: 'Groupe',
    };
    return labels[scope] ?? scope;
  }

  openConfigModal(event: Event): void {
    event.stopPropagation();

    // Passer les données via le service
    this.modalData.setData(
      this.indicator?.visualizations || [],
      this.visibleVisualizations.map(v => v.id),
      this.activeVizId,
    );

    const modal = this.modal.create({
      nzTitle: `Configuration - ${this.indicator.name}`,
      nzWidth: 500,
      nzClosable: true,
      nzContent: IndicatorConfigModalComponent,
      nzOkText: 'Sauvegarder',
      nzCancelText: 'Annuler',
      nzOnOk: (componentInstance: IndicatorConfigModalComponent) => {
        return this.saveVizVisibility(componentInstance, modal);
      },
    });
  }

  private saveVizVisibility(componentInstance: IndicatorConfigModalComponent, modal: any): Promise<void> {
    this.isSavingConfig = true;
    const userId = getCurrentUserId();
    const enabledVizIds = componentInstance.getEnabledVizIds();
    const allVizIds = enabledVizIds.length === this.visibleVisualizations.length ? null : enabledVizIds;

    this.indicatorService.setEnabledVizIds(userId, this.indicator.id, allVizIds);

    // La visualisation choisie pour piloter la carte (icône/valeur/graphique) - un seul choix,
    // toujours parmi les visualisations activées (voir indicator-config-modal.component.ts).
    const chosenVizId = componentInstance.getSelectedActiveVizId();
    if (chosenVizId && chosenVizId !== this.activeVizId) {
      this.indicatorService.setVizPreference(userId, this.indicator.id, chosenVizId);
      this.activeVizId = chosenVizId;
    }

    this.message.success('Visualisations sauvegardées');
    this.isSavingConfig = false;
    this.cdr.detectChanges();

    return Promise.resolve();
  }
}
