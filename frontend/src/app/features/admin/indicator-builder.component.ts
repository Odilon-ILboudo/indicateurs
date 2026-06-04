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
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzColorPickerModule } from 'ng-zorro-antd/color-picker';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { IndicatorService } from '../../core/services/indicator.service';
import { IndicatorDefinition } from '../../core/models/indicator.model';
import { environment } from '../../../environments/environment';

// ── Types DSL ────────────────────────────────────────────────────────────────

type StepType = 'fetch' | 'filter' | 'groupBy' | 'findFirst' | 'extract' | 'aggregate' | 'round' | 'divide' | 'js';

interface PipelineStep {
  id: string;
  type: StepType;
  label: string;
  // fetch
  table?: string;
  contextFields?: string[];
  useGroupContext?: boolean;
  // filter
  filterField?: string;
  filterOperator?: string;
  filterValue?: string | number;
  // groupBy
  groupField?: string;
  // findFirst
  whereField?: string;
  whereValue?: string | number;
  sortField?: string;
  // extract
  extractField?: string;
  // aggregate
  aggregateFn?: string;
  // round
  decimals?: number;
  // divide
  divideBy?: number;
  // js
  jsCode?: string;
}

// ── Catalogues ───────────────────────────────────────────────────────────────

const STEP_CATALOG: { type: StepType; label: string; icon: string; color: string; desc: string }[] = [
  { type: 'fetch',     label: 'Récupérer données', icon: 'database',    color: '#1890ff', desc: 'Charge les données depuis PLaTon selon le contexte' },
  { type: 'filter',    label: 'Filtrer',            icon: 'filter',      color: '#52c41a', desc: 'Filtre les lignes selon une condition sur un champ' },
  { type: 'groupBy',   label: 'Grouper par',        icon: 'apartment',   color: '#fa8c16', desc: 'Regroupe les données par valeur d\'un champ' },
  { type: 'findFirst', label: 'Premier résultat',   icon: 'aim',         color: '#722ed1', desc: 'Prend le premier élément de chaque groupe (avec condition optionnelle)' },
  { type: 'extract',   label: 'Extraire champ',     icon: 'scissor',     color: '#eb2f96', desc: 'Extrait la valeur d\'un champ pour chaque ligne' },
  { type: 'aggregate', label: 'Agréger',            icon: 'calculator',  color: '#13c2c2', desc: 'Calcule une agrégation sur le tableau de valeurs' },
  { type: 'round',     label: 'Arrondir',           icon: 'field-number', color: '#faad14', desc: 'Arrondit le résultat à N décimales' },
  { type: 'divide',    label: 'Diviser',            icon: 'percentage',  color: '#ff4d4f', desc: 'Divise le résultat par une constante' },
  { type: 'js',        label: 'Code JS',            icon: 'code',        color: '#595959', desc: 'Exécute une fonction JavaScript personnalisée sur les données' },
];

// Champs contextuels disponibles pour filtrer selon la table sélectionnée

interface PlatonColumn { name: string; type: string; }
interface PlatonTable  { name: string; columns: PlatonColumn[]; }

const AVAILABLE_ICONS = [
  'trending_up', 'trending_down', 'star', 'repeat', 'check_circle',
  'access_time', 'analytics', 'speed', 'emoji_events', 'school',
  'quiz', 'assignment', 'bar_chart', 'show_chart', 'timeline',
];

