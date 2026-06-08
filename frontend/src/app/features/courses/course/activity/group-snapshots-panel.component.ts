import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, inject,
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
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzDividerModule } from 'ng-zorro-antd/divider';

import { IndicatorService } from '../../../../core/services/indicator.service';
import { DashboardContext, IndicatorDefinition, IndicatorSnapshot } from '../../../../core/models/indicator.model';
import { IndicatorCardComponent } from '../../../../shared/ui/indicator-card/indicator-card.component';
import { environment } from '../../../../../environments/environment';

interface CourseGroup {
  id: string;
  name: string;
}

interface SnapshotRow {
  snapshot: IndicatorSnapshot;
  context: DashboardContext;
  queryParams: Record<string, string>;
  editingTitle: boolean;
  draftTitle: string;
}

interface IndicatorPanel {
  indicator: IndicatorDefinition;
  snapshots: SnapshotRow[];
  addOpen: boolean;
  selectedGroupId: string | null;
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
    NzTooltipModule,
    NzInputModule,
    NzDividerModule,
    IndicatorCardComponent,
  ],
  template: `
    <div class="group-snapshots-panel">
      <h4>Indicateurs par groupe</h4>

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
            <span class="indicator-name">{{ panel.indicator.name }}</span>
            <span class="indicator-desc" *ngIf="panel.indicator.description">
              - {{ panel.indicator.description }}
            </span>
          </div>

          <!-- Grille de snapshots côte à côte -->
          <nz-row [nzGutter]="[16, 16]" nzAlign="top" style="flex-wrap: wrap">
            <nz-col *ngFor="let row of panel.snapshots" class="snapshot-col">
              <div class="snapshot-wrapper">
                <!-- La card indicateur : le titre du snapshot s'affiche dedans -->
                <ui-indicator-card
                  [indicator]="panel.indicator"
                  [context]="row.context"
                  [clickable]="true"
                  [queryParams]="row.queryParams"
                  [displayTitle]="row.snapshot.title"
                />

                <!-- Actions sous la card -->
                <ng-container *ngIf="!row.editingTitle">
                  <div class="snapshot-actions">
                    <button nz-button nzType="text" nzSize="small"
                      nz-tooltip nzTooltipTitle="Renommer"
                      (click)="startEditTitle(row)">
                      <mat-icon style="font-size:14px">edit</mat-icon>
                    </button>
                    <button nz-button nzType="text" nzSize="small" nzDanger
                      nz-popconfirm
                      nzPopconfirmTitle="Supprimer ce snapshot ?"
                      (nzOnConfirm)="deleteSnapshot(panel, row)">
                      <mat-icon style="font-size:14px">delete_outline</mat-icon>
                    </button>
                  </div>
                </ng-container>
                <ng-container *ngIf="row.editingTitle">
                  <div class="snapshot-edit-form">
                    <input nz-input
                      [(ngModel)]="row.draftTitle"
                      style="font-size: 12px"
                      (keydown.enter)="saveTitle(panel, row)"
                      (keydown.escape)="cancelEdit(row)"
                    />
                    <button nz-button nzType="primary" nzSize="small"
                      (click)="saveTitle(panel, row)">
                      <mat-icon style="font-size:13px">check</mat-icon>
                    </button>
                    <button nz-button nzType="text" nzSize="small"
                      (click)="cancelEdit(row)">
                      <mat-icon style="font-size:13px">close</mat-icon>
                    </button>
                  </div>
                </ng-container>
              </div>
            </nz-col>

            <!-- Bouton Ajouter -->
            <nz-col class="snapshot-col add-col">
              <div class="add-snapshot-area">
                <!-- État fermé : bouton carte pointillée -->
                <ng-container *ngIf="!panel.addOpen">
                  <button class="add-card-btn" (click)="openAdd(panel)"
                    [disabled]="availableGroups(panel).length === 0"
                    nz-tooltip [nzTooltipTitle]="availableGroups(panel).length === 0 ? 'Tous les groupes sont déjà ajoutés' : 'Comparer avec un autre groupe'">
                    <mat-icon class="add-icon">add_circle_outline</mat-icon>
                    <span class="add-label">Ajouter un groupe</span>
                  </button>
                </ng-container>

                <!-- État ouvert : sélecteur + actions -->
                <ng-container *ngIf="panel.addOpen">
                  <div class="add-form-card">
                    <p class="add-form-title">
                      <mat-icon style="font-size:16px;vertical-align:middle">groups</mat-icon>
                      Comparer avec
                    </p>
                    <nz-select
                      [(ngModel)]="panel.selectedGroupId"
                      nzPlaceHolder="Choisir un groupe"
                      style="width: 100%; margin-bottom: 12px">
                      <nz-option
                        *ngFor="let g of availableGroups(panel)"
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
  `,
  styles: [`
    .group-snapshots-panel {
      margin-top: 16px;
    }

    .group-snapshots-panel > h4 {
      font-size: 16px;
      font-weight: 700;
      color: var(--brand-background-sidebar, #3C2964);
      margin-bottom: 16px;
    }

    .indicator-panel {
      margin-bottom: 8px;
    }

    .indicator-panel-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 12px;
    }

    .indicator-name {
      font-weight: 600;
      font-size: 14px;
    }

    .indicator-desc {
      font-size: 12px;
      color: var(--text-secondary, #888);
    }

    .snapshot-col {
      width: 200px;
      min-width: 180px;
    }

    .snapshot-wrapper {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .snapshot-actions {
      display: flex;
      justify-content: flex-end;
      gap: 2px;
    }

    .snapshot-edit-form {
      display: flex;
      align-items: center;
      gap: 4px;

      input {
        flex: 1;
        min-width: 0;
      }
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
  `],
})
export class GroupSnapshotsPanelComponent implements OnInit {
  @Input() groupIndicators: IndicatorDefinition[] = [];
  @Input() activityId!: string;
  @Input() courseId!: string;
  @Input() activityName = '';
  @Input() courseName = '';

