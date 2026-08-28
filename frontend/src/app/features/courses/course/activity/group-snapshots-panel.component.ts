import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnInit, SimpleChanges, TemplateRef, ViewChild, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { MatIconModule } from '@angular/material/icon';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NgxEchartsModule, NGX_ECHARTS_CONFIG } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';

import { IndicatorService } from '../../../../core/services/indicator.service';
import { DashboardContext, IndicatorDefinition, IndicatorSnapshot } from '../../../../core/models/indicator.model';
import { IndicatorCardComponent } from '../../../../shared/ui/indicator-card/indicator-card.component';
import { buildIndicatorChartOptions } from '../../../../shared/utils/indicator-chart-options.util';
import { environment } from '../../../../../environments/environment';

interface CourseGroup {
  id: string;
  name: string;
}

interface SnapshotRow {
  snapshot: IndicatorSnapshot;
  context: DashboardContext;
  queryParams: Record<string, string>;
}

interface IndicatorPanel {
  indicator: IndicatorDefinition;
  snapshots: SnapshotRow[];
  addOpen: boolean;
  selectedGroupId: string | null;
  availableGroups: CourseGroup[];
}

@Component({
  selector: 'app-group-snapshots-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    NzGridModule,
    NzSelectModule,
    NzButtonModule,
    NzPopconfirmModule,
    NzEmptyModule,
    NzSpinModule,
    NzTagModule,
    NzToolTipModule,
    NzInputModule,
    NzDividerModule,
    NzModalModule,
    NzProgressModule,
    NgxEchartsModule,
    IndicatorCardComponent,
  ],
  providers: [
    {
      provide: NGX_ECHARTS_CONFIG,
      useFactory: () => ({ echarts: () => import('echarts') }),
    },
  ],
  template: `
    <div class="group-snapshots-panel">
      <ng-container *ngIf="loading">
        <nz-spin nzSimple></nz-spin>
      </ng-container>

      <ng-container *ngIf="!loading">
        <!-- Aucun indicateur groupe -->
        <nz-empty
          *ngIf="panels.length === 0"
          nzNotFoundContent="Aucun indicateur de contexte 'groupe' configuré."
          style="margin: 16px 0">
        </nz-empty>

        <!-- Un bloc par indicateur -->
        <div *ngFor="let panel of panels" class="indicator-panel">
          <div class="indicator-panel-header">
            <div class="indicator-panel-info">
              <span class="indicator-name">{{ panel.indicator.name }}</span>
              <span class="indicator-desc" *ngIf="panel.indicator.description">
                {{ panel.indicator.description }}
              </span>
            </div>
            <button
              *ngIf="panel.snapshots.length >= 2"
              nz-button nzType="primary" nzSize="small" nzGhost
              (click)="openCompare(panel)"
              style="border-radius:4px">
              <span style="display:inline-flex;align-items:center;gap:4px;line-height:1">
                <mat-icon style="font-size:14px;width:14px;height:14px;line-height:1">compare</mat-icon>
                Comparer
              </span>
            </button>
          </div>

          <!-- Grille de snapshots côte à côte -->
          <nz-row [nzGutter]="[16, 16]" nzAlign="top" style="flex-wrap: wrap">
            <nz-col *ngFor="let row of panel.snapshots" class="snapshot-col">
              <div class="snapshot-wrapper">
                <!-- Card : titre éditable inline au clic, icône tune + delete intégrés -->
                <ui-indicator-card
                  [indicator]="panel.indicator"
                  [context]="row.context"
                  [clickable]="true"
                  [queryParams]="row.queryParams"
                  [displayTitle]="row.snapshot.title"
                  [showDeleteButton]="true"
                  (titleChange)="renameSnapshot(panel, row, $event)"
                  (deleteClick)="deleteSnapshot(panel, row)"
                />
              </div>
            </nz-col>

            <!-- Bouton Ajouter -->
            <nz-col class="snapshot-col add-col">
              <div class="add-snapshot-area">
                <!-- État fermé : bouton carte pointillée -->
                <ng-container *ngIf="!panel.addOpen">
                  <button class="add-card-btn" (click)="openAdd(panel)"
                    [disabled]="panel.availableGroups.length === 0"
                    nz-tooltip [nzTooltipTitle]="panel.availableGroups.length === 0 ? 'Tous les groupes sont déjà ajoutés' : 'Comparer avec un autre groupe'">
                    <mat-icon class="add-icon">add_circle_outline</mat-icon>
                    <span class="add-label">Ajouter un groupe</span>
                  </button>
                </ng-container>

                <!-- État ouvert : sélecteur + actions -->
                <ng-container *ngIf="panel.addOpen">
                  <div class="add-form-card">
                    <p class="add-form-title">
                      <mat-icon style="font-size:16px;width:16px;height:16px;line-height:1">groups</mat-icon>
                      Ajouter un groupe
                    </p>
                    <nz-select
                      [(ngModel)]="panel.selectedGroupId"
                      nzPlaceHolder="Choisir un groupe"
                      style="width: 100%; margin-bottom: 12px">
                      <nz-option
                        *ngFor="let g of panel.availableGroups"
                        [nzValue]="g.id"
                        [nzLabel]="g.name">
                      </nz-option>
                    </nz-select>
                    <div class="add-form-actions">
                      <button nz-button nzType="primary" nzSize="small"
                        [nzLoading]="addingSnapshot"
                        [disabled]="!panel.selectedGroupId"
                        (click)="addSnapshot(panel)">
                        Ajouter
                      </button>
                      <button nz-button nzType="default" nzSize="small"
                        (click)="closeAdd(panel)">
                        Annuler
                      </button>
                    </div>
                  </div>
                </ng-container>
              </div>
            </nz-col>
          </nz-row>

          <nz-divider *ngIf="panels.indexOf(panel) < panels.length - 1"></nz-divider>
        </div>
      </ng-container>
    </div>

    <!-- ── Modal de comparaison ───────────────────────────── -->
    <ng-template #compareTpl>
      <div *ngIf="compPanel" class="compare-modal">

        <!-- En-tête -->
        <div class="compare-header">
          <mat-icon style="color:#722ed1;flex-shrink:0">compare</mat-icon>
          <div class="compare-header-info">
            <h3>{{ compPanel.indicator.name }}</h3>
            <p class="compare-indicator-desc" *ngIf="compPanel.indicator.description">
              {{ compPanel.indicator.description }}
            </p>
          </div>
          <div class="compare-group-toggles">
            <nz-tag
              *ngFor="let row of compPanel.snapshots"
              [nzColor]="isCompGroupEnabled(row.snapshot.contextId) ? 'purple' : 'default'"
              class="compare-group-tag"
              [class.compare-group-tag--off]="!isCompGroupEnabled(row.snapshot.contextId)"
              (click)="toggleCompGroup(row.snapshot.contextId)"
              nz-tooltip
              [nzTooltipTitle]="isCompGroupEnabled(row.snapshot.contextId) ? 'Masquer ce groupe' : 'Afficher ce groupe'">
              <mat-icon class="compare-tag-icon">
                {{ isCompGroupEnabled(row.snapshot.contextId) ? 'visibility' : 'visibility_off' }}
              </mat-icon>
              {{ row.snapshot.title }}
            </nz-tag>
          </div>
        </div>

        <nz-spin *ngIf="compLoading" nzSimple style="display:block;text-align:center;padding:40px"></nz-spin>

        <!-- Une section par visualisation, groupes en grille 3 colonnes max -->
        <div *ngIf="!compLoading" class="compare-sections">

          <div class="compare-section" *ngFor="let viz of compPanel.indicator.visualizations">

            <!-- Titre de la visualisation -->
            <div class="compare-section-title">
              <mat-icon style="font-size:15px">{{ getVizIcon(viz.type) }}</mat-icon>
              {{ viz.label }}
            </div>

            <!-- Grille des groupes : 3 max par ligne, wrap -->
            <div class="compare-cards-grid">
              <div class="compare-card" *ngFor="let row of compPanel.snapshots" [hidden]="!isCompGroupEnabled(row.snapshot.contextId)">

                <!-- Nom du groupe -->
                <div class="compare-card-title">
                  <mat-icon style="font-size:14px;color:#722ed1">groups</mat-icon>
                  {{ row.snapshot.title }}
                </div>

                <!-- Valeur -->
                <div class="compare-card-body">
                  <ng-container *ngIf="getCompResult(row.snapshot.contextId, viz.id) as res; else loadingCell">

                    <!-- Scalaire simple : card / line-chart (pas d'historique disponible sur un
                         snapshot ponctuel, donc pas de vraie courbe possible ici). -->
                    <ng-container *ngIf="viz.type === 'card' || viz.type === 'line-chart'">
                      <div class="compare-scalar" [style.color]="viz.color || '#5470c6'">
                        {{ res.value | number:'1.0-2' }}
                        <span class="compare-unit" [style.color]="viz.color || '#5470c6'">{{ viz.unit || '' }}</span>
                      </div>
                    </ng-container>

                    <!-- Graphique réel (gauge / bar-chart / histogram) : même rendu ECharts que
                         la page détail d'un indicateur (buildIndicatorChartOptions partagé).
                         *ngIf sur les options elles-mêmes (pas juste sur le type) : le div
                         echarts ne doit exister dans le DOM qu'une fois les vraies options
                         disponibles, sinon ECharts s'initialise avec des options vides (le temps
                         que le Promise.all(fetches) de openCompare() se résolve après l'ouverture
                         de la modale) et ne se corrige jamais tout seul ensuite. -->
                    <div class="compare-chart"
                      *ngIf="(viz.type === 'gauge' || viz.type === 'bar-chart' || viz.type === 'histogram') && getCompChartOptions(row.snapshot.contextId, viz.id) as opts"
                      echarts
                      [options]="opts"
                      [autoResize]="true">
                    </div>

                  </ng-container>
                  <ng-template #loadingCell>
                    <div class="compare-loading-cell"><nz-spin nzSimple nzSize="small"></nz-spin></div>
                  </ng-template>
                </div>

              </div>
            </div>

          </div>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    .group-snapshots-panel {
      margin-top: 4px;
    }

    .indicator-panel {
      margin-bottom: 8px;
    }

    .indicator-panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }

    .indicator-panel-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    .indicator-name {
      font-weight: 700;
      font-size: 15px;
      color: var(--brand-background-sidebar, #3C2964);
      line-height: 1.3;
    }

    .indicator-desc {
      font-size: 12px;
      color: #8c8c8c;
      font-style: italic;
      line-height: 1.4;
    }

    .snapshot-col {
      width: 200px;
      min-width: 180px;
    }

    .snapshot-wrapper {
      display: flex;
      flex-direction: column;
    }

    .add-col {
      display: flex;
      align-items: stretch;
    }

    .add-snapshot-area {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      width: 100%;
    }

    /* Bouton carte pointillée */
    .add-card-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 180px;
      height: 140px;
      border: 2px dashed #d9d9d9;
      border-radius: 8px;
      background: transparent;
      cursor: pointer;
      color: #8c8c8c;
      transition: border-color 0.2s, color 0.2s, background 0.2s;
      padding: 0;
    }

    .add-card-btn:hover:not(:disabled) {
      border-color: #1890ff;
      color: #1890ff;
      background: #e6f4ff;
    }

    .add-card-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .add-icon {
      font-size: 28px !important;
      width: 28px !important;
      height: 28px !important;
    }

    .add-label {
      font-size: 12px;
      font-weight: 500;
      text-align: center;
      line-height: 1.3;
    }

    /* Formulaire d'ajout (état ouvert) */
    .add-form-card {
      width: 180px;
      border: 1px solid #d9d9d9;
      border-radius: 8px;
      padding: 12px;
      background: #fafafa;
    }

    .add-form-title {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 10px;
      color: #595959;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .add-form-actions {
      display: flex;
      gap: 8px;
    }

    /* ── Modal comparaison ─────────────────────────────── */
    .compare-modal { padding: 0 4px; }
    .compare-header {
      display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .compare-header-info {
      flex: 1;
      min-width: 0;
      h3 { margin: 0; font-size: 16px; font-weight: 700; }
    }
    .compare-indicator-desc {
      margin: 3px 0 0;
      font-size: 13px;
      color: #595959;
      font-style: italic;
    }
    .compare-group-toggles {
      display: flex; flex-wrap: wrap; gap: 6px;
    }
    .compare-group-tag {
      cursor: pointer;
      display: inline-flex; align-items: center; gap: 4px;
      transition: opacity 0.15s;
      user-select: none;
    }
    .compare-group-tag:hover { opacity: 0.8; }
    .compare-group-tag--off { opacity: 0.45; }
    .compare-tag-icon {
      font-size: 12px !important;
      width: 12px !important;
      height: 12px !important;
      line-height: 1 !important;
    }
    .compare-sections { display: flex; flex-direction: column; gap: 16px; }
    /* Même motif que .wizard-section (indicator-builder) : bordure bleue, coins arrondis -
       une vraie boîte par visualisation, plus seulement un espacement + un liseré sous le titre. */
    .compare-section { border: 1px solid #1890ff; border-radius: 10px; padding: 16px 18px; background: #fff; }
    .compare-section-title {
      display: flex; align-items: center; gap: 6px;
      font-size: 13px; font-weight: 600; color: #444;
      margin-bottom: 14px;
    }
    .compare-cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .compare-card {
      border: 1px solid #f0f0f0;
      border-radius: 10px;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,.06);
    }
    .compare-card-title {
      display: flex; align-items: center; gap: 6px;
      padding: 10px 14px;
      background: #f9f0ff;
      border-bottom: 1px solid #efdbff;
      font-size: 13px; font-weight: 600; color: #531dab;
    }
    .compare-card-body {
      padding: 16px;
      display: flex; flex-direction: column; align-items: center;
      width: 100%; box-sizing: border-box;
    }
    .compare-scalar {
      font-size: 36px; font-weight: 700; line-height: 1;
      display: flex; align-items: baseline; gap: 6px;
    }
    .compare-unit { font-size: 15px; font-weight: 400; }
    /* Format compact pour tenir dans une carte de la grille (3 colonnes max) - même rendu
       ECharts que la page détail, juste redimensionné. */
    .compare-chart { width: 100%; height: 200px; }
    .compare-loading-cell { padding: 24px; }
  `],
})
export class GroupSnapshotsPanelComponent implements OnInit, OnChanges {
  @Input() groupIndicators: IndicatorDefinition[] = [];
  // Absent = mode cours entier (toutes activités agrégées, isCourseAware) ; présent = mode
  // activité précise (comportement historique). `courseId` reste toujours requis (utilisé
  // pour la liste des groupes du cours, indépendamment du mode).
  @Input() activityId?: string;
  @Input() courseId!: string;
  @Input() activityName = '';
  @Input() courseName = '';