const FORMULA_RECIPES: { name: string; desc: string; pipeline: Omit<PipelineStep, 'id'>[] }[] = [
  {
    name: 'Tentatives avant réussite',
    desc: 'Nombre moyen de tentatives avant la première réussite par exercice',
    pipeline: [
      { type: 'fetch',     label: 'Charger sessions',      table: 'SessionData', contextFields: ['user_id', 'activity_id'] },
      { type: 'groupBy',   label: 'Grouper par exercice',  groupField: 'resource_id' },
      { type: 'findFirst', label: 'Première réussite',     whereField: 'grade', whereValue: 100, sortField: 'created_at' },
      { type: 'extract',   label: 'Tentatives',            extractField: 'attempts' },
      { type: 'aggregate', label: 'Moyenne',               aggregateFn: 'avg' },
      { type: 'round',     label: 'Arrondir',              decimals: 2 },
    ],
  },
  {
    name: 'Note moyenne',
    desc: 'Moyenne des notes obtenues sur une activité',
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
    NzAlertModule, NzRadioModule, NzColorPickerModule,
    NzIconModule, NzPopoverModule, NzTooltipModule, NzSpinModule, NzSwitchModule,
  ],
  template: `
    <div class="builder">

      <!-- Stepper -->
      <nz-steps [nzCurrent]="step" nzSize="small" class="steps">
        <nz-step nzTitle="Définition"   nzDescription="Nom et contextes"></nz-step>
        <nz-step nzTitle="Contextes &amp; Vues" nzDescription="Vues par contexte"></nz-step>
        <nz-step nzTitle="Formule"      nzDescription="Pipeline de calcul"></nz-step>
      </nz-steps>

      <nz-divider></nz-divider>

      <!-- ── ÉTAPE 1 : Définition ─────────────────────────────────────── -->
      <div *ngIf="step === 0" class="step-content">

        <nz-form-item>
          <nz-form-label [nzRequired]="true">Nom de l'indicateur</nz-form-label>
          <nz-form-control nzErrorTip="Le nom est requis">
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
          <nz-form-label [nzRequired]="true">Contextes supportés</nz-form-label>
          <nz-form-control>
            <nz-select [(ngModel)]="def.supportedContexts" nzMode="multiple"
              nzPlaceHolder="Sélectionner les contextes" style="width:100%"
              (ngModelChange)="onSupportedContextsChange($event)">
              <nz-option nzValue="learner"  nzLabel="Apprenant (learner)"></nz-option>
              <nz-option nzValue="group"    nzLabel="Groupe de TP (group)"></nz-option>
              <nz-option nzValue="activity" nzLabel="Activité (activity)"></nz-option>
              <nz-option nzValue="course"   nzLabel="Cours (course)"></nz-option>
              <nz-option nzValue="teacher"  nzLabel="Enseignant (teacher)"></nz-option>
              <nz-option nzValue="global"   nzLabel="Global"></nz-option>
            </nz-select>
          </nz-form-control>
        </nz-form-item>

        <nz-form-item>
          <nz-form-label [nzRequired]="true">Événements déclencheurs</nz-form-label>
          <nz-form-control>
            <nz-select [(ngModel)]="def.requiredEvents" nzMode="tags"
              nzPlaceHolder="ex: exercise.answered" style="width:100%">
              <nz-option nzValue="exercise.answered"   nzLabel="exercise.answered"></nz-option>
              <nz-option nzValue="exercise.viewed"     nzLabel="exercise.viewed"></nz-option>
              <nz-option nzValue="activity.completed"  nzLabel="activity.completed"></nz-option>
              <nz-option nzValue="activity.started"    nzLabel="activity.started"></nz-option>
            </nz-select>
          </nz-form-control>
        </nz-form-item>

      </div>

      <!-- ── ÉTAPE 2 : Contextes & Vues ──────────────────────────────── -->
      <div *ngIf="step === 1" class="step-content">

        <nz-alert nzType="info" nzShowIcon style="margin-bottom:16px"
          nzMessage="Pour chaque contexte sélectionné, définissez les vues à afficher (carte, jauge, graphique, histogramme…). Chaque vue aura sa propre formule de calcul à l'étape suivante.">
        </nz-alert>

        <div *ngIf="contextConfigs.length === 0" class="empty-ctx">
          <p>Aucun contexte sélectionné. Retournez à l'étape 1 pour en choisir.</p>
        </div>

        <!-- Un bloc par contextType -->
        <div *ngFor="let ctx of contextConfigs; let ci = index" class="ctx-block">
          <nz-divider [nzText]="contextLabel(ctx.contextType)" nzOrientation="left"></nz-divider>

          <!-- Liste des vues du contexte -->
          <div *ngFor="let view of ctx.views; let vi = index" class="view-row">
            <div class="view-row-fields">
              <nz-form-item style="flex:2; margin:0">
                <nz-form-label>Libellé</nz-form-label>
                <nz-form-control>
                  <input nz-input [(ngModel)]="view.label" placeholder="ex: Résumé groupe" />
                </nz-form-control>
              </nz-form-item>

              <nz-form-item style="flex:2; margin:0">
                <nz-form-label>Type de visualisation</nz-form-label>
                <nz-form-control>
                  <nz-select [(ngModel)]="view.visualization.type" style="width:100%">
                    <nz-option nzValue="card"       nzLabel="Carte (valeur scalaire)"></nz-option>
                    <nz-option nzValue="gauge"      nzLabel="Jauge"></nz-option>
                    <nz-option nzValue="line-chart" nzLabel="Graphique ligne (historique)"></nz-option>
                    <nz-option nzValue="bar-chart"  nzLabel="Barres horizontales (par champ)"></nz-option>
                    <nz-option nzValue="histogram"  nzLabel="Histogramme (distribution)"></nz-option>
                  </nz-select>
                </nz-form-control>
              </nz-form-item>

              <nz-form-item style="flex:1; margin:0">
                <nz-form-label>Unité</nz-form-label>
                <nz-form-control>
                  <input nz-input [(ngModel)]="view.visualization.unit" placeholder="ex: tentatives" />
                </nz-form-control>
              </nz-form-item>

              <nz-form-item style="flex:1; margin:0">
                <nz-form-label>Couleur</nz-form-label>
                <nz-form-control>
                  <div class="color-row">
                    <nz-color-picker [(ngModel)]="view.visualization.color" [nzFormat]="'hex'"></nz-color-picker>
                  </div>
                </nz-form-control>
              </nz-form-item>
            </div>

            <!-- Seuils (uniquement card/gauge) -->
            <div class="threshold-row" *ngIf="view.visualization.type === 'card' || view.visualization.type === 'gauge'">
              <small>Seuils :</small>
              <nz-form-item style="margin:0">
                <nz-form-label><span class="dot dot-green"></span> Bon (≤)</nz-form-label>
                <nz-form-control>
                  <nz-input-number [(ngModel)]="view.visualization.thresholds!.good" [nzMin]="0" nzSize="small" style="width:80px"></nz-input-number>
                </nz-form-control>
              </nz-form-item>
              <nz-form-item style="margin:0">
                <nz-form-label><span class="dot dot-orange"></span> Moyen (≤)</nz-form-label>
                <nz-form-control>
                  <nz-input-number [(ngModel)]="view.visualization.thresholds!.warning" [nzMin]="0" nzSize="small" style="width:80px"></nz-input-number>
                </nz-form-control>
              </nz-form-item>
              <nz-form-item style="margin:0">
                <nz-form-label><span class="dot dot-red"></span> Critique (&gt;)</nz-form-label>
                <nz-form-control>
                  <nz-input-number [(ngModel)]="view.visualization.thresholds!.danger" [nzMin]="0" nzSize="small" style="width:80px"></nz-input-number>
                </nz-form-control>
              </nz-form-item>
            </div>

            <button nz-button nzType="text" nzDanger nzSize="small"
              (click)="removeView(ci, vi)">Supprimer cette vue</button>
          </div>

          <button nz-button nzType="dashed" nzSize="small" style="width:100%;margin-top:8px"
            (click)="addView(ci)">
            + Ajouter une vue pour {{ contextLabel(ctx.contextType) }}
          </button>
        </div>

      </div>

      <!-- ── ÉTAPE 3 : Formules par vue ───────────────────────────────── -->
      <div *ngIf="step === 2" class="step-content">

        <!-- Sélecteur de vue active -->
        <div class="view-selector-bar" *ngIf="allViews.length > 0">
          <label>Vue à éditer :</label>
          <nz-select
            [ngModel]="activeViewKey"
            (ngModelChange)="selectActiveView($event)"
            style="min-width:300px">
            <nz-option
              *ngFor="let v of allViews"
              [nzValue]="v.key"
              [nzLabel]="contextLabel(v.contextType) + ' - ' + v.label">
            </nz-option>
          </nz-select>
          <span *ngIf="allViews.length === 0" style="color:#999">
            Ajoutez d'abord des vues à l'étape 2.
          </span>
        </div>

        <nz-alert *ngIf="allViews.length === 0" nzType="warning" nzShowIcon
          nzMessage="Aucune vue définie. Retournez à l'étape 2 pour en créer."
          style="margin-bottom:16px">
        </nz-alert>

        <!-- Modèles prédéfinis (visuel seulement) -->
        <ng-container *ngIf="!jsonMode">
          <nz-alert nzType="info" nzShowIcon
            nzMessage="Choisissez un modèle pour démarrer rapidement, ou construisez votre pipeline manuellement.">
          </nz-alert>

          <div class="recipes">
            <button *ngFor="let r of recipes" nz-button nzType="dashed"
              class="recipe-btn" (click)="applyRecipe(r)">
              <strong>{{ r.name }}</strong>
              <span>{{ r.desc }}</span>
            </button>
          </div>

          <nz-divider nzText="Pipeline de calcul"></nz-divider>
        </ng-container>

        <!-- Toggle Visuel / JSON -->
        <div class="mode-toggle">
          <button nz-button nzSize="small"
            [nzType]="!jsonMode ? 'primary' : 'default'"
            (click)="leaveJsonMode()">
            <span nz-icon nzType="eye"></span> Visuel
          </button>
          <button nz-button nzSize="small"
            [nzType]="jsonMode ? 'primary' : 'default'"
            (click)="enterJsonMode()">
            <span nz-icon nzType="code"></span> JSON
          </button>
        </div>

        <!-- ── Vue JSON ── -->
        <ng-container *ngIf="jsonMode">
          <nz-alert nzType="warning" nzShowIcon
            nzMessage="Éditez le JSON directement. Cliquez sur 'Visuel' pour valider et revenir à l'éditeur graphique."
            style="margin-bottom:12px">
          </nz-alert>
          <textarea class="json-editor" [(ngModel)]="jsonText" rows="22" spellcheck="false"
            placeholder="Pipeline JSON…"></textarea>
          <div *ngIf="jsonError" class="json-error">{{ jsonError }}</div>
        </ng-container>

        <!-- ── Vue Visuelle ── -->
        <ng-container *ngIf="!jsonMode">

          <!-- Liste des étapes - avec drag-and-drop -->
          <div class="pipeline" cdkDropList (cdkDropListDropped)="drop($event)">

            <div *ngIf="formula.pipeline.length === 0" class="pipeline-empty">
              Aucune étape - ajoutez-en une ci-dessous ou choisissez une recette.
            </div>

            <div *ngFor="let s of formula.pipeline; let i = index"
              class="step-card" cdkDrag
              [style.border-left-color]="getStepMeta(s.type).color">

              <!-- Poignée de drag -->
              <div class="drag-handle" cdkDragHandle nz-tooltip="Glisser pour réordonner">
                <span nz-icon nzType="holder"></span>
              </div>

              <!-- Aperçu fantôme pendant le drag -->
              <div *cdkDragPlaceholder class="drag-placeholder"></div>

              <div class="step-header">
                <nz-tag [nzColor]="getStepMeta(s.type).color">
                  <span nz-icon [nzType]="getStepMeta(s.type).icon"></span>
                  {{ getStepMeta(s.type).label }}
                </nz-tag>
                <input nz-input [(ngModel)]="s.label" placeholder="Nom de l'étape"
                  class="step-label-input" size="30" />
                <button nz-button nzType="text" nzDanger nzSize="small"
                  nz-tooltip="Supprimer cette étape" (click)="removeStep(i)">
                  <span nz-icon nzType="delete"></span>
                </button>
              </div>

              <!-- Paramètres par type -->
              <div class="step-params">

                <!-- fetch -->
                <ng-container *ngIf="s.type === 'fetch'">
                  <div class="param-row">
                    <label>Table</label>
                    <nz-select [(ngModel)]="s.table" style="width:220px"
                      nzPlaceHolder="Choisir une table"
                      [nzLoading]="schemaLoading"
                      (ngModelChange)="s.contextFields = []">
                      <nz-option *ngFor="let t of platonSchema"
                        [nzValue]="t.name" [nzLabel]="t.name">
                      </nz-option>
                    </nz-select>
                  </div>
                  <div class="param-row">
                    <label>Requête groupe de TP</label>
                    <nz-switch [(ngModel)]="s.useGroupContext"
                      nzCheckedChildren="Groupe" nzUnCheckedChildren="Non"
                      nz-tooltip nzTooltipTitle="Récupère les données de tous les membres du groupe via une jointure interne (group_id est injecté automatiquement)">
                    </nz-switch>
                  </div>
                  <div class="param-row">
                    <label>Filtrer par contexte</label>
                    <nz-select [(ngModel)]="s.contextFields" nzMode="multiple" style="width:300px"
                      nzPlaceHolder="Choisir les colonnes de filtre"
                      [nzDisabled]="!s.table">
                      <nz-option *ngFor="let f of columnsForTable(s.table)"
                        [nzValue]="f.value" [nzLabel]="f.label">
                      </nz-option>
                    </nz-select>
                  </div>
                </ng-container>

                <!-- filter -->
                <ng-container *ngIf="s.type === 'filter'">
                  <div class="param-row">
                    <label>Champ</label>
                    <nz-select [(ngModel)]="s.filterField" style="width:180px">
                      <nz-option *ngFor="let f of activeColumns" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                    </nz-select>
                  </div>
                  <div class="param-row">
                    <label>Opérateur</label>
                    <nz-select [(ngModel)]="s.filterOperator" style="width:120px">
                      <nz-option nzValue="==" nzLabel="== (égal)"></nz-option>
                      <nz-option nzValue="!=" nzLabel="!= (différent)"></nz-option>
                      <nz-option nzValue=">"  nzLabel=">  (supérieur)"></nz-option>
                      <nz-option nzValue="<"  nzLabel="<  (inférieur)"></nz-option>
                      <nz-option nzValue=">=" nzLabel=">= (sup. ou égal)"></nz-option>
                      <nz-option nzValue="<=" nzLabel="<= (inf. ou égal)"></nz-option>
                    </nz-select>
                  </div>
                  <div class="param-row">
                    <label>Valeur</label>
                    <input nz-input [(ngModel)]="s.filterValue" placeholder="ex: 100" style="width:120px" />
                  </div>
                </ng-container>

                <!-- groupBy -->
                <ng-container *ngIf="s.type === 'groupBy'">
                  <div class="param-row">
                    <label>Grouper par</label>
                    <nz-select [(ngModel)]="s.groupField" style="width:200px">
                      <nz-option *ngFor="let f of activeColumns" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                    </nz-select>
                  </div>
                </ng-container>

                <!-- findFirst -->
                <ng-container *ngIf="s.type === 'findFirst'">
                  <div class="param-row">
                    <label>Condition (champ)</label>
                    <nz-select [(ngModel)]="s.whereField" nzAllowClear nzPlaceHolder="Optionnel" style="width:180px">
                      <nz-option *ngFor="let f of activeColumns" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                    </nz-select>
                  </div>
                  <div class="param-row" *ngIf="s.whereField">
                    <label>Valeur attendue</label>
                    <input nz-input [(ngModel)]="s.whereValue" placeholder="ex: 100" style="width:120px" />
                  </div>
                  <div class="param-row">
                    <label>Trier par</label>
                    <nz-select [(ngModel)]="s.sortField" nzAllowClear nzPlaceHolder="Optionnel" style="width:180px">
                      <nz-option *ngFor="let f of activeColumns" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                    </nz-select>
                  </div>
                </ng-container>

                <!-- extract -->
                <ng-container *ngIf="s.type === 'extract'">
                  <div class="param-row">
                    <label>Champ à extraire</label>
                    <nz-select [(ngModel)]="s.extractField" style="width:200px">
                      <nz-option *ngFor="let f of activeColumns" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                    </nz-select>
                  </div>
                </ng-container>

                <!-- aggregate -->
                <ng-container *ngIf="s.type === 'aggregate'">
                  <div class="param-row">
                    <label>Fonction</label>
                    <nz-select [(ngModel)]="s.aggregateFn" style="width:200px">
                      <nz-option nzValue="avg"   nzLabel="avg - Moyenne"></nz-option>
                      <nz-option nzValue="sum"   nzLabel="sum - Somme"></nz-option>
                      <nz-option nzValue="count" nzLabel="count - Nombre"></nz-option>
                      <nz-option nzValue="min"   nzLabel="min - Minimum"></nz-option>
                      <nz-option nzValue="max"   nzLabel="max - Maximum"></nz-option>
                    </nz-select>
                  </div>
                </ng-container>

                <!-- round -->
                <ng-container *ngIf="s.type === 'round'">
                  <div class="param-row">
                    <label>Décimales</label>
                    <nz-input-number [(ngModel)]="s.decimals" [nzMin]="0" [nzMax]="6" style="width:100px"></nz-input-number>
                  </div>
                </ng-container>

                <!-- divide -->
                <ng-container *ngIf="s.type === 'divide'">
                  <div class="param-row">
                    <label>Diviser par</label>
                    <nz-input-number [(ngModel)]="s.divideBy" [nzMin]="0.001" style="width:140px"></nz-input-number>
                  </div>
                </ng-container>

                <!-- js -->
                <ng-container *ngIf="s.type === 'js'">
                  <div class="param-row param-row-col">
                    <label>Code JavaScript</label>
                    <nz-alert nzType="info" nzShowIcon nzMessage="La variable 'input' contient la sortie de l'étape précédente. Retourner une valeur numérique." style="margin-bottom:6px;font-size:11px"></nz-alert>
                    <textarea nz-input [(ngModel)]="s.jsCode" rows="6" class="code-textarea"
                      placeholder="// Exemples :&#10;// return Array.isArray(input) ? input.length : 0;&#10;// return input * 2;"></textarea>
                  </div>
                </ng-container>

              </div>
            </div>

            <!-- Connecteur entre étapes -->
            <div *ngIf="formula.pipeline.length > 0" class="connector">
              <span nz-icon nzType="arrow-down" style="color:#999"></span>
            </div>

            <!-- Bouton ajout d'étape -->
            <div class="add-step-row">
              <button nz-button nzType="dashed" style="width:100%" (click)="stepPickerVisible = true">
                <span nz-icon nzType="plus"></span> Ajouter une étape
              </button>
            </div>

          </div>


          <!-- Prévisualisation -->
          <nz-divider nzText="Tester la formule"></nz-divider>
          <div class="preview-section">
            <div class="preview-inputs">
              <input nz-input [(ngModel)]="previewContext.userId"
                placeholder="userId (vue apprenant)" style="width:260px" />
              <input nz-input [(ngModel)]="previewContext.groupId"
                placeholder="groupId (vue groupe)" style="width:260px" />
              <input nz-input [(ngModel)]="previewContext.activityId"
                placeholder="activityId (optionnel)" style="width:260px" />
              <button nz-button nzType="primary" [nzLoading]="previewing" (click)="runPreview()">
                <span nz-icon nzType="experiment"></span> Tester
              </button>
            </div>
            <div *ngIf="previewResult !== null" class="preview-result">
              Résultat :
              <strong>{{ previewResult | number:'1.0-2' }}</strong>
              <nz-tag [nzColor]="viz.color">{{ viz.unit }}</nz-tag>
            </div>
            <div *ngIf="previewError" class="preview-error">{{ previewError }}</div>
          </div>

        </ng-container>

      </div>

      <!-- ── Overlay sélection d'étape ──────────────────────────────────── -->
      <div *ngIf="stepPickerVisible" class="picker-overlay" (click)="stepPickerVisible = false">
        <div class="picker-panel" (click)="$event.stopPropagation()">
          <div class="picker-header">
            <strong>Choisir une étape</strong>
            <button nz-button nzType="text" nzSize="small" (click)="stepPickerVisible = false">✕</button>
          </div>
          <div class="step-picker">
            <div *ngFor="let meta of stepCatalog" class="step-picker-item" (click)="addStep(meta.type)">
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
            {{ isEditMode ? 'Enregistrer les modifications' : "Créer l'indicateur" }}
          </button>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .builder { padding: 4px 0; }
    .steps { margin-bottom: 8px; }
    .step-content { min-height: 280px; }

    nz-form-label { width: 180px; }
    nz-form-item  { margin-bottom: 16px; }

    /* Étape 2 */
    .row-2 { display: flex; gap: 24px; }
    .row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    .color-row { display: flex; align-items: center; gap: 8px; }
    .color-dot { width: 32px; height: 32px; border-radius: 6px; border: 1px solid #d9d9d9; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; }
    .dot-green  { background: #52c41a; }
    .dot-orange { background: #fa8c16; }
    .dot-red    { background: #ff4d4f; }

    .icon-grid { display: flex; flex-wrap: wrap; gap: 6px; max-width: 480px; }
    .icon-btn {
      width: 40px; height: 40px; border-radius: 8px; border: 1px solid #d9d9d9;
      background: white; cursor: pointer; display: flex; align-items: center;
      justify-content: center; transition: all .2s;
    }
    .icon-btn:hover  { border-color: #1890ff; }
    .icon-btn.selected { border-color: #1890ff; background: #e6f7ff; box-shadow: 0 0 0 2px rgba(24,144,255,.2); }

    /* Étape 3 - Recettes */
    .recipes { display: flex; gap: 10px; margin: 12px 0; flex-wrap: wrap; }
    .recipe-btn {
      display: flex; flex-direction: column; align-items: flex-start;
      height: auto; padding: 8px 12px; text-align: left;
    }
    .recipe-btn strong { font-size: 13px; }
    .recipe-btn span   { font-size: 11px; color: #888; white-space: normal; }

    /* Toggle visuel/JSON */
    .mode-toggle { display: flex; gap: 4px; margin-bottom: 12px; justify-content: flex-end; }

    /* Éditeur JSON */
    .json-editor {
      width: 100%; font-family: 'Courier New', monospace; font-size: 12px;
      border-radius: 6px; background: #1e1e1e; color: #d4d4d4;
      border: 1px solid #333; padding: 12px; line-height: 1.6; resize: vertical;
    }
    .json-error { color: #ff4d4f; font-size: 12px; margin-top: 6px; }

    /* Pipeline source */
    .pipeline-source { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .source-label { font-weight: 500; white-space: nowrap; }

    /* Pipeline */
    .pipeline { display: flex; flex-direction: column; gap: 0; }
    .pipeline-empty { text-align: center; color: #aaa; padding: 24px; border: 1px dashed #d9d9d9; border-radius: 8px; }

    .step-card {
      border: 1px solid #e8e8e8; border-left: 4px solid #1890ff;
      border-radius: 8px; padding: 12px 16px; background: #fafafa;
      margin-bottom: 0; display: flex; gap: 10px; align-items: flex-start;
      cursor: default;
    }
    .step-card:not(:last-child) { margin-bottom: 0; }

    /* Drag handle */
    .drag-handle {
      cursor: grab; color: #ccc; padding: 2px 0; flex-shrink: 0;
      display: flex; align-items: center; margin-top: 2px;
      transition: color .15s;
    }
    .drag-handle:hover { color: #888; }
    .drag-handle:active { cursor: grabbing; }

    /* Placeholder pendant le drag */
    .drag-placeholder {
      background: #e6f7ff; border: 2px dashed #1890ff;
      border-radius: 8px; height: 60px; transition: transform 250ms cubic-bezier(0,0,.2,1);
    }

    /* Carte en cours de drag */
    .cdk-drag-animating { transition: transform 250ms cubic-bezier(0,0,.2,1); }
    .cdk-drop-list-dragging .step-card:not(.cdk-drag-placeholder) { transition: transform 250ms cubic-bezier(0,0,.2,1); }

    .step-body { flex: 1; min-width: 0; }
    .step-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .step-label-input { flex: 1; font-size: 13px; }
    .step-params { display: flex; flex-direction: column; gap: 8px; padding-left: 4px; }
    .param-row { display: flex; align-items: center; gap: 12px; }
    .param-row-col { flex-direction: column; align-items: flex-start; }
    .param-row label { width: 150px; font-size: 12px; color: #666; flex-shrink: 0; }
    .param-row-col label { width: auto; }
    .code-textarea { width: 100%; font-family: 'Courier New', monospace; font-size: 12px; }

    .connector { text-align: center; padding: 4px 0; }
    .add-step-row { margin-top: 8px; }

    /* Overlay sélection d'étape */
    .picker-overlay {
      position: fixed; inset: 0; z-index: 1100;
      background: rgba(0,0,0,.25);
      display: flex; align-items: center; justify-content: center;
    }
    .picker-panel {
      background: white; border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,.18);
      padding: 16px 20px; width: 380px;
      max-height: 70vh; overflow-y: auto;
    }
    .picker-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 12px;
    }
    .picker-header strong { font-size: 14px; }
    .step-picker { display: flex; flex-direction: column; gap: 4px; }
    .step-picker-item {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 8px; border-radius: 6px; cursor: pointer; transition: background .15s;
    }
    .step-picker-item:hover { background: #f0f5ff; }
    .step-picker-text { display: flex; flex-direction: column; }
    .step-picker-text strong { font-size: 13px; }
    .step-picker-text span   { font-size: 11px; color: #888; }

    /* Preview */
    .preview-section { display: flex; flex-direction: column; gap: 12px; }
    .preview-inputs  { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .preview-result  { font-size: 16px; padding: 10px 16px; background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 8px; }
    .preview-error   { color: #ff4d4f; font-size: 13px; }

    /* Nav */
    .nav-actions { display: flex; justify-content: space-between; align-items: center; }
    .nav-right   { display: flex; gap: 8px; }
  `],
})
export class IndicatorBuilderComponent implements OnInit {
  private readonly modalRef       = inject(NzModalRef);
  private readonly modalData      = inject(NZ_MODAL_DATA, { optional: true }) as { indicator?: IndicatorDefinition } | null;
  private readonly indicatorSvc   = inject(IndicatorService);
  private readonly messageSvc     = inject(NzMessageService);
  private readonly cdr            = inject(ChangeDetectorRef);

