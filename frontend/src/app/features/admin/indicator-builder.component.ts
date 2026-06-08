// frontend/src/app/features/admin/indicator-builder.component.ts
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CdkDragDrop, CdkDrag, CdkDropList, CdkDragHandle, moveItemInArray } from '@angular/cdk/drag-drop';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzColorPickerModule } from 'ng-zorro-antd/color-picker';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { IndicatorService } from '../../core/services/indicator.service';
import { IndicatorDefinition, IndicatorScope, ViewVisualizationType, TeacherCourse, CourseActivity } from '../../core/models/indicator.model';
import { environment } from '../../../environments/environment';

// ── Types DSL ────────────────────────────────────────────────────────────────

type StepType = 'fetch' | 'filter' | 'groupBy' | 'findFirst' | 'extract' | 'aggregate' | 'round' | 'divide' | 'js';

interface PipelineStep {
  id: string; type: StepType; label: string;
  table?: string; contextFields?: string[]; useGroupContext?: boolean;
  filterField?: string; filterOperator?: string; filterValue?: string | number;
  groupField?: string;
  whereField?: string; whereValue?: string | number; sortField?: string;
  extractField?: string; aggregateFn?: string;
  decimals?: number; divideBy?: number; jsCode?: string;
}

interface FlatViz {
  id: string;
  label: string;
  type: ViewVisualizationType;
  icon: string;
  color: string;
  unit: string;
  thresholds: { good: number; warning: number; danger: number };
  pipeline: PipelineStep[];
}

interface PlatonTable { name: string; columns: { name: string; type: string }[]; }

/** Données partagées par les membres d'une famille, transmises de builder en builder. */
export interface IndicatorFamilyPreset {
  familyName: string;
  description: string;
  requiredEvents: string[];
  contextType: IndicatorScope;
  name: string;
}

export const CONTEXT_LABELS: Record<IndicatorScope, string> = {
  learner:  'Apprenant',
  teacher:  'Enseignant',
  admin:    'Admin',
  course:   'Cours',
  activity: 'Activité',
  group:    'Groupe de TP',
};

// ── Catalogues ───────────────────────────────────────────────────────────────

const STEP_CATALOG: { type: StepType; label: string; icon: string; color: string; desc: string }[] = [
  { type: 'fetch',     label: 'Récupérer données', icon: 'database',     color: '#1890ff', desc: 'Charge les données depuis PLaTon selon le contexte' },
  { type: 'filter',    label: 'Filtrer',            icon: 'filter',       color: '#52c41a', desc: 'Filtre les lignes selon une condition sur un champ' },
  { type: 'groupBy',   label: 'Grouper par',        icon: 'apartment',    color: '#fa8c16', desc: 'Regroupe les données par valeur d\'un champ' },
  { type: 'findFirst', label: 'Premier résultat',   icon: 'aim',          color: '#722ed1', desc: 'Prend le premier élément de chaque groupe' },
  { type: 'extract',   label: 'Extraire champ',     icon: 'scissor',      color: '#eb2f96', desc: 'Extrait la valeur d\'un champ pour chaque ligne' },
  { type: 'aggregate', label: 'Agréger',            icon: 'calculator',   color: '#13c2c2', desc: 'Calcule une agrégation sur le tableau de valeurs' },
  { type: 'round',     label: 'Arrondir',           icon: 'field-number', color: '#faad14', desc: 'Arrondit le résultat à N décimales' },
  { type: 'divide',    label: 'Diviser',            icon: 'percentage',   color: '#ff4d4f', desc: 'Divise le résultat par une constante' },
  { type: 'js',        label: 'Code JS',            icon: 'code',         color: '#595959', desc: 'Exécute une fonction JavaScript sur les données' },
];

const FORMULA_RECIPES: { name: string; desc: string; pipeline: Omit<PipelineStep, 'id'>[] }[] = [
  {
    name: 'Tentatives avant réussite',
    desc: 'Nb moyen de tentatives avant la 1ère note de 100',
    pipeline: [
      { type: 'fetch',     label: 'Charger sessions',     table: 'SessionData', contextFields: ['user_id', 'activity_id'] },
      { type: 'groupBy',   label: 'Grouper par exercice', groupField: 'resource_id' },
      { type: 'findFirst', label: 'Première réussite',    whereField: 'grade', whereValue: 100, sortField: 'created_at' },
      { type: 'extract',   label: 'Tentatives',           extractField: 'attempts' },
      { type: 'aggregate', label: 'Moyenne',              aggregateFn: 'avg' },
      { type: 'round',     label: 'Arrondir',             decimals: 2 },
    ],
  },
  {
    name: 'Note moyenne',
    desc: 'Moyenne des notes sur une activité',
    pipeline: [
      { type: 'fetch',     label: 'Charger sessions', table: 'SessionData', contextFields: ['user_id', 'activity_id'] },
      { type: 'extract',   label: 'Notes',            extractField: 'grade' },
      { type: 'aggregate', label: 'Moyenne',          aggregateFn: 'avg' },
      { type: 'round',     label: 'Arrondir',         decimals: 1 },
    ],
  },
  {
    name: 'Exercices réussis',
    desc: 'Nombre d\'exercices avec une note de 100',
    pipeline: [
      { type: 'fetch',     label: 'Charger sessions', table: 'SessionData', contextFields: ['user_id', 'activity_id'] },
      { type: 'filter',    label: 'Note = 100',       filterField: 'grade', filterOperator: '==', filterValue: 100 },
      { type: 'extract',   label: 'Identifiants',     extractField: 'resource_id' },
      { type: 'aggregate', label: 'Compter',          aggregateFn: 'count' },
    ],
  },
];

// ── Composant ────────────────────────────────────────────────────────────────

