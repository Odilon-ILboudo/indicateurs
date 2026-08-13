// frontend/src/app/features/admin/event-rule-builder.component.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { IndicatorService } from '../../core/services/indicator.service';
import {
  EventRule, EventTypeOption, EventRuleOperation, EventRuleConditionKind,
  EventRuleCondition, EventRuleContextMapping, CreateEventRuleBody,
} from '../../core/models/indicator.model';

interface PlatonTable { name: string; columns: { name: string; type: string }[]; }

@Component({
  selector: 'ui-event-rule-builder',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule,
    NzFormModule, NzInputModule, NzInputNumberModule, NzSelectModule, NzRadioModule,
    NzButtonModule, NzDividerModule, NzTooltipModule,
  ],
  template: `
    <div class="rule-builder">
      <p class="rule-builder-intro">
        Une règle décrit comment un changement réel dans PLaTon (une table, une colonne, une
        condition) doit être transformé en événement utilisable comme déclencheur
        d'indicateur. Le trigger PostgreSQL correspondant devra ensuite être installé
        explicitement depuis la liste, une fois la règle enregistrée.
      </p>

      <nz-divider nzText="1. Source du changement"></nz-divider>

      <nz-form-item>
        <nz-form-label [nzRequired]="true">Table PLaTon</nz-form-label>
        <nz-form-control>
          <nz-select [(ngModel)]="sourceTable" (ngModelChange)="onTableChange()"
            nzPlaceHolder="Choisir une table" nzShowSearch style="width:100%" [nzLoading]="schemaLoading">
            <nz-option *ngFor="let t of platonSchema" [nzValue]="t.name" [nzLabel]="t.name"></nz-option>
          </nz-select>
        </nz-form-control>
      </nz-form-item>

      <nz-form-item *ngIf="sourceTable">
        <nz-form-label>
          Colonne surveillée
          <mat-icon class="info-icon" nz-tooltip="Laisser vide pour ne réagir qu'à un INSERT (nouvelle ligne), sans surveiller de colonne précise." nzTooltipPlacement="right">info_outline</mat-icon>
        </nz-form-label>
        <nz-form-control>
          <nz-select [(ngModel)]="watchedColumn" nzAllowClear nzPlaceHolder="Aucune (INSERT uniquement)" style="width:100%">
            <nz-option *ngFor="let c of watchableColumns(sourceTable)" [nzValue]="c.name" [nzLabel]="c.name + ' (' + c.type + ')'"></nz-option>
          </nz-select>
        </nz-form-control>
      </nz-form-item>

      <nz-form-item *ngIf="sourceTable">
        <nz-form-label [nzRequired]="true">Opération</nz-form-label>
        <nz-form-control>
          <nz-select [(ngModel)]="operation" style="width:100%">
            <nz-option nzValue="UPDATE" nzLabel="Modification (UPDATE)"></nz-option>
            <nz-option nzValue="INSERT" nzLabel="Création (INSERT)"></nz-option>
            <nz-option nzValue="INSERT_OR_UPDATE" nzLabel="Les deux"></nz-option>
          </nz-select>
        </nz-form-control>
      </nz-form-item>

      <ng-container *ngIf="sourceTable">
        <nz-divider nzText="2. Condition"></nz-divider>

        <nz-form-item>
          <nz-form-label>Déclencher quand…</nz-form-label>
          <nz-form-control>
            <nz-radio-group [(ngModel)]="condition.kind" (ngModelChange)="onConditionKindChange()" style="display:flex;flex-direction:column;gap:6px">
              <label nz-radio nzValue="always">à chaque changement (aucune condition)</label>
              <label nz-radio nzValue="changed" [nzDisabled]="!watchedColumn">la valeur de la colonne a changé</label>
              <label nz-radio nzValue="equals" [nzDisabled]="!watchedColumn">la colonne est égale à une valeur</label>
              <label nz-radio nzValue="not_equals" [nzDisabled]="!watchedColumn">la colonne est différente d'une valeur</label>
              <label nz-radio nzValue="threshold_crossed" [nzDisabled]="!watchedColumn">la colonne franchit un seuil (première fois seulement)</label>
            </nz-radio-group>
          </nz-form-control>
        </nz-form-item>

        <nz-form-item *ngIf="condition.kind === 'equals' || condition.kind === 'not_equals'">
          <nz-form-label>Valeur</nz-form-label>
          <nz-form-control>
            <input nz-input [(ngModel)]="condition.value" placeholder="ex: 100" />
          </nz-form-control>
        </nz-form-item>

        <nz-form-item *ngIf="condition.kind === 'threshold_crossed'">
          <nz-form-label>Seuil</nz-form-label>
          <nz-form-control>
            <div style="display:flex;gap:8px;align-items:center">
              <nz-select [(ngModel)]="condition.operator" style="width:100px">
                <nz-option nzValue=">" nzLabel="&gt;"></nz-option>
                <nz-option nzValue=">=" nzLabel="&gt;="></nz-option>
                <nz-option nzValue="<" nzLabel="&lt;"></nz-option>
                <nz-option nzValue="<=" nzLabel="&lt;="></nz-option>
              </nz-select>
              <nz-input-number [(ngModel)]="condition.threshold" style="width:120px"></nz-input-number>
            </div>
          </nz-form-control>
        </nz-form-item>

        <nz-divider nzText="3. À quoi rattacher l'événement (contexte)"></nz-divider>
        <p class="rule-builder-hint">
          Un indicateur a besoin de savoir "pour qui" et "dans quel cours/activité" recalculer sa
          valeur. Indiquez quelle colonne de {{ sourceTable }} contient chaque information.
        </p>

        <nz-form-item>
          <nz-form-label [nzRequired]="true">Utilisateur concerné</nz-form-label>
          <nz-form-control>
            <nz-select [(ngModel)]="contextMapping.userId" nzPlaceHolder="Colonne → userId" style="width:100%">
              <nz-option *ngFor="let c of columnsOf(sourceTable)" [nzValue]="c.name" [nzLabel]="c.name"></nz-option>
            </nz-select>
          </nz-form-control>
        </nz-form-item>

        <nz-form-item>
          <nz-form-label>Cours</nz-form-label>
          <nz-form-control>
            <nz-select [(ngModel)]="contextMapping.courseId" nzAllowClear nzPlaceHolder="Colonne → courseId (optionnel)" style="width:100%">
              <nz-option *ngFor="let c of columnsOf(sourceTable)" [nzValue]="c.name" [nzLabel]="c.name"></nz-option>
            </nz-select>
          </nz-form-control>
        </nz-form-item>

        <nz-form-item>
          <nz-form-label>Activité</nz-form-label>
          <nz-form-control>
            <nz-select [(ngModel)]="contextMapping.activityId" nzAllowClear nzPlaceHolder="Colonne → activityId (optionnel)" style="width:100%">
              <nz-option *ngFor="let c of columnsOf(sourceTable)" [nzValue]="c.name" [nzLabel]="c.name"></nz-option>
            </nz-select>
          </nz-form-control>
        </nz-form-item>

        <nz-form-item>
          <nz-form-label>Session <mat-icon class="info-icon" nz-tooltip="Colonne identifiant la ligne précise (ex: id de SessionData). Sans elle, chaque événement déclenche un recalcul complet de l'indicateur ; avec elle, seule la ligne concernée est mise à jour (plus rapide, surtout avec des événements fréquents)." nzTooltipPlacement="right">info_outline</mat-icon></nz-form-label>
          <nz-form-control>
            <nz-select [(ngModel)]="contextMapping.sessionId" nzAllowClear nzPlaceHolder="Colonne → sessionId (optionnel, active le calcul incrémental)" style="width:100%">
              <nz-option *ngFor="let c of columnsOf(sourceTable)" [nzValue]="c.name" [nzLabel]="c.name"></nz-option>
            </nz-select>
          </nz-form-control>
        </nz-form-item>

        <nz-divider nzText="4. Événement résultant"></nz-divider>

        <nz-form-item *ngIf="!creatingNewEventType">
          <nz-form-label [nzRequired]="true">Type d'événement</nz-form-label>
          <nz-form-control>
            <div style="display:flex;gap:8px">
              <nz-select [(ngModel)]="eventTypeId" nzPlaceHolder="Choisir un type existant" style="width:100%" [nzLoading]="eventTypesLoading">
                <nz-option *ngFor="let e of eventTypes" [nzValue]="e.id" [nzLabel]="e.name + ' - ' + e.label"></nz-option>
              </nz-select>
              <button nz-button (click)="creatingNewEventType = true">Créer un nouveau type</button>
            </div>
          </nz-form-control>
        </nz-form-item>

        <ng-container *ngIf="creatingNewEventType">
          <nz-form-item>
            <nz-form-label [nzRequired]="true">Nom technique <mat-icon class="info-icon" nz-tooltip="Le style 'domaine.action' (ex: exercise.viewed) est juste une convention de nommage lisible, un choix délibéré - rien ne l'impose techniquement. N'importe quel nom (sans point, autre format...) fonctionne tout aussi bien." nzTooltipPlacement="right">info_outline</mat-icon></nz-form-label>
            <nz-form-control>
              <input nz-input [(ngModel)]="newEventType.name" placeholder="ex: exercise.viewed" />
            </nz-form-control>
          </nz-form-item>
          <nz-form-item>
            <nz-form-label [nzRequired]="true">Libellé</nz-form-label>
            <nz-form-control>
              <input nz-input [(ngModel)]="newEventType.label" placeholder="ex: Exercice consulté" />
            </nz-form-control>
          </nz-form-item>
          <nz-form-item>
            <nz-form-label>Description</nz-form-label>
            <nz-form-control>
              <input nz-input [(ngModel)]="newEventType.description" placeholder="Optionnel" />
            </nz-form-control>
          </nz-form-item>
          <button nz-button (click)="creatingNewEventType = false; eventTypeId = null">
            Utiliser un type existant à la place
          </button>
        </ng-container>
      </ng-container>

      <div class="rule-builder-actions">
        <button nz-button (click)="cancel()">Annuler</button>
        <button nz-button nzType="primary" [disabled]="!canSave" [nzLoading]="saving" (click)="save()">
          Enregistrer la règle
        </button>
      </div>
    </div>
  `,
  styles: [`
    .rule-builder { display:flex; flex-direction:column; }
    .rule-builder-intro { color:#888; font-size:13px; margin-top:0; }
    .rule-builder-hint { color:#888; font-size:12px; margin:0 0 8px; }
    .rule-builder-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
    .info-icon { font-size:14px; width:14px; height:14px; vertical-align:middle; margin-left:4px; color:#8c8c8c; cursor:help; }
  `],
})
export class EventRuleBuilderComponent implements OnInit {
  private readonly modalRef = inject(NzModalRef);
  private readonly indicatorSvc = inject(IndicatorService);
  private readonly messageSvc = inject(NzMessageService);
  private readonly modalData = inject(NZ_MODAL_DATA, { optional: true }) as { rule?: EventRule; presetEventTypeId?: string } | null;