  get isEditMode(): boolean { return !!this.modalData?.indicator; }

  step = 0;
  saving = false;
  previewing = false;
  previewResult: string | number | null = null;
  previewError = '';

  // JSON mode (tâche 2)
  jsonMode = false;
  jsonText = '';
  jsonError = '';

  stepPickerVisible = false;

  // Catalogues exposés au template
  readonly stepCatalog    = STEP_CATALOG;
  readonly availableIcons = AVAILABLE_ICONS;
  readonly recipes        = FORMULA_RECIPES;

  // Schéma PLaTon chargé dynamiquement
  platonSchema: PlatonTable[] = [];
  schemaLoading = false;

  /** Colonnes de la table sélectionnée dans le premier fetch du pipeline. */
  get activeColumns(): { value: string; label: string }[] {
    const fetchStep = this.formula.pipeline.find(s => s.type === 'fetch');
    if (!fetchStep?.table) return [];
    // Compatibilité anciens noms ('sessions' → 'SessionData')
    const legacyMap: Record<string, string> = { sessions: 'SessionData', activities: 'Activities' };
    const tableName = legacyMap[fetchStep.table] ?? fetchStep.table;
    const table = this.platonSchema.find(t => t.name === tableName);
    return table?.columns.map(c => ({ value: c.name, label: c.name })) ?? [];
  }