  /** L'un ou l'autre selon le mode - voir activityId ci-dessus. */
  private get scope(): { activityId: string } | { courseId: string } {
    return this.activityId ? { activityId: this.activityId } : { courseId: this.courseId };
  }

  @ViewChild('compareTpl') private compareTplRef!: TemplateRef<any>;

  private readonly indicatorService = inject(IndicatorService);
  private readonly messageService = inject(NzMessageService);
  private readonly modalService = inject(NzModalService);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  protected panels: IndicatorPanel[] = [];
  protected groups: CourseGroup[] = [];
  protected loading = true;
  protected addingSnapshot = false;

  // ── Comparaison ──────────────────────────────────────────────────────────
  protected compPanel: IndicatorPanel | null = null;
  protected compLoading = false;
  // clé: `${groupId}__${vizId}` → { value, structuredValue }
  private compResults = new Map<string, { value: number; structuredValue?: any }>();
  // même clé → options ECharts précalculées (gauge/bar-chart/histogram), voir openCompare()
  private compChartOptions = new Map<string, EChartsOption>();
  // contextIds des groupes masqués dans la vue comparaison
  protected compDisabledGroups = new Set<string>();

  private readonly apiBase = `${environment.apiUrl}/v1`;

  ngOnInit(): void {
    // Le *ngIf parent garantit que groupIndicators.length > 0 à la création du composant.
    // On charge toujours groupes + snapshots à l'init.
    this.loadAll();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Réagit aux changements d'indicateurs ou d'activité après la première init.
    if ((changes['groupIndicators'] || changes['activityId'] || changes['courseId']) && !this.isFirstChange(changes)) {
      if (this.groupIndicators.length > 0) {
        this.loadAll();
      }
    }
  }