  platonSchema: PlatonTable[] = [];
  schemaLoading = false;
  eventTypes: EventTypeOption[] = [];
  eventTypesLoading = false;

  sourceTable: string | null = null;
  watchedColumn: string | null = null;
  operation: EventRuleOperation = 'UPDATE';
  condition: EventRuleCondition = { kind: 'always' };
  contextMapping: EventRuleContextMapping = { userId: '' };
  eventTypeId: string | null = null;
  creatingNewEventType = false;
  newEventType = { name: '', label: '', description: '' };
  saving = false;

  private readonly _colsCache = new Map<string, { name: string; type: string }[]>();

  ngOnInit(): void {
    this.schemaLoading = true;
    this.indicatorSvc.getPlatonSchema().subscribe({
      next: s => { this.platonSchema = s; this.schemaLoading = false; },
      error: () => { this.schemaLoading = false; },
    });

    this.eventTypesLoading = true;
    this.indicatorSvc.getEventTypes().subscribe({
      next: types => { this.eventTypes = types; this.eventTypesLoading = false; },
      error: () => { this.eventTypesLoading = false; },
    });

    const rule = this.modalData?.rule;
    if (rule) {
      this.sourceTable = rule.sourceTable;
      this.watchedColumn = rule.watchedColumn;
      this.operation = rule.operation;
      this.condition = { ...rule.condition };
      this.contextMapping = { ...rule.contextMapping };
      this.eventTypeId = rule.eventTypeId;
    } else if (this.modalData?.presetEventTypeId) {
      this.eventTypeId = this.modalData.presetEventTypeId;
    }
  }