  columnsForTable(tableName: string | undefined): { value: string; label: string }[] {
    if (!tableName) return [];
    const legacyMap: Record<string, string> = { sessions: 'SessionData', activities: 'Activities' };
    const resolved = legacyMap[tableName] ?? tableName;
    return this.platonSchema.find(t => t.name === resolved)?.columns.map(c => ({ value: c.name, label: c.name })) ?? [];
  }

  // ── Modèle du formulaire ─────────────────────────────────────────────────

  def = {
    name: '',
    description: '',
    supportedContexts: [] as string[],
    requiredEvents: [] as string[],
  };

  // Ancienne structure (gardée pour compatibilité du template step 1 legacy → remplacée)
  viz = {
    defaultType: 'card' as 'card' | 'chart' | 'gauge' | 'table',
    icon: 'analytics',
    color: '#722ed1',
    unit: '',
    thresholds: { good: 1, warning: 3, danger: 5 },
  };

  formula = {
    version: '1.0' as const,
    dataSource: '',
    pipeline: [] as PipelineStep[],
  };

  // ── Nouveau modèle multi-contexte/multi-vue ──────────────────────────────

  contextConfigs: Array<{
    contextType: string;
    views: Array<{
      id: string;
      label: string;
      visualization: {
        type: 'card' | 'gauge' | 'line-chart' | 'bar-chart' | 'histogram';
        icon?: string;
        color?: string;
        unit?: string;
        thresholds?: { good: number; warning: number; danger: number };
      };
      pipeline: PipelineStep[];
    }>;
  }> = [];