  private isFirstChange(changes: SimpleChanges): boolean {
    return Object.values(changes).some(c => c.firstChange);
  }

  private async loadAll(): Promise<void> {
    this.loading = true;
    this.panels = [];
    this.cdr.markForCheck();
    await this.loadGroups();
    await this.loadAllSnapshots();
  }

  private async loadGroups(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<{ resources: CourseGroup[] } | CourseGroup[]>(
          `${this.apiBase}/courses/${this.courseId}/groups`,
        ),
      );
      // L'API retourne { resources: [], total: N }
      this.groups = Array.isArray(data) ? data : ((data as any).resources ?? []);
    } catch {
      this.groups = [];
    }
  }

  private async loadAllSnapshots(): Promise<void> {
    this.loading = true;
    this.panels = [];

    for (const ind of this.groupIndicators) {
      let snapshots: IndicatorSnapshot[] = [];
      try {
        snapshots = await firstValueFrom(this.indicatorService.getSnapshots(ind.id, this.scope));
      } catch {
        snapshots = [];
      }
      const rows = snapshots.map(s => this.toRow(s));
      this.panels.push({
        indicator: ind,
        snapshots: rows,
        addOpen: false,
        selectedGroupId: null,
        availableGroups: this.computeAvailableGroups(rows),
      });
    }

    this.loading = false;
    this.cdr.markForCheck();
  }

  private toRow(snapshot: IndicatorSnapshot): SnapshotRow {
    const group = this.groups.find(g => g.id === snapshot.contextId);
    return {
      snapshot,
      context: {
        scope: 'group',
        scopeId: snapshot.contextId,
        userId: '',
        ...(snapshot.activityId ? { activityId: snapshot.activityId } : { courseId: snapshot.courseId! }),
      },
      queryParams: {
        from: 'group-snapshot',
        groupId: snapshot.contextId,
        groupName: group?.name ?? snapshot.title,
        ...(snapshot.activityId ? { activityId: snapshot.activityId } : {}),
        courseId: this.courseId,
        activityName: this.activityName,
        courseName: this.courseName,
      },
    };
  }

  /** Calcule la liste des groupes non encore ajoutés pour cet indicateur. */
  private computeAvailableGroups(snapshots: SnapshotRow[]): CourseGroup[] {
    const usedIds = new Set(snapshots.map(r => r.snapshot.contextId));
    return this.groups.filter(g => !usedIds.has(g.id));
  }

  /** Met à jour panel.availableGroups et panel.selectedGroupId en cohérence. */
  private refreshPanel(panel: IndicatorPanel): void {
    panel.availableGroups = this.computeAvailableGroups(panel.snapshots);
    if (!panel.availableGroups.some(g => g.id === panel.selectedGroupId)) {
      panel.selectedGroupId = panel.availableGroups[0]?.id ?? null;
    }
  }

  protected openAdd(panel: IndicatorPanel): void {
    panel.addOpen = true;
    panel.selectedGroupId = panel.availableGroups[0]?.id ?? null;
    this.cdr.markForCheck();
  }

  protected closeAdd(panel: IndicatorPanel): void {
    panel.addOpen = false;
    panel.selectedGroupId = null;
    this.cdr.markForCheck();
  }

  protected async addSnapshot(panel: IndicatorPanel): Promise<void> {
    if (!panel.selectedGroupId || this.addingSnapshot) return;

    const group = this.groups.find(g => g.id === panel.selectedGroupId);
    if (!group) return;

    if (panel.snapshots.some(r => r.snapshot.contextId === panel.selectedGroupId)) {
      this.messageService.info(`Le groupe "${group.name}" est déjà ajouté pour cet indicateur.`);
      panel.addOpen = false;
      panel.selectedGroupId = null;
      this.cdr.markForCheck();
      return;
    }

    this.addingSnapshot = true;
    this.cdr.markForCheck();

    try {
      const snapshot = await firstValueFrom(
        this.indicatorService.createSnapshot(panel.indicator.id, {
          contextType: 'group',
          contextId: group.id,
          ...this.scope,
          title: group.name,
        }),
      );
      panel.snapshots = [...panel.snapshots, this.toRow(snapshot)];
      this.refreshPanel(panel);
      panel.addOpen = false;
      this.messageService.success(`Groupe "${group.name}" ajouté.`);
    } catch (err: any) {
      if (err?.status === 409) {
        this.messageService.info(`Le groupe "${group.name}" est déjà ajouté pour cet indicateur.`);
        panel.addOpen = false;
        panel.selectedGroupId = null;
      } else {
        this.messageService.error('Erreur lors de la création du snapshot.');
      }
    }

    this.addingSnapshot = false;
    this.cdr.detectChanges();
  }

  protected async renameSnapshot(panel: IndicatorPanel, row: SnapshotRow, newTitle: string): Promise<void> {
    const oldTitle = row.snapshot.title;
    // Mise à jour optimiste
    row.snapshot.title = newTitle;
    row.queryParams = { ...row.queryParams, groupName: newTitle };
    this.cdr.markForCheck();

    try {
      await firstValueFrom(
        this.indicatorService.updateSnapshotTitle(panel.indicator.id, row.snapshot.id, newTitle),
      );
      this.messageService.success('Titre mis à jour.');
    } catch {
      // Retour à l'ancienne valeur en cas d'erreur
      row.snapshot.title = oldTitle;
      row.queryParams = { ...row.queryParams, groupName: oldTitle };
      this.messageService.error('Erreur lors de la mise à jour du titre.');
      this.cdr.markForCheck();
    }
  }

  protected async deleteSnapshot(panel: IndicatorPanel, row: SnapshotRow): Promise<void> {
    try {
      await firstValueFrom(
        this.indicatorService.deleteSnapshot(panel.indicator.id, row.snapshot.id),
      );
      panel.snapshots = panel.snapshots.filter(r => r.snapshot.id !== row.snapshot.id);
      this.refreshPanel(panel);
      this.messageService.success('Snapshot supprimé.');
    } catch {
      this.messageService.error('Erreur lors de la suppression.');
    }
    this.cdr.detectChanges();
  }

  // ── Comparaison ──────────────────────────────────────────────────────────

  protected isCompGroupEnabled(contextId: string): boolean {
    return !this.compDisabledGroups.has(contextId);
  }

  protected toggleCompGroup(contextId: string): void {
    if (this.compDisabledGroups.has(contextId)) {
      this.compDisabledGroups.delete(contextId);
    } else {
      this.compDisabledGroups.add(contextId);
    }
    this.cdr.markForCheck();
  }

  protected async openCompare(panel: IndicatorPanel): Promise<void> {
    this.compPanel = panel;
    this.compResults.clear();
    this.compChartOptions.clear();
    this.compDisabledGroups.clear();
    this.compLoading = true;
    this.cdr.markForCheck();

    this.modalService.create({
      nzTitle: 'Comparaison par groupe',
      nzContent: this.compareTplRef,
      nzWidth: '95vw',
      nzFooter: null,
      nzCentered: true,
      nzBodyStyle: { padding: '16px 20px', 'max-height': 'calc(90vh - 55px)', 'overflow-y': 'auto' },
    });

    // Charger toutes les valeurs : groupe × visualisation
    const fetches = panel.snapshots.flatMap(row =>
      panel.indicator.visualizations.map(viz =>
        firstValueFrom(
          this.indicatorService.computeView(
            panel.indicator.id, 'group', row.snapshot.contextId,
            row.snapshot.activityId ?? undefined, viz.id, row.snapshot.courseId ?? undefined,
          ),
        ).then(res => {
          const key = `${row.snapshot.contextId}__${viz.id}`;
          const structuredValue = res.structuredValue ?? (res as any).metadata?.structuredValue;
          this.compResults.set(key, { value: res.value, structuredValue });
          // Même rendu ECharts que la page détail (indicator-chart-options.util.ts) - calculé
          // une seule fois ici plutôt qu'à chaque cycle de détection pour éviter de recréer
          // l'objet d'options à chaque fois (ngx-echarts recompare par référence).
          const options = buildIndicatorChartOptions(viz, { value: res.value, structuredValue }, panel.indicator.thresholds);
          if (options) this.compChartOptions.set(key, options);
        }).catch(() => {
          this.compResults.set(`${row.snapshot.contextId}__${viz.id}`, { value: 0 });
        }),
      ),
    );

    await Promise.all(fetches);
    this.compLoading = false;
    this.cdr.markForCheck();
  }

  protected getCompResult(groupId: string, vizId: string) {
    return this.compResults.get(`${groupId}__${vizId}`) ?? null;
  }

  protected getCompChartOptions(groupId: string, vizId: string): EChartsOption | null {
    return this.compChartOptions.get(`${groupId}__${vizId}`) ?? null;
  }

  protected getVizIcon(type: string): string {
    const map: Record<string, string> = {
      card: 'credit_card', gauge: 'speed', 'bar-chart': 'bar_chart',
      histogram: 'equalizer', 'line-chart': 'show_chart',
    };
    return map[type] ?? 'analytics';
  }
}