@Component({
  selector: 'ui-indicator-builder',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule,
    CdkDrag, CdkDropList, CdkDragHandle,
    NzStepsModule, NzFormModule, NzInputModule, NzInputNumberModule,
    NzSelectModule, NzButtonModule, NzTagModule, NzDividerModule,
    NzAlertModule, NzColorPickerModule,
    NzIconModule, NzTooltipModule, NzSpinModule, NzSwitchModule, NzTabsModule,
  ],
  template: `
<div class="builder">

  <nz-steps [nzCurrent]="step" nzSize="small" class="steps">
    <nz-step nzTitle="Définition"  nzDescription="Nom et événements"></nz-step>
    <nz-step nzTitle="Contexte"    nzDescription="Contexte et visualisations"></nz-step>
    <nz-step nzTitle="Formules"    nzDescription="Pipeline par visualisation"></nz-step>
  </nz-steps>

  <div class="indicator-header" *ngIf="def.name">
    {{ isEditMode ? 'Édition : ' : 'Nouvel indicateur : ' }}{{ def.name }}
    <span *ngIf="familyProgress"> — {{ familyProgress }}</span>
  </div>

  <nz-divider></nz-divider>

  <!-- ── ÉTAPE 1 ─────────────────────────────────────────────────────── -->
  <div *ngIf="step === 0" class="step-content">
    <nz-form-item>
      <nz-form-label [nzRequired]="true">Nom de l'indicateur</nz-form-label>
      <nz-form-control>
        <input nz-input [(ngModel)]="def.name" placeholder="ex: Tentatives avant réussite" />
      </nz-form-control>
    </nz-form-item>
    <nz-form-item>
      <nz-form-label>Description</nz-form-label>
      <nz-form-control>
        <textarea nz-input [(ngModel)]="def.description" rows="3"
          placeholder="Décrivez ce que mesure cet indicateur…"></textarea>
      </nz-form-control>
    </nz-form-item>
    <nz-form-item>
      <nz-form-label [nzRequired]="true">Événements déclencheurs</nz-form-label>
      <nz-form-control>
        <nz-select [(ngModel)]="def.requiredEvents" nzMode="tags"
          nzPlaceHolder="ex: exercise.answered" style="width:100%">
          <nz-option nzValue="exercise.answered"  nzLabel="exercise.answered"></nz-option>
          <nz-option nzValue="exercise.viewed"    nzLabel="exercise.viewed"></nz-option>
          <nz-option nzValue="activity.completed" nzLabel="activity.completed"></nz-option>
          <nz-option nzValue="activity.started"   nzLabel="activity.started"></nz-option>
        </nz-select>
      </nz-form-control>
    </nz-form-item>
  </div>

  <!-- ── ÉTAPE 2 ─────────────────────────────────────────────────────── -->
  <div *ngIf="step === 1" class="step-content">

    <nz-form-item>
      <nz-form-label [nzRequired]="true">Contexte</nz-form-label>
      <nz-form-control>
        <nz-select [(ngModel)]="def.contextType" style="width:100%">
          <nz-option nzValue="learner"  nzLabel="Apprenant (learner)"></nz-option>
          <nz-option nzValue="group"    nzLabel="Groupe de TP (group)"></nz-option>
          <nz-option nzValue="activity" nzLabel="Activité (activity)"></nz-option>
          <nz-option nzValue="course"   nzLabel="Cours (course)"></nz-option>
          <nz-option nzValue="teacher"  nzLabel="Enseignant (teacher)"></nz-option>
          <nz-option nzValue="admin"    nzLabel="Admin"></nz-option>
        </nz-select>
      </nz-form-control>
    </nz-form-item>

    <nz-divider nzText="Visualisations"></nz-divider>

    <div class="viz-list">
      <div *ngFor="let v of vizList; let i = index" class="viz-row-card">

        <div class="viz-row-header">
          <span class="viz-index">{{ i + 1 }}</span>
          <input nz-input [(ngModel)]="v.label" placeholder="Libellé de l'onglet"
            class="viz-label-input" />
          <button nz-button nzType="text" nzDanger nzSize="small"
            nz-tooltip="Supprimer" [disabled]="vizList.length <= 1"
            (click)="removeViz(i)">
            <span nz-icon nzType="delete"></span>
          </button>
        </div>

        <div class="viz-fields">
          <nz-form-item style="margin:0;flex:2">
            <nz-form-label>Type</nz-form-label>
            <nz-form-control>
              <nz-select [(ngModel)]="v.type" style="width:100%" (ngModelChange)="onVizTypeChange(v)">
                <nz-option nzValue="card"       nzLabel="Carte (valeur scalaire)"></nz-option>
                <nz-option nzValue="gauge"      nzLabel="Jauge"></nz-option>
                <nz-option nzValue="bar-chart"  nzLabel="Barres horizontales"></nz-option>
                <nz-option nzValue="histogram"  nzLabel="Histogramme"></nz-option>
                <nz-option nzValue="line-chart" nzLabel="Graphique ligne"></nz-option>
              </nz-select>
            </nz-form-control>
          </nz-form-item>
          <nz-form-item style="margin:0;flex:1">
            <nz-form-label>Icône</nz-form-label>
            <nz-form-control>
              <nz-select [(ngModel)]="v.icon" style="width:100%">
                <nz-option *ngFor="let ic of availableIcons" [nzValue]="ic" [nzLabel]="ic"></nz-option>
              </nz-select>
            </nz-form-control>
          </nz-form-item>
          <nz-form-item style="margin:0">
            <nz-form-label>Couleur</nz-form-label>
            <nz-form-control>
              <nz-color-picker [(ngModel)]="v.color" [nzFormat]="'hex'"></nz-color-picker>
            </nz-form-control>
          </nz-form-item>
          <nz-form-item style="margin:0;flex:1">
            <nz-form-label>Unité</nz-form-label>
            <nz-form-control>
              <input nz-input [(ngModel)]="v.unit" placeholder="tentatives, %, …" />
            </nz-form-control>
          </nz-form-item>
        </div>

        <div class="threshold-row" *ngIf="v.type === 'card' || v.type === 'gauge'">
          <small>Seuils :</small>
          <nz-form-item style="margin:0">
            <nz-form-label><span class="dot dot-green"></span> Bon ≤</nz-form-label>
            <nz-form-control>
              <nz-input-number [(ngModel)]="v.thresholds.good" [nzMin]="0" nzSize="small" style="width:80px"></nz-input-number>
            </nz-form-control>
          </nz-form-item>
          <nz-form-item style="margin:0">
            <nz-form-label><span class="dot dot-orange"></span> Moyen ≤</nz-form-label>
            <nz-form-control>
              <nz-input-number [(ngModel)]="v.thresholds.warning" [nzMin]="0" nzSize="small" style="width:80px"></nz-input-number>
            </nz-form-control>
          </nz-form-item>
          <nz-form-item style="margin:0">
            <nz-form-label><span class="dot dot-red"></span> Critique &gt;</nz-form-label>
            <nz-form-control>
              <nz-input-number [(ngModel)]="v.thresholds.danger" [nzMin]="0" nzSize="small" style="width:80px"></nz-input-number>
            </nz-form-control>
          </nz-form-item>
        </div>
      </div>

      <button nz-button nzType="dashed" style="width:100%;margin-top:8px" (click)="addViz()">
        <span nz-icon nzType="plus"></span> Ajouter une visualisation
      </button>
    </div>
  </div>

  <!-- ── ÉTAPE 3 ─────────────────────────────────────────────────────── -->
  <div *ngIf="step === 2" class="step-content">

    <nz-alert nzType="info" nzShowIcon style="margin-bottom:12px"
      nzMessage="Chaque visualisation possède sa propre formule. Éditez-les via les onglets.">
    </nz-alert>

    <nz-tabs [(nzSelectedIndex)]="activeVizIndex">
      <nz-tab *ngFor="let v of vizList; let i = index" [nzTitle]="v.label || ('Vue ' + (i+1))">
        <ng-template nz-tab>

          <!-- Recettes -->
          <div class="recipes">
            <button *ngFor="let r of recipes" nz-button nzType="dashed"
              class="recipe-btn" (click)="applyRecipe(r, v)">
              <strong>{{ r.name }}</strong>
              <span>{{ r.desc }}</span>
            </button>
          </div>

          <!-- Toggle Visuel / JSON -->
          <div class="mode-toggle">
            <button nz-button nzSize="small"
              [nzType]="activeJsonVizId !== v.id ? 'primary' : 'default'"
              (click)="leaveJsonMode(v)">
              <span nz-icon nzType="eye"></span> Visuel
            </button>
            <button nz-button nzSize="small"
              [nzType]="activeJsonVizId === v.id ? 'primary' : 'default'"
              (click)="enterJsonMode(v)">
              <span nz-icon nzType="code"></span> JSON
            </button>
          </div>

          <!-- JSON -->
          <ng-container *ngIf="activeJsonVizId === v.id">
            <textarea class="json-editor" [(ngModel)]="jsonText" rows="18" spellcheck="false"></textarea>
            <div *ngIf="jsonError" class="json-error">{{ jsonError }}</div>
          </ng-container>

          <!-- Visuel -->
          <ng-container *ngIf="activeJsonVizId !== v.id">
            <div class="pipeline" cdkDropList (cdkDropListDropped)="drop($event, v)">

              <div *ngIf="v.pipeline.length === 0" class="pipeline-empty">
                Aucune étape — choisissez une recette ou ajoutez manuellement.
              </div>

              <div *ngFor="let s of v.pipeline; let si = index"
                class="step-card" cdkDrag
                [style.border-left-color]="getStepMeta(s.type).color">

                <div class="drag-handle" cdkDragHandle nz-tooltip="Glisser pour réordonner">
                  <span nz-icon nzType="holder"></span>
                </div>
                <div *cdkDragPlaceholder class="drag-placeholder"></div>

                <div class="step-body">
                  <div class="step-header">
                    <nz-tag [nzColor]="getStepMeta(s.type).color">
                      <span nz-icon [nzType]="getStepMeta(s.type).icon"></span>
                      {{ getStepMeta(s.type).label }}
                    </nz-tag>
                    <input nz-input [(ngModel)]="s.label" placeholder="Nom de l'étape"
                      class="step-label-input" size="28" />
                    <button nz-button nzType="text" nzDanger nzSize="small"
                      (click)="removeStep(v, si)">
                      <span nz-icon nzType="delete"></span>
                    </button>
                  </div>

                  <div class="step-params">
                    <ng-container *ngIf="s.type === 'fetch'">
                      <div class="param-row">
                        <label>Table</label>
                        <nz-select [(ngModel)]="s.table" style="width:220px"
                          nzPlaceHolder="Choisir une table" [nzLoading]="schemaLoading"
                          (ngModelChange)="s.contextFields = []">
                          <nz-option *ngFor="let t of platonSchema" [nzValue]="t.name" [nzLabel]="t.name"></nz-option>
                        </nz-select>
                      </div>
                      <div class="param-row">
                        <label>Requête groupe de TP</label>
                        <nz-switch [(ngModel)]="s.useGroupContext"
                          nzCheckedChildren="Groupe" nzUnCheckedChildren="Non"></nz-switch>
                      </div>
                      <div class="param-row">
                        <label>Filtrer par contexte</label>
                        <nz-select [(ngModel)]="s.contextFields" nzMode="multiple" style="width:300px"
                          nzPlaceHolder="Colonnes de filtre" [nzDisabled]="!s.table">
                          <nz-option *ngFor="let f of columnsForTable(s.table)" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                        </nz-select>
                      </div>
                    </ng-container>
                    <ng-container *ngIf="s.type === 'filter'">
                      <div class="param-row">
                        <label>Champ</label>
                        <nz-select [(ngModel)]="s.filterField" style="width:180px">
                          <nz-option *ngFor="let f of activeColumnsForViz(v)" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                        </nz-select>
                      </div>
                      <div class="param-row">
                        <label>Opérateur</label>
                        <nz-select [(ngModel)]="s.filterOperator" style="width:120px">
                          <nz-option nzValue="==" nzLabel="=="></nz-option>
                          <nz-option nzValue="!=" nzLabel="!="></nz-option>
                          <nz-option nzValue=">"  nzLabel=">"></nz-option>
                          <nz-option nzValue="<"  nzLabel="<"></nz-option>
                          <nz-option nzValue=">=" nzLabel=">="></nz-option>
                          <nz-option nzValue="<=" nzLabel="<="></nz-option>
                        </nz-select>
                      </div>
                      <div class="param-row">
                        <label>Valeur</label>
                        <input nz-input [(ngModel)]="s.filterValue" style="width:120px" />
                      </div>
                    </ng-container>
                    <ng-container *ngIf="s.type === 'groupBy'">
                      <div class="param-row">
                        <label>Grouper par</label>
                        <nz-select [(ngModel)]="s.groupField" style="width:200px">
                          <nz-option *ngFor="let f of activeColumnsForViz(v)" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                        </nz-select>
                      </div>
                    </ng-container>
                    <ng-container *ngIf="s.type === 'findFirst'">
                      <div class="param-row">
                        <label>Condition (champ)</label>
                        <nz-select [(ngModel)]="s.whereField" nzAllowClear style="width:180px">
                          <nz-option *ngFor="let f of activeColumnsForViz(v)" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                        </nz-select>
                      </div>
                      <div class="param-row" *ngIf="s.whereField">
                        <label>Valeur attendue</label>
                        <input nz-input [(ngModel)]="s.whereValue" style="width:120px" />
                      </div>
                      <div class="param-row">
                        <label>Trier par</label>
                        <nz-select [(ngModel)]="s.sortField" nzAllowClear style="width:180px">
                          <nz-option *ngFor="let f of activeColumnsForViz(v)" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                        </nz-select>
                      </div>
                    </ng-container>
                    <ng-container *ngIf="s.type === 'extract'">
                      <div class="param-row">
                        <label>Champ à extraire</label>
                        <nz-select [(ngModel)]="s.extractField" style="width:200px">
                          <nz-option *ngFor="let f of activeColumnsForViz(v)" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                        </nz-select>
                      </div>
                    </ng-container>
                    <ng-container *ngIf="s.type === 'aggregate'">
                      <div class="param-row">
                        <label>Fonction</label>
                        <nz-select [(ngModel)]="s.aggregateFn" style="width:200px">
                          <nz-option nzValue="avg"   nzLabel="avg — Moyenne"></nz-option>
                          <nz-option nzValue="sum"   nzLabel="sum — Somme"></nz-option>
                          <nz-option nzValue="count" nzLabel="count — Nombre"></nz-option>
                          <nz-option nzValue="min"   nzLabel="min — Minimum"></nz-option>
                          <nz-option nzValue="max"   nzLabel="max — Maximum"></nz-option>
                        </nz-select>
                      </div>
                    </ng-container>
                    <ng-container *ngIf="s.type === 'round'">
                      <div class="param-row">
                        <label>Décimales</label>
                        <nz-input-number [(ngModel)]="s.decimals" [nzMin]="0" [nzMax]="6" style="width:100px"></nz-input-number>
                      </div>
                    </ng-container>
                    <ng-container *ngIf="s.type === 'divide'">
                      <div class="param-row">
                        <label>Diviser par</label>
                        <nz-input-number [(ngModel)]="s.divideBy" [nzMin]="0.001" style="width:140px"></nz-input-number>
                      </div>
                    </ng-container>
                    <ng-container *ngIf="s.type === 'js'">
                      <div class="param-row param-row-col">
                        <label>Code JavaScript (input = sortie précédente)</label>
                        <textarea nz-input [(ngModel)]="s.jsCode" rows="6" class="code-textarea"
                          placeholder="// return Array.isArray(input) ? input.length : 0;"></textarea>
                      </div>
                    </ng-container>
                  </div>
                </div>
              </div>

              <div *ngIf="v.pipeline.length > 0" class="connector">
                <span nz-icon nzType="arrow-down" style="color:#999"></span>
              </div>

              <div class="add-step-row">
                <button nz-button nzType="dashed" style="width:100%" (click)="openPicker(v)">
                  <span nz-icon nzType="plus"></span> Ajouter une étape
                </button>
              </div>
            </div>

            <!-- Preview -->
            <nz-divider nzText="Tester cette formule"></nz-divider>
            <div class="preview-section">
              <div class="preview-inputs">
                <nz-select
                  [(ngModel)]="previewCourseId"
                  (ngModelChange)="onPreviewCourseChange($event)"
                  nzPlaceHolder="Cours"
                  nzShowSearch
                  [nzLoading]="previewCoursesLoading"
                  style="width:220px">
                  <nz-option *ngFor="let c of previewCourses" [nzValue]="c.id" [nzLabel]="c.name"></nz-option>
                </nz-select>

                <nz-select *ngIf="def.contextType === 'group'"
                  [(ngModel)]="previewCtx.groupId"
                  nzPlaceHolder="Groupe"
                  nzShowSearch
                  [nzDisabled]="!previewCourseId"
                  style="width:220px">
                  <nz-option *ngFor="let g of previewGroups" [nzValue]="g.id" [nzLabel]="g.name"></nz-option>
                </nz-select>

                <nz-select *ngIf="def.contextType === 'activity'"
                  [(ngModel)]="previewCtx.activityId"
                  nzPlaceHolder="Activité"
                  nzShowSearch
                  [nzLoading]="previewActivitiesLoading"
                  [nzDisabled]="!previewCourseId"
                  style="width:240px">
                  <nz-option *ngFor="let a of previewActivities" [nzValue]="a.id" [nzLabel]="a.name"></nz-option>
                </nz-select>

                <nz-select *ngIf="def.contextType === 'learner' || def.contextType === 'teacher' || def.contextType === 'admin'"
                  [(ngModel)]="previewCtx.userId"
                  nzPlaceHolder="Utilisateur"
                  nzShowSearch
                  [nzLoading]="previewStudentsLoading"
                  [nzDisabled]="!previewCourseId"
                  style="width:240px">
                  <nz-option *ngFor="let s of previewStudents" [nzValue]="s.id" [nzLabel]="s.name"></nz-option>
                </nz-select>

                <button nz-button nzType="primary" [nzLoading]="previewing" (click)="runPreview(v)">
                  <span nz-icon nzType="experiment"></span> Tester
                </button>
              </div>
              <div *ngIf="previewResults[v.id] !== undefined" class="preview-result">
                Résultat : <strong>{{ previewResults[v.id] }}</strong>
              </div>
              <div *ngIf="previewErrors[v.id]" class="preview-error">{{ previewErrors[v.id] }}</div>
            </div>
          </ng-container>

        </ng-template>
      </nz-tab>
    </nz-tabs>
  </div>

  <!-- ── Overlay sélection d'étape ──────────────────────────────────── -->
  <div *ngIf="stepPickerViz" class="picker-overlay" (click)="stepPickerViz = null">
    <div class="picker-panel" (click)="$event.stopPropagation()">
      <div class="picker-header">
        <strong>Choisir une étape</strong>
        <button nz-button nzType="text" nzSize="small" (click)="stepPickerViz = null">✕</button>
      </div>
      <div class="step-picker">
        <div *ngFor="let meta of stepCatalog" class="step-picker-item" (click)="addStep(stepPickerViz!, meta.type)">
          <nz-tag [nzColor]="meta.color" style="margin:0">
            <span nz-icon [nzType]="meta.icon"></span>
          </nz-tag>
          <div class="step-picker-text">
            <strong>{{ meta.label }}</strong>
            <span>{{ meta.desc }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Navigation ─────────────────────────────────────────────────── -->
  <nz-divider></nz-divider>
  <div class="nav-actions">
    <button nz-button (click)="cancel()">Annuler</button>
    <div class="nav-right">
      <button nz-button *ngIf="step > 0" (click)="step = step - 1">
        <span nz-icon nzType="left"></span> Précédent
      </button>
      <button nz-button nzType="primary" *ngIf="step < 2" (click)="nextStep()" [disabled]="!canProceed()">
        Suivant <span nz-icon nzType="right"></span>
      </button>
      <button nz-button nzType="primary" *ngIf="step === 2"
        [nzLoading]="saving" (click)="submit()">
        <span nz-icon nzType="save"></span>
        {{ isEditMode ? 'Enregistrer' : "Créer l'indicateur" }}
      </button>
    </div>
  </div>

</div>
  `,
  styles: [`
    .builder { padding: 4px 0; }
    .steps { margin-bottom: 8px; }
    .indicator-header {
      margin-top: 8px; padding: 6px 12px; border-radius: 4px;
      background: #f0f5ff; color: #2f54eb; font-weight: 500; font-size: 13px;
    }
    .step-content { min-height: 280px; }
    nz-form-label { width: 160px; }
    nz-form-item  { margin-bottom: 14px; }

    .viz-list { display: flex; flex-direction: column; gap: 12px; }
    .viz-row-card { border: 1px solid #e8e8e8; border-radius: 8px; padding: 12px 16px; background: #fafafa; }
    .viz-row-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .viz-index {
      width: 24px; height: 24px; border-radius: 50%; background: #1890ff; color: white;
      display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0;
    }
    .viz-label-input { flex: 1; }
    .viz-fields { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }

    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; }
    .dot-green  { background: #52c41a; }
    .dot-orange { background: #fa8c16; }
    .dot-red    { background: #ff4d4f; }
    .threshold-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .threshold-row small { color: #666; }

    .recipes { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
    .recipe-btn { display: flex; flex-direction: column; align-items: flex-start; height: auto; padding: 6px 12px; }
    .recipe-btn strong { font-size: 13px; }
    .recipe-btn span   { font-size: 11px; color: #888; }

    .mode-toggle { display: flex; gap: 4px; margin-bottom: 10px; justify-content: flex-end; }

    .json-editor {
      width: 100%; font-family: monospace; font-size: 12px;
      border-radius: 6px; background: #1e1e1e; color: #d4d4d4;
      border: 1px solid #333; padding: 12px; resize: vertical;
    }
    .json-error { color: #ff4d4f; font-size: 12px; margin-top: 6px; }

    .pipeline { display: flex; flex-direction: column; }
    .pipeline-empty { text-align: center; color: #aaa; padding: 24px; border: 1px dashed #d9d9d9; border-radius: 8px; }

    .step-card {
      border: 1px solid #e8e8e8; border-left: 4px solid #1890ff;
      border-radius: 8px; background: #fafafa; margin-bottom: 0;
      display: flex; gap: 8px; align-items: flex-start; padding: 10px 14px;
    }
    .step-body { flex: 1; }
    .drag-handle { cursor: grab; color: #ccc; padding-top: 2px; }
    .drag-handle:hover { color: #888; }
    .drag-placeholder { background: #e6f7ff; border: 2px dashed #1890ff; border-radius: 8px; height: 56px; }
    .cdk-drag-animating { transition: transform 250ms cubic-bezier(0,0,.2,1); }

    .step-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .step-label-input { flex: 1; font-size: 13px; }
    .step-params { display: flex; flex-direction: column; gap: 6px; }
    .param-row { display: flex; align-items: center; gap: 10px; }
    .param-row-col { flex-direction: column; align-items: flex-start; }
    .param-row label { width: 160px; font-size: 12px; color: #666; flex-shrink: 0; }
    .param-row-col label { width: auto; }
    .code-textarea { width: 100%; font-family: monospace; font-size: 12px; }

    .connector { text-align: center; padding: 3px 0; }
    .add-step-row { margin-top: 6px; }

    .picker-overlay {
      position: fixed; inset: 0; z-index: 1100;
      background: rgba(0,0,0,.25); display: flex; align-items: center; justify-content: center;
    }
    .picker-panel { background: white; border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,.18); padding: 16px 20px; width: 380px; max-height: 70vh; overflow-y: auto; }
    .picker-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .step-picker { display: flex; flex-direction: column; gap: 4px; }
    .step-picker-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px; border-radius: 6px; cursor: pointer; }
    .step-picker-item:hover { background: #f0f5ff; }
    .step-picker-text { display: flex; flex-direction: column; }
    .step-picker-text strong { font-size: 13px; }
    .step-picker-text span   { font-size: 11px; color: #888; }

    .preview-section { display: flex; flex-direction: column; gap: 10px; }
    .preview-inputs  { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .preview-result  { font-size: 15px; padding: 8px 14px; background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 8px; }
    .preview-error   { color: #ff4d4f; font-size: 13px; }

    .nav-actions { display: flex; justify-content: space-between; }
    .nav-right   { display: flex; gap: 8px; }
  `],
})
export class IndicatorBuilderComponent implements OnInit {
  private readonly modalRef     = inject(NzModalRef);
  private readonly modalData    = inject(NZ_MODAL_DATA, { optional: true }) as {
    indicator?: IndicatorDefinition;
    familyPreset?: IndicatorFamilyPreset;
    familyQueue?: IndicatorScope[];
  } | null;
  private readonly indicatorSvc = inject(IndicatorService);
  private readonly messageSvc   = inject(NzMessageService);
  private readonly cdr          = inject(ChangeDetectorRef);

