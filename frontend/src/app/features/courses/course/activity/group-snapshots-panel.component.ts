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
  templateUrl: './group-snapshots-panel.component.html',
  styleUrls: ['./group-snapshots-panel.component.scss'],
})
export class GroupSnapshotsPanelComponent implements OnInit, OnChanges {
  @Input() groupIndicators: IndicatorDefinition[] = [];
  /*
  Absent = mode cours entier (toutes activités agrégées, isCourseAware) ; présent = mode
  activité précise (comportement historique). `courseId` reste toujours requis (utilisé
  pour la liste des groupes du cours, indépendamment du mode).
  */
  @Input() activityId?: string;
  @Input() courseId!: string;
  @Input() activityName = '';
  @Input() courseName = '';

  // L'un ou l'autre selon le mode - voir activityId ci-dessus.
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

  //  Comparaison
  protected compPanel: IndicatorPanel | null = null;
  protected compLoading = false;
  // clé: `${groupId}__${vizId}` - { value, structuredValue }
  private compResults = new Map<string, { value: number; structuredValue?: any }>();
  // même clé → options ECharts précalculées (gauge/bar-chart/histogram), voir openCompare()
  private compChartOptions = new Map<string, EChartsOption>();
  // contextIds des groupes masqués dans la vue comparaison
  protected compDisabledGroups = new Set<string>();

  private readonly apiBase = `${environment.apiUrl}/v1`;

  ngOnInit(): void {
    /*
    Le *ngIf parent garantit que groupIndicators.length > 0 à la création du composant.
    On charge toujours groupes + snapshots à l'init.
    */
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

  // Calcule la liste des groupes non encore ajoutés pour cet indicateur.
  private computeAvailableGroups(snapshots: SnapshotRow[]): CourseGroup[] {
    const usedIds = new Set(snapshots.map(r => r.snapshot.contextId));
    return this.groups.filter(g => !usedIds.has(g.id));
  }

  // Met à jour panel.availableGroups et panel.selectedGroupId en cohérence.
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

  //  Comparaison

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
          /*
          Même rendu ECharts que la page détail (indicator-chart-options.util.ts) - calculé
          une seule fois ici plutôt qu'à chaque cycle de détection pour éviter de recréer
          l'objet d'options à chaque fois (ngx-echarts recompare par référence).
          */
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