  // Clé de la vue active dans step 3 : "contextIndex:viewIndex"
  activeViewKey: string = '';

  // Vue plate de tous les (ctx, view) pour le sélecteur de l'étape 3
  get allViews(): { key: string; contextType: string; label: string }[] {
    const list: { key: string; contextType: string; label: string }[] = [];
    this.contextConfigs.forEach((ctx, ci) => {
      ctx.views.forEach((v, vi) => {
        list.push({ key: `${ci}:${vi}`, contextType: ctx.contextType, label: v.label || `Vue ${vi + 1}` });
      });
    });
    return list;
  }

  // ── Gestion contextConfigs ───────────────────────────────────────────────

  onSupportedContextsChange(selected: string[]): void {
    // Ajouter les contextes manquants
    for (const ctx of selected) {
      if (!this.contextConfigs.find(c => c.contextType === ctx)) {
        this.contextConfigs.push({ contextType: ctx, views: [] });
      }
    }
    // Retirer les contextes désélectionnés
    this.contextConfigs = this.contextConfigs.filter(c => selected.includes(c.contextType));
    // Mettre à jour la vue active si elle n'existe plus
    if (!this.allViews.find(v => v.key === this.activeViewKey)) {
      this.activeViewKey = this.allViews[0]?.key ?? '';
      this.loadActiveViewPipeline();
    }
  }