  private readonly indicatorService = inject(IndicatorService);
  private readonly messageService = inject(NzMessageService);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  protected panels: IndicatorPanel[] = [];
  protected groups: CourseGroup[] = [];
  protected loading = true;
  protected addingSnapshot = false;

  private readonly apiBase = `${environment.apiUrl}/v1`;

  ngOnInit(): void {
    this.loadGroups().then(() => this.loadAllSnapshots());
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
        snapshots = await firstValueFrom(this.indicatorService.getSnapshots(ind.id, this.activityId));
      } catch {
        snapshots = [];
      }
      this.panels.push({
        indicator: ind,
        snapshots: snapshots.map(s => this.toRow(s)),
        addOpen: false,
        selectedGroupId: null,
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
        activityId: snapshot.activityId,
      },
      queryParams: {
        from: 'group-snapshot',
        groupId: snapshot.contextId,
        groupName: group?.name ?? snapshot.title,
        activityId: snapshot.activityId,
        courseId: this.courseId,
        activityName: this.activityName,
        courseName: this.courseName,
      },
      editingTitle: false,
      draftTitle: snapshot.title,
    };
  }

  /** Groupes pas encore ajoutés pour cet indicateur. */
  protected availableGroups(panel: IndicatorPanel): CourseGroup[] {
    const usedIds = new Set(panel.snapshots.map(r => r.snapshot.contextId));
    return this.groups.filter(g => !usedIds.has(g.id));
  }

  protected openAdd(panel: IndicatorPanel): void {
    panel.addOpen = true;
    panel.selectedGroupId = this.availableGroups(panel)[0]?.id ?? null;
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

    this.addingSnapshot = true;

    try {
      const snapshot = await firstValueFrom(
        this.indicatorService.createSnapshot(panel.indicator.id, {
          contextType: 'group',
          contextId: group.id,
          activityId: this.activityId,
          title: group.name,
        }),
      );
      panel.snapshots.push(this.toRow(snapshot));
      panel.addOpen = false;
      panel.selectedGroupId = null;
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
    this.cdr.markForCheck();
  }

  protected startEditTitle(row: SnapshotRow): void {
    row.draftTitle = row.snapshot.title;
    row.editingTitle = true;
    this.cdr.markForCheck();
  }

  protected cancelEdit(row: SnapshotRow): void {
    row.editingTitle = false;
    this.cdr.markForCheck();
  }

  protected async saveTitle(panel: IndicatorPanel, row: SnapshotRow): Promise<void> {
    const newTitle = row.draftTitle.trim();
    if (!newTitle || newTitle === row.snapshot.title) {
      row.editingTitle = false;
      this.cdr.markForCheck();
      return;
    }

    try {
      const updated = await firstValueFrom(
        this.indicatorService.updateSnapshotTitle(panel.indicator.id, row.snapshot.id, newTitle),
      );
      row.snapshot = updated;
      row.snapshot.title = updated.title;
      row.queryParams = { ...row.queryParams, groupName: updated.title };
      row.editingTitle = false;
      this.messageService.success('Titre mis à jour.');
    } catch {
      this.messageService.error('Erreur lors de la mise à jour du titre.');
    }

    this.cdr.markForCheck();
  }

  protected async deleteSnapshot(panel: IndicatorPanel, row: SnapshotRow): Promise<void> {
    try {
      await firstValueFrom(
        this.indicatorService.deleteSnapshot(panel.indicator.id, row.snapshot.id),
      );
      panel.snapshots = panel.snapshots.filter(r => r.snapshot.id !== row.snapshot.id);
      this.messageService.success('Snapshot supprimé.');
    } catch {
      this.messageService.error('Erreur lors de la suppression.');
    }
    this.cdr.markForCheck();
  }
}