  onTableChange(): void {
    this.watchedColumn = null;
    this.contextMapping = { userId: '' };
  }

  /** Si la colonne surveillée actuelle n'est plus proposée pour la nouvelle condition
   *  (ex. bascule vers "franchit un seuil" avec une colonne texte sélectionnée), la réinitialiser. */
  onConditionKindChange(): void {
    if (!this.watchedColumn) return;
    const stillValid = this.watchableColumns(this.sourceTable).some(c => c.name === this.watchedColumn);
    if (!stillValid) this.watchedColumn = null;
  }

  columnsOf(table: string | null): { name: string; type: string }[] {
    if (!table) return [];
    const cached = this._colsCache.get(table);
    if (cached) return cached;
    const cols = this.platonSchema.find(t => t.name === table)?.columns ?? [];
    this._colsCache.set(table, cols);
    return cols;
  }

  /** Colonnes proposées pour "Colonne surveillée" - filtrées aux colonnes numériques
   *  quand la condition est "franchit un seuil" (comparaison `>`/`<` n'a de sens que sur du
   *  numérique). Les autres sélecteurs (contexte) utilisent columnsOf() directement, sans
   *  rapport avec la condition. */
  watchableColumns(table: string | null): { name: string; type: string }[] {
    const cols = this.columnsOf(table);
    if (this.condition.kind !== 'threshold_crossed') return cols;
    return cols.filter(c => this.isNumericType(c.type));
  }