  addView(ctxIndex: number): void {
    const ctx = this.contextConfigs[ctxIndex];
    if (!ctx) return;
    ctx.views.push({
      id: crypto.randomUUID(),
      label: `Vue ${ctx.views.length + 1}`,
      visualization: { type: 'card', color: '#722ed1', unit: '', thresholds: { good: 1, warning: 3, danger: 5 } },
      pipeline: [],
    });
    // Sélectionner automatiquement la nouvelle vue dans step 3
    const newKey = `${ctxIndex}:${ctx.views.length - 1}`;
    this.selectActiveView(newKey);
  }

  removeView(ctxIndex: number, viewIndex: number): void {
    this.contextConfigs[ctxIndex]?.views.splice(viewIndex, 1);
    if (this.activeViewKey === `${ctxIndex}:${viewIndex}`) {
      this.activeViewKey = this.allViews[0]?.key ?? '';
      this.loadActiveViewPipeline();
    }
  }

  selectActiveView(key: string): void {
    // Sauvegarder le pipeline courant dans la vue active
    this.syncActiveViewPipeline();
    this.activeViewKey = key;
    this.loadActiveViewPipeline();
  }

  private syncActiveViewPipeline(): void {
    const [ci, vi] = this.activeViewKey.split(':').map(Number);
    const view = this.contextConfigs[ci]?.views[vi];
    if (view) view.pipeline = [...this.formula.pipeline];
  }