  get isEditMode(): boolean { return !!this.modalData?.indicator; }

  /** Texte de progression affiché dans le header quand ce builder fait partie d'une famille. */
  get familyProgress(): string | null {
    const preset = this.modalData?.familyPreset;
    if (!preset) return null;
    const remaining = this.modalData?.familyQueue?.length ?? 0;
    const total = remaining + 1;
    const current = total - remaining;
    return `Famille « ${preset.familyName} » — contexte ${current}/${total} (${CONTEXT_LABELS[preset.contextType]})`;
  }

  step = 0;
  saving = false;
  activeVizIndex = 0;

  // JSON mode: on garde le vizId actif + le texte JSON
  activeJsonVizId: string | null = null;
  jsonText = '';
  jsonError = '';

  // Picker d'étape
  stepPickerViz: FlatViz | null = null;

  // Preview par viz
  previewing = false;
  previewResults: Record<string, string> = {};
  previewErrors: Record<string, string> = {};
  previewCtx = {
    userId:     (environment as any).defaultUserId || '',
    groupId:    '',
    activityId: '',
  };

  // Label-picker du panneau de test : sélection en cascade Cours → Groupe/Activité/Utilisateur
  previewCourseId: string | null = null;
  previewCourses: TeacherCourse[] = [];
  previewCoursesLoading = false;
  previewActivities: CourseActivity[] = [];
  previewActivitiesLoading = false;
  previewStudents: { id: string; name: string }[] = [];
  previewStudentsLoading = false;