  private isNumericType(type: string): boolean {
    return ['integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision']
      .includes(type.toLowerCase());
  }

  get canSave(): boolean {
    if (!this.sourceTable || !this.contextMapping.userId) return false;
    if (!this.isConditionComplete()) return false;
    if (this.creatingNewEventType) {
      return !!this.newEventType.name.trim() && !!this.newEventType.label.trim();
    }
    return !!this.eventTypeId;
  }

  private isConditionComplete(): boolean {
    const c = this.condition;
    if (c.kind === 'equals' || c.kind === 'not_equals') {
      return c.value !== undefined && c.value !== null && c.value !== '';
    }
    if (c.kind === 'threshold_crossed') {
      return !!c.operator && c.threshold !== undefined && c.threshold !== null;
    }
    return true;
  }

  save(): void {
    if (!this.canSave || !this.sourceTable) return;
    const body: CreateEventRuleBody = {
      sourceTable: this.sourceTable,
      watchedColumn: this.watchedColumn,
      operation: this.operation,
      condition: this.condition,
      contextMapping: this.contextMapping,
    };
    if (this.creatingNewEventType) {
      body.newEventType = {
        name: this.newEventType.name.trim(),
        label: this.newEventType.label.trim(),
        description: this.newEventType.description.trim() || undefined,
      };
    } else {
      body.eventTypeId = this.eventTypeId!;
    }

    this.saving = true;
    const rule = this.modalData?.rule;
    const req = rule ? this.indicatorSvc.updateEventRule(rule.id, body) : this.indicatorSvc.createEventRule(body);
    req.subscribe({
      next: saved => { this.saving = false; this.modalRef.close(saved); },
      error: err => {
        this.saving = false;
        this.messageSvc.error(err?.error?.message ?? 'Erreur lors de l\'enregistrement de la règle.');
      },
    });
  }

  cancel(): void { this.modalRef.close(null); }
}