  private loadActiveViewPipeline(): void {
    const [ci, vi] = this.activeViewKey.split(':').map(Number);
    const view = this.contextConfigs[ci]?.views[vi];
    this.formula.pipeline = view ? [...view.pipeline] : [];
  }

  contextLabel(ct: string): string {
    const labels: Record<string, string> = {
      learner: 'Apprenant', group: 'Groupe de TP', activity: 'Activité',
      course: 'Cours', teacher: 'Enseignant', global: 'Global',
    };
    return labels[ct] ?? ct;
  }

  // ── Contexte de preview ──────────────────────────────────────────────────

  previewContext = {
    userId:     environment.defaultUserId || '',
    groupId:    '',
    activityId: '',
  };

  ngOnInit(): void {
    this.schemaLoading = true;
    this.indicatorSvc.getPlatonSchema().subscribe({
      next: schema => {
        this.platonSchema = schema;
        this.schemaLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.schemaLoading = false; },
    });
    if (this.modalData?.indicator) {
      this.hydrate(this.modalData.indicator);
    }
  }

  // ── Navigation stepper ───────────────────────────────────────────────────

  canProceed(): boolean {
    if (this.step === 0) return !!this.def.name.trim() && this.def.supportedContexts.length > 0 && this.def.requiredEvents.length > 0;
    return true;
  }

  nextStep(): void {
    if (this.canProceed()) this.step++;
  }

  // ── Drag-and-drop (tâche 1) ──────────────────────────────────────────────

  drop(event: CdkDragDrop<PipelineStep[]>): void {
    moveItemInArray(this.formula.pipeline, event.previousIndex, event.currentIndex);
  }

  // ── JSON mode (tâche 2) ──────────────────────────────────────────────────

  enterJsonMode(): void {
    this.jsonError = '';
    this.jsonText = JSON.stringify(
      this.formula.pipeline.map(s => ({
        id: s.id,
        type: s.type,
        label: s.label,
        params: this.extractParams(s),
      })),
      null, 2,
    );
    this.jsonMode = true;
  }

  leaveJsonMode(): void {
    if (!this.jsonMode) return;
    this.jsonError = '';
    try {
      const parsed: any[] = JSON.parse(this.jsonText);
      if (!Array.isArray(parsed)) throw new Error('Le JSON doit être un tableau de steps');
      this.formula.pipeline = parsed.map(s => this.dehydrateStep(s));
      this.jsonMode = false;
    } catch (e: any) {
      this.jsonError = `JSON invalide : ${e.message}`;
    }
  }

  // ── Pipeline ─────────────────────────────────────────────────────────────

  getStepMeta(type: StepType) {
    return STEP_CATALOG.find(s => s.type === type) ?? STEP_CATALOG[0];
  }

  addStep(type: StepType): void {
    const meta = this.getStepMeta(type);
    this.formula.pipeline.push({
      id: crypto.randomUUID(),
      type,
      label: meta.label,
      table: type === 'fetch' ? 'SessionData' : undefined,
      contextFields: type === 'fetch' ? ['user_id', 'activity_id'] : undefined,
      filterOperator: type === 'filter' ? '==' : undefined,
      aggregateFn: type === 'aggregate' ? 'avg' : undefined,
      decimals: type === 'round' ? 2 : undefined,
      divideBy: type === 'divide' ? 100 : undefined,
      jsCode: type === 'js' ? '// input : sortie de l\'étape précédente\nreturn 0;' : undefined,
    });
    this.stepPickerVisible = false;
  }

  removeStep(index: number): void {
    this.formula.pipeline.splice(index, 1);
  }

  applyRecipe(recipe: (typeof FORMULA_RECIPES)[0]): void {
    this.formula.pipeline = recipe.pipeline.map(s => ({
      ...s,
      id: crypto.randomUUID(),
    })) as PipelineStep[];
  }

  // ── Preview ──────────────────────────────────────────────────────────────

  runPreview(): void {
    this.previewing = true;
    this.previewResult = null;
    this.previewError = '';

    this.indicatorSvc.previewFormulaRaw(this.buildFormula(), {
      userId: this.previewContext.userId || undefined,
      groupId: this.previewContext.groupId || undefined,
      activityId: this.previewContext.activityId || undefined,
    }).subscribe({
      next: ({ result }) => {
        this.previewResult = typeof result === 'number' ? result : JSON.stringify(result, null, 2);
        this.previewing = false;
        this.cdr.detectChanges();
      },
      error: err => {
        this.previewError = err?.error?.message ?? 'Erreur lors du test';
        this.previewing = false;
        this.cdr.detectChanges();
      },
    });
  }

  // ── Soumission ───────────────────────────────────────────────────────────