  get previewGroups(): { id: string; name: string }[] {
    return this.previewCourses.find(c => c.id === this.previewCourseId)?.groups ?? [];
  }

  readonly stepCatalog = STEP_CATALOG;
  readonly recipes     = FORMULA_RECIPES;
  readonly availableIcons = [
    'trending_up', 'trending_down', 'star', 'repeat', 'check_circle',
    'access_time', 'analytics', 'speed', 'emoji_events', 'school',
    'quiz', 'assignment', 'bar_chart', 'show_chart', 'timeline', 'groups', 'leaderboard',
  ];

  platonSchema: PlatonTable[] = [];
  schemaLoading = false;

  // ── Modèle du formulaire ─────────────────────────────────────────────────

  def: {
    name: string;
    description: string;
    requiredEvents: string[];
    contextType: IndicatorScope;
  } = { name: '', description: '', requiredEvents: [], contextType: 'learner' };

  vizList: FlatViz[] = [this.newViz('Vue principale', 'card')];

  // ── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.schemaLoading = true;
    this.indicatorSvc.getPlatonSchema().subscribe({
      next: s  => { this.platonSchema = s; this.schemaLoading = false; this.cdr.detectChanges(); },
      error: () => { this.schemaLoading = false; },
    });
    if (this.modalData?.indicator) this.hydrate(this.modalData.indicator);
    else if (this.modalData?.familyPreset) this.applyFamilyPreset(this.modalData.familyPreset);