  submit(): void {
    // Si l'utilisateur est en mode JSON, tenter de valider avant de soumettre
    if (this.jsonMode) {
      this.leaveJsonMode();
      if (this.jsonError) return;
    }

    if (!this.def.name.trim()) {
      this.messageSvc.error('Le nom est requis');
      return;
    }

    this.saving = true;

    // Sauvegarder le pipeline courant dans la vue active avant de soumettre
    this.syncActiveViewPipeline();

    // Sérialiser contextConfigs (pipelines PipelineStep → params JSON)
    const serializedContextConfigs = this.contextConfigs.map(ctx => ({
      contextType: ctx.contextType,
      views: ctx.views.map(v => ({
        id: v.id,
        label: v.label,
        visualization: { ...v.visualization },
        formula: {
          version: '1.0',
          pipeline: v.pipeline.map(s => ({
            id: s.id, type: s.type, label: s.label,
            params: this.extractParams(s),
          })),
        },
      })),
    }));

    const payload = {
      name: this.def.name.trim(),
      description: this.def.description.trim(),
      supportedContexts: this.def.supportedContexts as any,
      requiredEvents: this.def.requiredEvents,
      // Legacy (rétro-compatibilité avec les indicateurs existants)
      visualization: { ...this.viz },
      formula: this.buildFormula(),
      // Nouveau modèle
      contextConfigs: serializedContextConfigs,
      isActive: true,
    };

    const save$ = this.isEditMode
      ? this.indicatorSvc.updateIndicator(this.modalData!.indicator!.id, payload)
      : this.indicatorSvc.createIndicator(payload as any);

    save$.subscribe({
      next: () => {
        this.messageSvc.success(
          this.isEditMode
            ? `Indicateur "${payload.name}" mis à jour`
            : `Indicateur "${payload.name}" créé avec succès`,
        );
        this.modalRef.close(true);
      },
      error: err => {
        this.messageSvc.error(
          err?.error?.message ??
          (this.isEditMode ? 'Erreur lors de la mise à jour' : 'Erreur lors de la création'),
        );
        this.saving = false;
      },
    });
  }

  cancel(): void {
    this.modalRef.close(false);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private buildFormula() {
    return {
      version: '1.0',
      dataSource: this.formula.dataSource,
      pipeline: this.formula.pipeline.map(s => ({
        id: s.id,
        type: s.type,
        label: s.label,
        params: this.extractParams(s),
      })),
    };
  }

  private extractParams(s: PipelineStep): Record<string, any> {
    switch (s.type) {
      case 'fetch': {
        const fields = [...(s.contextFields ?? [])];
        if (s.useGroupContext && !fields.includes('group_id')) fields.unshift('group_id');
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

  private hydrate(ind: IndicatorDefinition): void {
    this.def.name              = ind.name;
    this.def.description       = ind.description || '';
    this.def.supportedContexts = (ind.supportedContexts as string[]) || [];
    this.def.requiredEvents    = ind.requiredEvents || [];

    // Legacy viz (pour rétro-compatibilité)
    this.viz.defaultType  = ind.visualization?.defaultType || 'card';
    this.viz.icon         = ind.visualization?.icon || 'analytics';
    this.viz.color        = ind.visualization?.color || '#722ed1';
    this.viz.unit         = ind.visualization?.unit || '';
    this.viz.thresholds   = ind.visualization?.thresholds
      ? { ...ind.visualization.thresholds }
      : { good: 1, warning: 3, danger: 5 };

    // Charger contextConfigs (nouveau modèle)
    if (ind.contextConfigs?.length) {
      this.contextConfigs = ind.contextConfigs.map(ctx => ({
        contextType: ctx.contextType,
        views: ctx.views.map(v => ({
          id: v.id,
          label: v.label,
          visualization: { ...v.visualization } as any,
          pipeline: (v.formula?.pipeline || []).map((s: any) => this.dehydrateStep(s)),
        })),
      }));
    } else if (ind.formula) {
      // Rétro-compatibilité : construire un contextConfig learner depuis formula+visualization
      this.contextConfigs = [{
        contextType: 'learner',
        views: [{
          id: 'default',
          label: 'Vue principale',
          visualization: {
            type: (ind.visualization?.defaultType === 'chart' ? 'line-chart'
              : ind.visualization?.defaultType ?? 'card') as any,
            color: ind.visualization?.color,
            unit: ind.visualization?.unit,
            thresholds: ind.visualization?.thresholds,
          },
          pipeline: (ind.formula.pipeline || []).map((s: any) => this.dehydrateStep(s)),
        }],
      }];
    }

    // Sélectionner la première vue
    this.activeViewKey = this.allViews[0]?.key ?? '';
    this.loadActiveViewPipeline();
  }

  private dehydrateStep(step: { id: string; type: StepType; label?: string; params: Record<string, any> }): PipelineStep {
    const p = step.params;
    const s: PipelineStep = { id: step.id, type: step.type, label: step.label ?? step.type };
    switch (step.type) {
      case 'fetch':
        s.table = p['table'];
        s.useGroupContext = (p['contextFields'] ?? []).includes('group_id');
        s.contextFields = (p['contextFields'] ?? []).filter((f: string) => f !== 'group_id');
        break;
      case 'filter':    s.filterField = p['field']; s.filterOperator = p['operator']; s.filterValue = p['value']; break;
      case 'groupBy':   s.groupField = p['groupField']; break;
      case 'findFirst': s.whereField = p['whereField']; s.whereValue = p['whereValue']; s.sortField = p['sortField']; break;
      case 'extract':   s.extractField = p['extractField']; break;
      case 'aggregate': s.aggregateFn = p['aggregateFn']; break;
      case 'round':     s.decimals = p['decimals']; break;
      case 'divide':    s.divideBy = p['divideBy']; break;
      case 'js':        s.jsCode = p['code']; break;
    }
    return s;
  }
}