    this.previewCoursesLoading = true;
    this.indicatorSvc.getTeacherContext(environment.defaultUserId).subscribe({
      next: courses => { this.previewCourses = courses; this.previewCoursesLoading = false; this.cdr.detectChanges(); },
      error: () => { this.previewCoursesLoading = false; },
    });
  }

  // ── Label-picker du panneau de test ──────────────────────────────────────

  onPreviewCourseChange(courseId: string | null): void {
    this.previewCtx.groupId = '';
    this.previewCtx.activityId = '';
    this.previewActivities = [];
    this.previewStudents = [];
    if (!courseId) return;

    if (this.def.contextType === 'activity') {
      this.previewActivitiesLoading = true;
      this.indicatorSvc.getCourseActivities(courseId).subscribe({
        next: activities => { this.previewActivities = activities; this.previewActivitiesLoading = false; this.cdr.detectChanges(); },
        error: () => { this.previewActivitiesLoading = false; },
      });
    }

    if (this.def.contextType === 'learner' || this.def.contextType === 'teacher' || this.def.contextType === 'admin') {
      this.previewStudentsLoading = true;
      this.indicatorSvc.getCourseStudents(courseId).subscribe({
        next: students => { this.previewStudents = students; this.previewStudentsLoading = false; this.cdr.detectChanges(); },
        error: () => { this.previewStudentsLoading = false; },
      });
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  canProceed(): boolean {
    if (this.step === 0) return !!this.def.name.trim() && this.def.requiredEvents.length > 0;
    if (this.step === 1) return !!this.def.contextType && this.vizList.length > 0;
    return true;
  }

  nextStep(): void { if (this.canProceed()) this.step++; }

  // ── Gestion des visualisations ───────────────────────────────────────────

  private newViz(label: string, type: ViewVisualizationType): FlatViz {
    return {
      id: crypto.randomUUID(), label, type,
      icon: 'analytics', color: '#722ed1', unit: '',
      thresholds: { good: 1, warning: 3, danger: 5 },
      pipeline: [],
    };
  }

  addViz(): void {
    const types: ViewVisualizationType[] = ['card', 'bar-chart', 'histogram', 'gauge', 'line-chart'];
    const labels: Record<ViewVisualizationType, string> = {
      card: 'Vue carte', gauge: 'Jauge',
      'bar-chart': 'Barres', histogram: 'Histogramme', 'line-chart': 'Graphique ligne',
    };
    const usedTypes = new Set(this.vizList.map(v => v.type));
    const nextType = types.find(t => !usedTypes.has(t)) ?? 'card';
    this.vizList.push(this.newViz(labels[nextType], nextType));
    this.activeVizIndex = this.vizList.length - 1;
  }

  removeViz(i: number): void {
    if (this.vizList.length <= 1) return;
    this.vizList.splice(i, 1);
    this.activeVizIndex = Math.min(this.activeVizIndex, this.vizList.length - 1);
  }

  onVizTypeChange(v: FlatViz): void {
    if (v.type !== 'card' && v.type !== 'gauge') {
      v.thresholds = { good: 0, warning: 0, danger: 0 };
    }
  }

  // ── Pipeline ─────────────────────────────────────────────────────────────

  getStepMeta(type: StepType) {
    return STEP_CATALOG.find(s => s.type === type) ?? STEP_CATALOG[0];
  }

  openPicker(v: FlatViz): void { this.stepPickerViz = v; }

  addStep(v: FlatViz, type: StepType): void {
    const meta = this.getStepMeta(type);
    v.pipeline.push({
      id: crypto.randomUUID(), type, label: meta.label,
      table:           type === 'fetch'     ? 'SessionData' : undefined,
      contextFields:   type === 'fetch'     ? ['user_id', 'activity_id'] : undefined,
      filterOperator:  type === 'filter'    ? '==' : undefined,
      aggregateFn:     type === 'aggregate' ? 'avg' : undefined,
      decimals:        type === 'round'     ? 2 : undefined,
      divideBy:        type === 'divide'    ? 100 : undefined,
      jsCode:          type === 'js'        ? '// input : sortie de l\'étape précédente\nreturn 0;' : undefined,
    });
    this.stepPickerViz = null;
  }

  removeStep(v: FlatViz, i: number): void { v.pipeline.splice(i, 1); }

  applyRecipe(r: (typeof FORMULA_RECIPES)[0], v: FlatViz): void {
    v.pipeline = r.pipeline.map(s => ({ ...s, id: crypto.randomUUID() })) as PipelineStep[];
  }

  drop(event: CdkDragDrop<PipelineStep[]>, v: FlatViz): void {
    moveItemInArray(v.pipeline, event.previousIndex, event.currentIndex);
  }

  activeColumnsForViz(v: FlatViz): { value: string; label: string }[] {
    const fetch = v.pipeline.find(s => s.type === 'fetch');
    return this.columnsForTable(fetch?.table);
  }

  columnsForTable(name: string | undefined): { value: string; label: string }[] {
    if (!name) return [];
    const map: Record<string, string> = { sessions: 'SessionData', activities: 'Activities' };
    const resolved = map[name] ?? name;
    return this.platonSchema.find(t => t.name === resolved)?.columns.map(c => ({ value: c.name, label: c.name })) ?? [];
  }

  // ── JSON mode ────────────────────────────────────────────────────────────

  enterJsonMode(v: FlatViz): void {
    this.jsonError = '';
    this.jsonText = JSON.stringify(
      v.pipeline.map(s => ({ id: s.id, type: s.type, label: s.label, params: this.extractParams(s) })),
      null, 2,
    );
    this.activeJsonVizId = v.id;
  }

  leaveJsonMode(v: FlatViz): void {
    if (this.activeJsonVizId !== v.id) return;
    this.jsonError = '';
    try {
      const parsed: any[] = JSON.parse(this.jsonText);
      if (!Array.isArray(parsed)) throw new Error('Doit être un tableau');
      v.pipeline = parsed.map(s => this.dehydrateStep(s));
      this.activeJsonVizId = null;
    } catch (e: any) {
      this.jsonError = `JSON invalide : ${e.message}`;
    }
  }

  // ── Preview ──────────────────────────────────────────────────────────────

  runPreview(v: FlatViz): void {
    this.previewing = true;
    this.previewResults = { ...this.previewResults, [v.id]: '' };
    this.previewErrors  = { ...this.previewErrors,  [v.id]: '' };

    this.indicatorSvc.previewFormulaRaw(this.buildFormulaForViz(v), {
      userId:     this.previewCtx.userId     || undefined,
      groupId:    this.previewCtx.groupId    || undefined,
      activityId: this.previewCtx.activityId || undefined,
    }).subscribe({
      next: ({ result }) => {
        this.previewResults[v.id] = typeof result === 'number' ? String(result) : JSON.stringify(result, null, 2);
        this.previewing = false;
        this.cdr.detectChanges();
      },
      error: err => {
        this.previewErrors[v.id] = err?.error?.message ?? 'Erreur lors du test';
        this.previewing = false;
        this.cdr.detectChanges();
      },
    });
  }

  // ── Soumission ───────────────────────────────────────────────────────────

  submit(): void {
    // Valider les modes JSON ouverts
    for (const v of this.vizList) {
      if (this.activeJsonVizId === v.id) {
        this.leaveJsonMode(v);
        if (this.jsonError) return;
      }
    }

    if (!this.def.name.trim()) { this.messageSvc.error('Le nom est requis'); return; }

    this.saving = true;

    const payload = {
      name: this.def.name.trim(),
      description: this.def.description.trim(),
      contextType: this.def.contextType,
      requiredEvents: this.def.requiredEvents,
      // En édition normale (hors wizard famille), on conserve le familyName existant de l'indicateur
      // pour ne pas l'effacer accidentellement à chaque sauvegarde.
      familyName: this.modalData?.familyPreset?.familyName
        ?? this.modalData?.indicator?.familyName
        ?? null,
      formula: null,
      visualizations: this.vizList.map(v => ({
        id: v.id,
        label: v.label,
        type: v.type,
        icon: v.icon,
        color: v.color,
        unit: v.unit,
        thresholds: v.thresholds,
        formula: this.buildFormulaForViz(v),
      })),
      isActive: true,
    };

    const save$ = this.isEditMode
      ? this.indicatorSvc.updateIndicator(this.modalData!.indicator!.id, payload)
      : this.indicatorSvc.createIndicator(payload as any);

    save$.subscribe({
      next: () => {
        this.messageSvc.success(
          this.isEditMode ? `Indicateur mis à jour` : `Indicateur "${payload.name}" créé`,
        );
        this.modalRef.close(true);
      },
      error: err => {
        this.messageSvc.error(err?.error?.message ?? 'Erreur lors de la sauvegarde');
        this.saving = false;
      },
    });
  }

  cancel(): void { this.modalRef.close(false); }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private buildFormulaForViz(v: FlatViz) {
    return {
      version: '1.0',
      pipeline: v.pipeline.map(s => ({ id: s.id, type: s.type, label: s.label, params: this.extractParams(s) })),
    };
  }

  private extractParams(s: PipelineStep): Record<string, any> {
    switch (s.type) {
      case 'fetch': {
        // On retire 'group_id' de la sélection brute puis on le réinjecte uniquement si le switch est actif,
        // sinon désactiver le switch après l'avoir activé une fois ne le retirait jamais de contextFields.
        const fields = (s.contextFields ?? []).filter((f: string) => f !== 'group_id');
        if (s.useGroupContext) fields.unshift('group_id');
        return { table: s.table, contextFields: fields };
      }
      case 'filter':    return { field: s.filterField, operator: s.filterOperator, value: s.filterValue };
      case 'groupBy':   return { groupField: s.groupField };
      case 'findFirst': return { whereField: s.whereField, whereValue: s.whereValue, sortField: s.sortField };
      case 'extract':   return { extractField: s.extractField };
      case 'aggregate': return { aggregateFn: s.aggregateFn };
      case 'round':     return { decimals: s.decimals };
      case 'divide':    return { divideBy: s.divideBy };
      case 'js':        return { code: s.jsCode };
      default:          return {};
    }
  }

  private dehydrateStep(s: any): PipelineStep {
    return {
      id:              s.id ?? crypto.randomUUID(),
      type:            s.type,
      label:           s.label ?? s.type,
      table:           s.params?.table,
      contextFields:   s.params?.contextFields,
      useGroupContext: s.params?.contextFields?.includes('group_id'),
      filterField:     s.params?.field,
      filterOperator:  s.params?.operator,
      filterValue:     s.params?.value,
      groupField:      s.params?.groupField,
      whereField:      s.params?.whereField,
      whereValue:      s.params?.whereValue,
      sortField:       s.params?.sortField,
      extractField:    s.params?.extractField,
      aggregateFn:     s.params?.aggregateFn,
      decimals:        s.params?.decimals,
      divideBy:        s.params?.divideBy,
      jsCode:          s.params?.code,
    };
  }

  /** Pré-remplit le formulaire à partir des données partagées d'une famille en cours de création. */
  private applyFamilyPreset(preset: IndicatorFamilyPreset): void {
    this.def.name           = preset.name;
    this.def.description    = preset.description;
    this.def.requiredEvents = [...preset.requiredEvents];
    this.def.contextType    = preset.contextType;
  }

  private hydrate(ind: IndicatorDefinition): void {
    this.def.name           = ind.name;
    this.def.description    = ind.description || '';
    this.def.requiredEvents = ind.requiredEvents || [];
    this.def.contextType    = ind.contextType ?? 'learner';

    const vizs = ind.visualizations ?? [];
    this.vizList = vizs.length > 0
      ? vizs.map(v => ({
          id:         v.id ?? crypto.randomUUID(),
          label:      v.label ?? 'Vue',
          type:       v.type ?? 'card',
          icon:       v.icon ?? 'analytics',
          color:      v.color ?? '#722ed1',
          unit:       v.unit ?? '',
          thresholds: v.thresholds ? { ...v.thresholds } : { good: 1, warning: 3, danger: 5 },
          pipeline:   (v.formula?.pipeline ?? (ind as any).formula?.pipeline ?? []).map((s: any) => this.dehydrateStep(s)),
        }))
      : [this.newViz('Vue principale', 'card')];
  }
}
