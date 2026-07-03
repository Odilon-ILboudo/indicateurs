// frontend/src/app/features/admin/indicator-builder.component.ts
import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
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
import { NzModalModule, NzModalRef, NzModalService, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import * as yaml from 'js-yaml';
import { IndicatorService } from '../../core/services/indicator.service';
import { IndicatorDefinition, IndicatorScope, ViewVisualizationType, TeacherCourse, CourseActivity } from '../../core/models/indicator.model';
import { getCurrentUserId } from '../../core/auth/current-user';

// ── Types DSL ────────────────────────────────────────────────────────────────

type StepType = 'fetch' | 'join' | 'filter' | 'groupBy' | 'findFirst' | 'extract' | 'aggregate' | 'round' | 'divide' | 'js';

interface PipelineStep {
  id: string; type: StepType; label: string;
  // fetch
  table?: string; contextFields?: string[]; useGroupContext?: boolean;
  // join
  joinTable?: string; joinContextFields?: string[]; joinLeftKey?: string; joinRightKey?: string;
  joinType?: 'left' | 'inner' | 'right' | 'full';
  // filter
  filterField?: string; filterOperator?: string; filterValue?: string | number;
  // groupBy
  groupField?: string;
  // findFirst
  whereField?: string; whereValue?: string | number; sortField?: string;
  // extract
  extractField?: string;
  // aggregate
  aggregateFn?: string;
  // round / divide / js
  decimals?: number; divideBy?: number; jsCode?: string;
}

interface FlatViz {
  id: string;
  label: string;
  type: ViewVisualizationType;
  icon: string;
  color: string;
  unit: string;
}

interface PlatonTable { name: string; columns: { name: string; type: string }[]; }

/** Données partagées par les membres d'un cercle, transmis de builder en builder. */
export interface IndicatorCirclePreset {
  circleName: string;
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
  { type: 'join',      label: 'Jointure',           icon: 'merge-cells',  color: '#0958d9', desc: 'Joint les données courantes avec une seconde table PLaTon sur une clé commune (left, inner, right ou full)' },
  { type: 'filter',    label: 'Filtrer',            icon: 'filter',       color: '#52c41a', desc: 'Filtre les lignes selon une condition sur un champ' },
  { type: 'groupBy',   label: 'Grouper par',        icon: 'apartment',    color: '#fa8c16', desc: 'Regroupe les données par valeur d\'un champ' },
  { type: 'findFirst', label: 'Premier résultat',   icon: 'aim',          color: '#722ed1', desc: 'Prend le premier élément de chaque groupe' },
  { type: 'extract',   label: 'Extraire champ',     icon: 'scissor',      color: '#eb2f96', desc: 'Extrait la valeur d\'un champ pour chaque ligne' },
  { type: 'aggregate', label: 'Agréger',            icon: 'calculator',   color: '#13c2c2', desc: 'Calcule une agrégation sur le tableau de valeurs' },
  { type: 'round',     label: 'Arrondir',           icon: 'field-number', color: '#faad14', desc: 'Arrondit le résultat à N décimales' },
  { type: 'divide',    label: 'Diviser',            icon: 'percentage',   color: '#ff4d4f', desc: 'Divise le résultat par une constante' },
  { type: 'js',        label: 'Code JS',            icon: 'code',         color: '#595959', desc: 'Exécute une fonction JavaScript sur les données' },
];

const FORMULA_RECIPES: { name: string; desc: string; detail: { objectif: string; utilisation: string; adapter: string }; pipeline: Omit<PipelineStep, 'id'>[] }[] = [
  {
    name: 'Tentatives avant réussite',
    desc: 'Nb moyen de tentatives avant la 1ère note de 100',
    detail: {
      objectif: `Mesure la persévérance d'un apprenant sur une activité. Indique combien de fois en moyenne il a fallu tenter un exercice avant d'obtenir 100/100. Utile pour détecter les exercices difficiles ou mal calibrés.`,
      utilisation: `Idéal pour une visualisation card ou gauge. Fonctionne en contexte learner (valeur propre à l'apprenant) ou activity (vue agrégée sur tous les apprenants). Résultat : un nombre décimal, ex: 3.25.`,
      adapter: `Changer whereValue: 100 pour un autre seuil de réussite (ex: 80). Passer aggregateFn de "avg" à "max" pour voir la pire performance. Ajouter un step filter avant groupBy pour cibler une ressource spécifique.`,
    },
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
    detail: {
      objectif: `Indicateur de base mesurant la performance générale d'un apprenant sur toutes ses sessions d'une activité. Simple, lisible d'un coup d'œil, et bon point de départ pour tout tableau de bord.`,
      utilisation: `Parfait pour une card ou une gauge (avec des seuils colorés). Contexte learner ou activity. Résultat : un nombre décimal, ex: 72.4.`,
      adapter: `Ajouter un step filter avant extract pour ne cibler que certaines sessions (ex: récentes, d'un type précis). Changer decimals: 1 pour plus ou moins de précision. Remplacer le champ grade par attempts pour mesurer le volume de travail plutôt que la performance.`,
    },
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
    detail: {
      objectif: `Compte le nombre d'exercices distincts pour lesquels l'apprenant a obtenu 100/100 au moins une fois. Mesure la progression dans l'activité et peut être rapporté au total d'exercices pour obtenir un taux de complétion.`,
      utilisation: `card ou gauge. Contexte learner. Résultat : un entier, ex: 5. Peut être combiné avec un second indicateur "total d'exercices" pour afficher un ratio.`,
      adapter: `Changer filterValue: 100 pour un autre seuil (ex: 80 pour "exercices quasi-réussis"). Ajouter un join sur Resources puis un groupBy pour ventiler par catégorie d'exercice. Remplacer count par countUnique si des doublons de sessions peuvent fausser le comptage.`,
    },
    pipeline: [
      { type: 'fetch',     label: 'Charger sessions', table: 'SessionData', contextFields: ['user_id', 'activity_id'] },
      { type: 'filter',    label: 'Note = 100',       filterField: 'grade', filterOperator: '==', filterValue: 100 },
      { type: 'extract',   label: 'Identifiants',     extractField: 'resource_id' },
      { type: 'aggregate', label: 'Compter',          aggregateFn: 'count' },
    ],
  },
  {
    name: 'Notes moyennes par ressource',
    desc: 'Moyenne des notes par exercice, avec noms lisibles (bar-chart)',
    detail: {
      objectif: `Vue détaillée de la performance d'un apprenant exercice par exercice. Chaque barre représente un exercice (avec son nom lisible) et sa hauteur indique la note moyenne obtenue. Permet de repérer les exercices où l'apprenant est en difficulté.`,
      utilisation: `Conçu pour un bar-chart. Contexte learner ou activity. Le step js produit un objet clé→valeur, ex: { "Exercice A": 85.2, "Exercice B": 62.0 }. Le join est indispensable pour remplacer les IDs par les noms.`,
      adapter: `Remplacer grade par attempts dans le step js pour afficher les tentatives par ressource. Ajouter un filter avant le join pour exclure les exercices non tentés. Si la table Resources utilise title plutôt que name, changer row.name en row.title dans le code js.`,
    },
    pipeline: [
      { type: 'fetch', label: 'Charger sessions',          table: 'SessionData', contextFields: ['user_id', 'activity_id'] },
      { type: 'join',  label: 'Joindre noms de ressources', joinTable: 'Resources', joinLeftKey: 'resource_id', joinRightKey: 'id' },
      { type: 'js',    label: 'Moyenne par ressource', jsCode:
`const sums = {};
const counts = {};
for (const row of input) {
  const grade = parseFloat(row.grade);
  if (isNaN(grade)) continue;
  const label = row.name || row.resource_id;
  sums[label] = (sums[label] || 0) + grade;
  counts[label] = (counts[label] || 0) + 1;
}
const result = {};
for (const label of Object.keys(sums)) {
  result[label] = Math.round((sums[label] / counts[label]) * 10) / 10;
}
return result;` },
    ],
  },
  {
    name: 'Tentatives par étudiant (groupe)',
    desc: 'Total des tentatives par étudiant d\'un groupe de TP, avec noms lisibles (bar-chart)',
    detail: {
      objectif: `Vue enseignant sur l'activité d'un groupe de TP. Chaque barre représente un étudiant du groupe et sa hauteur le total de ses tentatives. Permet de repérer les étudiants très actifs, absents, ou en difficulté d'un seul regard.`,
      utilisation: `Conçu pour un bar-chart. Nécessite le contexte group avec useGroupContext: true dans le step fetch. Le join sur Users permet d'afficher les prénoms/noms à la place des IDs. Résultat : { "Jean Dupont": 12, "Marie Martin": 7, ... }.`,
      adapter: `Remplacer attempts par grade dans le step js et calculer une moyenne pour obtenir la note moyenne par étudiant du groupe. Ajouter un filter pour ne compter que les sessions réussies. Changer le label en row.email si on préfère les adresses email aux noms complets.`,
    },
    pipeline: [
      { type: 'fetch', label: 'Charger sessions du groupe', table: 'SessionData', contextFields: ['group_id', 'activity_id'], useGroupContext: true },
      { type: 'join',  label: 'Joindre noms des étudiants', joinTable: 'Users', joinLeftKey: 'user_id', joinRightKey: 'id' },
      { type: 'js',    label: 'Total par étudiant', jsCode:
`const totals = {};
for (const row of input) {
  const attempts = parseFloat(row.attempts);
  if (isNaN(attempts)) continue;
  const label = (row.first_name && row.last_name) ? row.first_name + ' ' + row.last_name : row.user_id;
  totals[label] = (totals[label] || 0) + attempts;
}
return totals;` },
    ],
  },
];

// ── Erreur de parsing structurée ─────────────────────────────────────────────

class PipelineError extends Error {
  constructor(
    message: string,
    readonly available?: string[],
    readonly availableLabel?: string,
    readonly wrongValue?: string,
    readonly availableDisplay?: string[], // étiquettes d'affichage (si différentes de available)
  ) { super(message); }
}

interface ImportErrorDisplay {
  main: string;
  available?: string[];           // valeurs à insérer au clic
  availableDisplay?: string[];    // étiquettes affichées (si différentes de available)
  availableLabel?: string;
  wrongValue?: string;
}

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
    NzModalModule, NzBadgeModule,
  ],
  template: `
<div class="builder">

  <nz-steps [nzCurrent]="step" nzSize="small" class="steps">
    <nz-step nzTitle="Définition"  nzDescription="Nom et événements"           class="step-clickable" (click)="goToStep(0)"></nz-step>
    <nz-step nzTitle="Contexte"    nzDescription="Contexte et visualisations"  class="step-clickable" (click)="goToStep(1)"></nz-step>
    <nz-step nzTitle="Formules"    nzDescription="Pipeline par visualisation"  class="step-clickable" (click)="goToStep(2)"></nz-step>
  </nz-steps>

  <div class="indicator-header" *ngIf="def.name">
    {{ isEditMode ? 'Édition : ' : 'Nouvel indicateur : ' }}{{ def.name }}
    <span *ngIf="circleProgress"> - {{ circleProgress }}</span>
  </div>

  <nz-divider></nz-divider>

  <!-- ── ÉTAPE 1 ─────────────────────────────────────────────────────── -->
  <div *ngIf="step === 0" class="step-content">
    <nz-form-item>
      <nz-form-label [nzRequired]="true">Nom de l'indicateur <mat-icon class="info-icon" nz-tooltip="Nom unique affiché dans le tableau de bord et les listes. Doit être court et descriptif. Ex : 'Tentatives avant réussite'." nzTooltipPlacement="right">info_outline</mat-icon></nz-form-label>
      <nz-form-control>
        <input #nameInput nz-input [(ngModel)]="def.name" placeholder="ex: Tentatives avant réussite"
          (ngModelChange)="onNameInput($event)" />
        <!-- Bandeau indicateurs similaires -->
        <div *ngIf="similarSearching" class="similar-searching">
          <nz-spin nzSimple [nzSize]="'small'"></nz-spin>
          <span>Vérification des doublons…</span>
        </div>
        <div *ngIf="!similarSearching && similarIndicators.length > 0" class="similar-banner">
          <div class="similar-banner-header">
            <mat-icon class="similar-banner-icon">warning_amber</mat-icon>
            <span>{{ similarIndicators.length }} indicateur{{ similarIndicators.length > 1 ? 's similaires existants' : ' similaire existant' }} - vérifiez avant de créer.</span>
          </div>
          <div class="similar-list">
            <div *ngFor="let ind of similarIndicators" class="similar-item">
              <div class="similar-item-info">
                <mat-icon [style.color]="ind.visualizations?.[0]?.color || '#8c8c8c'" style="font-size:16px;width:16px;height:16px;line-height:1">{{ ind.visualizations?.[0]?.icon || 'analytics' }}</mat-icon>
                <span class="similar-item-name">{{ ind.name }}</span>
                <nz-tag [nzColor]="ind.isActive ? 'green' : 'default'" style="margin:0">{{ ind.isActive ? 'Actif' : 'Inactif' }}</nz-tag>
              </div>
              <button nz-button nzType="link" nzSize="small" class="similar-voir-btn" (click)="openPreview(ind)">
                <mat-icon>visibility</mat-icon>Voir
              </button>
            </div>
          </div>
        </div>
      </nz-form-control>
    </nz-form-item>

    <!-- Modal prévisualisation indicateur existant -->
    <nz-modal
      [(nzVisible)]="previewModalVisible"
      [nzTitle]="previewIndicator?.name || ''"
      [nzWidth]="560"
      [nzFooter]="null"
      (nzOnCancel)="previewModalVisible = false">
      <ng-container *nzModalContent>
        <ng-container *ngIf="previewIndicator as ind">
          <div class="prev-card">

            <!-- Description -->
            <div class="prev-row">
              <span class="prev-label">Description</span>
              <p class="prev-value">{{ ind.description || '-' }}</p>
            </div>

            <!-- Métadonnées : 3 colonnes -->
            <div class="prev-row prev-meta">
              <div class="prev-meta-cell">
                <span class="prev-label">Contexte</span>
                <p class="prev-value">{{ ind.contextType }}</p>
              </div>
              <div class="prev-meta-cell prev-meta-sep">
                <span class="prev-label">Cercle</span>
                <p class="prev-value">{{ ind.circleName || '-' }}</p>
              </div>
              <div class="prev-meta-cell prev-meta-sep">
                <span class="prev-label">Statut</span>
                <nz-tag [nzColor]="ind.isActive ? 'green' : 'default'" style="margin-top:2px">
                  {{ ind.isActive ? 'Actif' : 'Inactif' }}
                </nz-tag>
              </div>
            </div>

            <!-- Aide à l'analyse -->
            <div class="prev-row" *ngIf="ind.interpretationHint">
              <span class="prev-label">Aide à l'analyse</span>
              <p class="prev-value prev-hint">{{ ind.interpretationHint }}</p>
            </div>

            <!-- Visualisations -->
            <div class="prev-row" *ngIf="ind.visualizations?.length">
              <span class="prev-label">Visualisations</span>
              <div class="prev-vizs">
                <div *ngFor="let v of ind.visualizations" class="prev-viz-chip">
                  <mat-icon [style.color]="v.color || '#8c8c8c'">{{ v.icon || 'bar_chart' }}</mat-icon>
                  {{ v.label }}
                </div>
              </div>
            </div>

            <!-- Événements déclencheurs -->
            <div class="prev-row">
              <span class="prev-label">Événements déclencheurs</span>
              <div class="prev-tags">
                <ng-container *ngIf="ind.requiredEvents?.length; else noEvt">
                  <nz-tag *ngFor="let e of ind.requiredEvents" nzColor="blue">{{ e }}</nz-tag>
                </ng-container>
                <ng-template #noEvt>
                  <span class="prev-empty">Aucun événement configuré</span>
                </ng-template>
              </div>
            </div>

            <!-- Seuils -->
            <div class="prev-row prev-row--last" *ngIf="ind.thresholds?.good != null || ind.thresholds?.warning != null">
              <span class="prev-label">Seuils de performance</span>
              <div class="prev-thresholds">
                <div *ngIf="ind.thresholds?.good != null" class="prev-threshold prev-threshold--good">
                  <mat-icon>check_circle</mat-icon>
                  <span>Bon <strong>≤ {{ ind.thresholds!.good }}</strong></span>
                </div>
                <div *ngIf="ind.thresholds?.warning != null" class="prev-threshold prev-threshold--warn">
                  <mat-icon>warning</mat-icon>
                  <span>Moyen <strong>≤ {{ ind.thresholds!.warning }}</strong></span>
                </div>
                <div class="prev-threshold prev-threshold--danger">
                  <mat-icon>cancel</mat-icon>
                  <span>Critique <strong>&gt; {{ ind.thresholds!.warning ?? ind.thresholds!.good }}</strong></span>
                </div>
              </div>
            </div>

          </div>
        </ng-container>
      </ng-container>
    </nz-modal>
    <nz-form-item>
      <nz-form-label>Description <mat-icon class="info-icon" nz-tooltip="Explication de ce que mesure cet indicateur, visible par les utilisateurs dans la page de sélection." nzTooltipPlacement="right">info_outline</mat-icon></nz-form-label>
      <nz-form-control>
        <textarea nz-input [(ngModel)]="def.description" rows="3"
          placeholder="Décrivez ce que mesure cet indicateur…"></textarea>
      </nz-form-control>
    </nz-form-item>
    <nz-form-item>
      <nz-form-label>Aide à l'analyse <mat-icon class="info-icon" nz-tooltip="Texte affiché dans la page de détail pour guider l'interprétation des résultats. Ex : 'Un résultat élevé indique des difficultés sur cet exercice.'" nzTooltipPlacement="right">info_outline</mat-icon></nz-form-label>
      <nz-form-control>
        <textarea nz-input [(ngModel)]="def.interpretationHint" rows="3"
          placeholder="Ex : Un résultat élevé signifie que les étudiants ont eu du mal. Regardez en priorité les ressources avec une note inférieure à 50."></textarea>
      </nz-form-control>
    </nz-form-item>
    <nz-form-item>
      <nz-form-label [nzRequired]="true">Événements déclencheurs <mat-icon class="info-icon" nz-tooltip="Événements PLaTon qui déclenchent l'ingestion de nouvelles données. L'indicateur est recalculé automatiquement quand ces événements surviennent." nzTooltipPlacement="right">info_outline</mat-icon></nz-form-label>
      <nz-form-control>
        <nz-select [(ngModel)]="def.requiredEvents" nzMode="tags"
          nzPlaceHolder="Sélectionner ou saisir un événement" style="width:100%">
          <nz-option *ngFor="let evt of availableEventTypes"
            [nzValue]="evt.name" [nzLabel]="evt.name + ' - ' + evt.label">
          </nz-option>
        </nz-select>
      </nz-form-control>
    </nz-form-item>
  </div>

  <!-- ── ÉTAPE 2 ─────────────────────────────────────────────────────── -->
  <div *ngIf="step === 1" class="step-content">

    <nz-form-item>
      <nz-form-label [nzRequired]="true">Contexte <mat-icon class="info-icon" nz-tooltip="À qui s'adresse cet indicateur. Apprenant = tableau de bord personnel. Cours / Groupe = contexte enseignant. Activité = page statistiques d'une activité. Enseignant / Admin = tableau de bord propre à ces rôles." nzTooltipPlacement="right">info_outline</mat-icon></nz-form-label>
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
            class="viz-label-input"
            nz-tooltip="Nom de l'onglet affiché sur la card et la page détail quand l'indicateur a plusieurs visualisations. Ex : 'Vue carte', 'Distribution'."
            nzTooltipPlacement="top" />
          <button nz-button nzType="text" nzDanger nzSize="small"
            nz-tooltip="Supprimer" [disabled]="vizList.length <= 1"
            (click)="removeViz(i)">
            <span nz-icon nzType="delete"></span>
          </button>
        </div>

        <div class="viz-fields">
          <div class="viz-field viz-field-type">
            <label>Type <mat-icon class="info-icon" nz-tooltip="Forme d'affichage. Carte = valeur scalaire. Barres = résultat {clé:valeur}. Histogramme = distribution [{bucket, count}]. Jauge = valeur avec plafond. Ligne = historique temporel." nzTooltipPlacement="top">info_outline</mat-icon></label>
            <nz-select [(ngModel)]="v.type" style="width:100%" (ngModelChange)="onVizTypeChange(v)">
              <nz-option nzValue="card"       nzLabel="Valeur scalaire"></nz-option>
              <nz-option nzValue="gauge"      nzLabel="Jauge"></nz-option>
              <nz-option nzValue="bar-chart"  nzLabel="Barres horizontales"></nz-option>
              <nz-option nzValue="histogram"  nzLabel="Histogramme"></nz-option>
              <nz-option nzValue="line-chart" nzLabel="Graphique ligne"></nz-option>
            </nz-select>
          </div>
          <div class="viz-field viz-field-icon">
            <label>Icône <mat-icon class="info-icon" nz-tooltip="Icône Material affichée dans la card indicateur." nzTooltipPlacement="top">info_outline</mat-icon></label>
            <div class="icon-picker">
              <div class="icon-grid">
                <button *ngFor="let ic of availableIcons"
                  (click)="v.icon = ic"
                  [class.selected]="v.icon === ic"
                  class="icon-button"
                  type="button"
                  nz-tooltip="{{ic}}"
                  nzTooltipPlacement="top">
                  <mat-icon>{{ ic }}</mat-icon>
                </button>
              </div>
            </div>
          </div>
          <div class="viz-field viz-field-color">
            <label>Couleur <mat-icon class="info-icon" nz-tooltip="Couleur principale de la visualisation (barres, jauge, courbe)." nzTooltipPlacement="top">info_outline</mat-icon></label>
            <nz-color-picker [(ngModel)]="v.color" [nzFormat]="'hex'"></nz-color-picker>
          </div>
          <div class="viz-field viz-field-unit">
            <label>Unité <mat-icon class="info-icon" nz-tooltip="Suffixe affiché à côté de la valeur. Ex : 'tentatives', '%', 'min'. Laissez vide si pas d'unité." nzTooltipPlacement="top">info_outline</mat-icon></label>
            <input nz-input [(ngModel)]="v.unit" placeholder="tentatives, %, …" />
          </div>
        </div>

      </div>

      <button nz-button nzType="dashed" style="width:100%;margin-top:8px" (click)="addViz()">
        <span nz-icon nzType="plus"></span> Ajouter une visualisation
      </button>
    </div>

    <!-- Seuil global (optionnel) -->
    <nz-divider nzDashed></nz-divider>
    <div class="global-threshold-section">
      <div class="section-label">
        Seuil de performance
        <mat-icon class="info-icon"
          nz-tooltip="Optionnel. Définit 3 zones colorées : ● Bon (vert) : valeur ≤ seuil Bon - ● Moyen (orange) : valeur entre Bon et Moyen - ● Difficile (rouge) : valeur > seuil Moyen. La zone Difficile est déduite automatiquement, il n'y a pas de champ à remplir pour elle. Colore la valeur dans la carte et affiche la légende dans le panneau latéral."
          nzTooltipPlacement="right">info_outline</mat-icon>
      </div>
      <div class="threshold-row">
        <div class="threshold-item">
          <label><span class="dot dot-green"></span> Bon ≤</label>
          <nz-input-number
            [ngModel]="def.thresholds?.good ?? null"
            (ngModelChange)="onThresholdGoodChange($event)"
            [nzMin]="0" nzSize="small" nzPlaceHolder="-">
          </nz-input-number>
        </div>
        <div class="threshold-item">
          <label><span class="dot dot-orange"></span> Moyen ≤</label>
          <nz-input-number
            [ngModel]="def.thresholds?.warning ?? null"
            (ngModelChange)="onThresholdWarningChange($event)"
            [nzMin]="0" nzSize="small" nzPlaceHolder="-">
          </nz-input-number>
        </div>
        <button nz-button nzType="text" nzDanger *ngIf="def.thresholds" (click)="clearThresholds()" style="margin-left:8px">
          <span nz-icon nzType="close-circle"></span> Supprimer le seuil
        </button>
      </div>
    </div>
  </div>

  <!-- ── ÉTAPE 3 ─────────────────────────────────────────────────────── -->
  <div *ngIf="step === 2" class="step-content">

    <!-- Bouton explorateur de schéma -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <button nz-button nzType="default" nzSize="small" (click)="openSchemaExplorer()">
        <span nz-icon nzType="database"></span>
        Explorer le schéma PLaTon
      </button>
    </div>

    <!-- Recettes -->
    <div class="recipes">
      <div *ngFor="let r of recipes" class="recipe-wrapper">
        <button nz-button nzType="dashed" class="recipe-btn" (click)="applyRecipe(r)">
          <strong>{{ r.name }}</strong>
          <span>{{ r.desc }}</span>
        </button>
        <button nz-button nzType="text" class="recipe-eye-btn"
          (click)="openRecipeModal(r); $event.stopPropagation()">
          <span nz-icon nzType="eye" style="font-size:18px"></span>
        </button>
      </div>
    </div>

    <!-- Toggle Visuel / Import -->
    <div class="mode-toggle">
      <button nz-button nzSize="small"
        [nzType]="!showImport ? 'primary' : 'default'"
        (click)="enterVisualMode()">
        <span nz-icon nzType="eye"></span> Visuel
      </button>
      <button nz-button nzSize="small"
        [nzType]="showImport ? 'primary' : 'default'"
        (click)="enterImportMode()">
        <span nz-icon nzType="import"></span> Import
      </button>
    </div>

    <!-- Import YAML/JSON -->
    <ng-container *ngIf="showImport">
      <div class="import-panel">
        <div class="import-mode-toggle">
          <button nz-button nzSize="small"
            [nzType]="importMode === 'yaml' ? 'primary' : 'default'"
            (click)="setImportMode('yaml')">YAML</button>
          <button nz-button nzSize="small"
            [nzType]="importMode === 'json' ? 'primary' : 'default'"
            (click)="setImportMode('json')">JSON</button>
          <button nz-button nzSize="small" nzType="default"
            (click)="importDocsOpen = !importDocsOpen">
            <span nz-icon nzType="info-circle"></span>
            {{ importDocsOpen ? 'Masquer la référence ' + importMode.toUpperCase() : 'Référence ' + importMode.toUpperCase() }}
          </button>
          <label class="import-file-btn">
            <span nz-icon nzType="upload"></span> Fichier
            <input type="file" style="display:none" accept=".yaml,.yml,.json"
              (change)="onImportFileUpload($event)">
          </label>
        </div>
        <div *ngIf="importDocsOpen" class="import-docs"><pre>{{ importDocsText }}</pre></div>
        <textarea class="json-editor" [(ngModel)]="importText" rows="12" spellcheck="false" [placeholder]="importPlaceholder" (keydown)="onImportKeydown($event)"></textarea>
        <div *ngIf="importError" class="parse-error">
          <div class="parse-error-header">
            <mat-icon class="parse-error-icon">error_outline</mat-icon>
            <span class="parse-error-main">{{ importError.main }}</span>
          </div>
          <div *ngIf="importError.available?.length" class="parse-error-available">
            <span class="parse-error-label">
              {{ importError.availableLabel ?? 'Valeurs disponibles' }}
              <span *ngIf="importError.wrongValue" class="parse-error-clickable-hint">(cliquer pour corriger)</span>
              :
            </span>
            <div class="parse-error-tags">
              <button *ngFor="let v of importError.available; let i = index"
                [class.parse-error-tag]="true"
                [class.parse-error-tag--clickable]="!!importError.wrongValue"
                [disabled]="!importError.wrongValue"
                (click)="applySuggestion(v)">{{ (importError.availableDisplay?.[i]) ?? v }}</button>
            </div>
          </div>
        </div>
        <div class="import-actions">
          <button nz-button nzType="primary" nzSize="small" (click)="applyImport()">
            <span nz-icon nzType="check"></span> Appliquer
          </button>
          <button nz-button nzSize="small" (click)="showImport = false; importError = null">Annuler</button>
        </div>
      </div>
    </ng-container>

    <!-- Visuel -->
    <ng-container *ngIf="!showImport">
      <div class="pipeline" cdkDropList (cdkDropListDropped)="drop($event)">

        <div *ngIf="pipeline.length === 0" class="pipeline-empty">
          Aucune étape - choisissez une recette ou ajoutez manuellement.
        </div>

        <div *ngFor="let s of pipeline; let si = index; trackBy: trackStepById"
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
                (click)="removeStep(si)">
                <span nz-icon nzType="delete"></span>
              </button>
            </div>

            <div class="step-params">
              <ng-container *ngIf="s.type === 'fetch'">
                <div class="param-row">
                  <label>Table <mat-icon class="info-icon" nz-tooltip="Table PLaTon à interroger. 'SessionData' contient toutes les sessions d'exercices (user_id, activity_id, resource_id, grade, attempts, created_at)." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-select [(ngModel)]="s.table" style="width:220px"
                    nzPlaceHolder="Choisir une table" [nzLoading]="schemaLoading"
                    (ngModelChange)="s.contextFields = []">
                    <nz-option *ngFor="let t of platonSchema" [nzValue]="t.name" [nzLabel]="t.name"></nz-option>
                  </nz-select>
                </div>
                <div class="param-row">
                  <label>Requête groupe de TP <mat-icon class="info-icon" nz-tooltip="Activez pour filtrer automatiquement les lignes dont user_id appartient au groupe de TP sélectionné dans le contexte." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-switch [(ngModel)]="s.useGroupContext"
                    nzCheckedChildren="Groupe" nzUnCheckedChildren="Non"></nz-switch>
                </div>
                <div class="param-row">
                  <label>Filtrer par contexte <mat-icon class="info-icon" nz-tooltip="Colonnes filtrées automatiquement selon le contexte courant. Seules user_id, activity_id et course_id sont supportées." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-select [(ngModel)]="s.contextFields" nzMode="multiple" style="width:300px"
                    nzPlaceHolder="Colonnes de filtre" [nzDisabled]="!s.table">
                    <nz-option *ngFor="let f of contextFilterCols" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                  </nz-select>
                </div>
              </ng-container>
              <ng-container *ngIf="s.type === 'join'">
                <div class="param-row">
                  <label>Table à joindre <mat-icon class="info-icon" nz-tooltip="Table PLaTon dont les colonnes seront fusionnées avec les données courantes." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-select [(ngModel)]="s.joinTable" nzPlaceHolder="Choisir une table"
                    [nzLoading]="schemaLoading" (ngModelChange)="s.joinRightKey = undefined">
                    <nz-option *ngFor="let t of platonSchema" [nzValue]="t.name" [nzLabel]="t.name"></nz-option>
                  </nz-select>
                </div>
                <div class="param-row">
                  <label>Type de jointure <mat-icon class="info-icon" nz-tooltip="LEFT garde toutes les lignes courantes, INNER seulement les correspondances, RIGHT toutes les lignes jointes, FULL tout." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-select [(ngModel)]="s.joinType" style="width:260px" nzPlaceHolder="LEFT (par défaut)">
                    <nz-option nzValue="left"  nzLabel="LEFT - garder toutes les lignes courantes"></nz-option>
                    <nz-option nzValue="inner" nzLabel="INNER - seulement les correspondances"></nz-option>
                    <nz-option nzValue="right" nzLabel="RIGHT - garder toutes les lignes jointes"></nz-option>
                    <nz-option nzValue="full"  nzLabel="FULL - garder toutes les lignes des deux côtés"></nz-option>
                  </nz-select>
                </div>
                <div class="param-row">
                  <label>Filtrer par contexte <mat-icon class="info-icon" nz-tooltip="Colonnes de la table jointe filtrées selon le contexte courant." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-select [(ngModel)]="s.joinContextFields" nzMode="multiple"
                    nzPlaceHolder="Colonnes de filtre (optionnel)" [nzDisabled]="!s.joinTable">
                    <nz-option *ngFor="let f of contextFilterCols" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                  </nz-select>
                </div>
                <div class="param-row">
                  <label>Clé left <mat-icon class="info-icon" nz-tooltip="Colonne de la table courante servant de clé de jointure." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-select [(ngModel)]="s.joinLeftKey" nzPlaceHolder="Champ de la table left" nzAllowClear>
                    <nz-option *ngFor="let f of activeColumns()" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                  </nz-select>
                </div>
                <div class="param-row">
                  <label>Clé right <mat-icon class="info-icon" nz-tooltip="Colonne de la table à joindre correspondant à la clé left." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-select [(ngModel)]="s.joinRightKey" nzPlaceHolder="Champ de la table right"
                    nzAllowClear [nzDisabled]="!s.joinTable">
                    <nz-option *ngFor="let f of columnsForTable(s.joinTable)" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                  </nz-select>
                </div>
              </ng-container>
              <ng-container *ngIf="s.type === 'filter'">
                <div class="param-row">
                  <label>Champ <mat-icon class="info-icon" nz-tooltip="Colonne sur laquelle s'applique la condition de filtrage." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-select [(ngModel)]="s.filterField" style="width:180px">
                    <nz-option *ngFor="let f of activeColumns()" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
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
                  <label>Grouper par <mat-icon class="info-icon" nz-tooltip="Regroupe les lignes par valeur unique de cette colonne." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-select [(ngModel)]="s.groupField" style="width:200px">
                    <nz-option *ngFor="let f of activeColumns()" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                  </nz-select>
                </div>
              </ng-container>
              <ng-container *ngIf="s.type === 'findFirst'">
                <div class="param-row">
                  <label>Condition (champ) <mat-icon class="info-icon" nz-tooltip="Optionnel. Filtre les lignes du groupe où ce champ correspond à la valeur attendue." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-select [(ngModel)]="s.whereField" nzAllowClear style="width:180px">
                    <nz-option *ngFor="let f of activeColumns()" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                  </nz-select>
                </div>
                <div class="param-row" *ngIf="s.whereField">
                  <label>Valeur attendue</label>
                  <input nz-input [(ngModel)]="s.whereValue" style="width:120px" />
                </div>
                <div class="param-row">
                  <label>Trier par <mat-icon class="info-icon" nz-tooltip="Trie les lignes du groupe avant de prendre la première." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-select [(ngModel)]="s.sortField" nzAllowClear style="width:180px">
                    <nz-option *ngFor="let f of activeColumns()" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                  </nz-select>
                </div>
              </ng-container>
              <ng-container *ngIf="s.type === 'extract'">
                <div class="param-row">
                  <label>Champ à extraire <mat-icon class="info-icon" nz-tooltip="Colonne dont la valeur est extraite de chaque ligne. Produit un tableau de nombres." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-select [(ngModel)]="s.extractField" style="width:200px">
                    <nz-option *ngFor="let f of activeColumns()" [nzValue]="f.value" [nzLabel]="f.label"></nz-option>
                  </nz-select>
                </div>
              </ng-container>
              <ng-container *ngIf="s.type === 'aggregate'">
                <div class="param-row">
                  <label>Fonction <mat-icon class="info-icon" nz-tooltip="avg = moyenne, sum = somme, count = nombre, min = minimum, max = maximum." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-select [(ngModel)]="s.aggregateFn" style="width:200px">
                    <nz-option nzValue="avg"   nzLabel="avg - Moyenne"></nz-option>
                    <nz-option nzValue="sum"   nzLabel="sum - Somme"></nz-option>
                    <nz-option nzValue="count" nzLabel="count - Nombre"></nz-option>
                    <nz-option nzValue="min"   nzLabel="min - Minimum"></nz-option>
                    <nz-option nzValue="max"   nzLabel="max - Maximum"></nz-option>
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
                  <label>Diviser par <mat-icon class="info-icon" nz-tooltip="Ex : 60 pour convertir des secondes en minutes, 100 pour un pourcentage." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <nz-input-number [(ngModel)]="s.divideBy" [nzMin]="0.001" style="width:140px"></nz-input-number>
                </div>
              </ng-container>
              <ng-container *ngIf="s.type === 'js'">
                <div class="param-row param-row-col">
                  <label>Code JavaScript (input = sortie précédente) <mat-icon class="info-icon" nz-tooltip="Exécuté dans un sandbox Node.js. 'input' contient la sortie de l'étape précédente." nzTooltipPlacement="right">info_outline</mat-icon></label>
                  <textarea nz-input [(ngModel)]="s.jsCode" rows="6" class="code-textarea"
                    placeholder="// return Array.isArray(input) ? input.length : 0;"></textarea>
                </div>
              </ng-container>
            </div>
          </div>
        </div>

        <div *ngIf="pipeline.length > 0" class="connector">
          <span nz-icon nzType="arrow-down" style="color:#999"></span>
        </div>

        <div class="add-step-row">
          <button nz-button nzType="dashed" style="width:100%" (click)="openPicker()">
            <span nz-icon nzType="plus"></span> Ajouter une étape
          </button>
        </div>
      </div>

      <!-- Preview -->
      <nz-divider nzText="Tester cette formule"></nz-divider>
      <div class="preview-section">
        <div class="preview-inputs">
          <nz-select [(ngModel)]="previewCourseId" (ngModelChange)="onPreviewCourseChange($event)"
            nzPlaceHolder="Cours" nzShowSearch [nzLoading]="previewCoursesLoading" style="width:220px">
            <nz-option *ngFor="let c of previewCourses" [nzValue]="c.id" [nzLabel]="c.name"></nz-option>
          </nz-select>
          <nz-select [(ngModel)]="previewCtx.activityId" nzPlaceHolder="Activité (optionnel)"
            nzShowSearch nzAllowClear [nzLoading]="previewActivitiesLoading"
            [nzDisabled]="!previewCourseId" style="width:220px">
            <nz-option *ngFor="let a of previewActivities" [nzValue]="a.id" [nzLabel]="a.name"></nz-option>
          </nz-select>
          <nz-select [(ngModel)]="previewCtx.groupId" nzPlaceHolder="Groupe (optionnel)"
            nzShowSearch nzAllowClear [nzDisabled]="!previewCourseId" style="width:200px">
            <nz-option *ngFor="let g of previewGroups" [nzValue]="g.id" [nzLabel]="g.name"></nz-option>
          </nz-select>
          <nz-select [(ngModel)]="previewCtx.userId" nzPlaceHolder="Utilisateur (optionnel)"
            nzShowSearch nzAllowClear [nzLoading]="previewStudentsLoading"
            [nzDisabled]="!previewCourseId" style="width:220px">
            <nz-option *ngFor="let s of previewStudents" [nzValue]="s.id" [nzLabel]="s.name"></nz-option>
          </nz-select>
          <button nz-button nzType="primary" [nzLoading]="previewing" (click)="runPreview()">
            <span nz-icon nzType="experiment"></span> Tester
          </button>
          <button nz-button nzType="default" [nzLoading]="debugging" (click)="runDebug()" style="margin-left:8px">
            <span nz-icon nzType="bug"></span> Déboguer pas à pas
          </button>
        </div>
        <div *ngIf="previewResult" class="preview-result">
          Résultat : <strong>{{ previewResult }}</strong>
        </div>
        <div *ngIf="previewError" class="preview-error">{{ previewError }}</div>

        <!-- Debug pas à pas -->
        <div *ngIf="debugSteps.length" class="debug-panel">
          <div class="debug-panel-title"><span nz-icon nzType="bug"></span> Résultats par étape</div>
          <div class="debug-context">
            <strong>Contexte utilisé :</strong>
            userId={{ previewCtx.userId || '-' }} &nbsp;|&nbsp;
            activityId={{ previewCtx.activityId || '(TARGET_ACTIVITY_ID)' }} &nbsp;|&nbsp;
            groupId={{ previewCtx.groupId || '-' }} &nbsp;|&nbsp;
            courseId={{ previewCourseId || '-' }}
          </div>
          <div *ngFor="let s of debugSteps" class="debug-step" [class.debug-step-error]="s.error">
            <div class="debug-step-header">
              <span class="debug-step-index">#{{ s.index + 1 }}</span>
              <span class="debug-step-type" [style.background]="stepTypeColor(s.type)">{{ s.type }}</span>
              <span class="debug-step-duration">{{ s.durationMs }} ms</span>
              <span *ngIf="s.error" class="debug-step-error-badge">ERREUR</span>
              <span *ngIf="!s.error && s.output !== null">
                <ng-container *ngIf="isArray(s.output)">{{ s.output.length }} élément(s)</ng-container>
                <ng-container *ngIf="!isArray(s.output) && isObject(s.output)">objet</ng-container>
                <ng-container *ngIf="!isArray(s.output) && !isObject(s.output)">{{ s.output }}</ng-container>
              </span>
            </div>
            <pre *ngIf="s.error" class="debug-step-body debug-step-body-error">{{ s.error }}</pre>
            <ng-container *ngIf="!s.error && isArrayOfObjects(s.output)">
              <div class="debug-table-wrap">
                <table class="debug-table">
                  <thead><tr><th *ngFor="let col of getTableCols(s.output)">{{ col }}</th></tr></thead>
                  <tbody>
                    <tr *ngFor="let row of getTableRows(s.output, '' + s.index)">
                      <td *ngFor="let cell of row" [title]="cell">{{ cell }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div *ngIf="s.output.length > 5" class="debug-table-more">
                <ng-container *ngIf="!debugExpanded.has('' + s.index)">
                  {{ s.output.length - 5 }} ligne(s) masquée(s) -
                  <a (click)="toggleExpandStep('' + s.index)">Afficher tout ({{ s.output.length }})</a>
                </ng-container>
                <ng-container *ngIf="debugExpanded.has('' + s.index)">
                  {{ s.output.length }} lignes affichées -
                  <a (click)="toggleExpandStep('' + s.index)">Réduire</a>
                </ng-container>
              </div>
            </ng-container>
            <pre *ngIf="!s.error && !isArrayOfObjects(s.output)" class="debug-step-body">{{ formatStepOutput(s.output) }}</pre>
          </div>
        </div>
        <div *ngIf="debugError" class="preview-error">{{ debugError }}</div>
      </div>
    </ng-container>

  </div>

  <!-- ── Overlay sélection d'étape ──────────────────────────────────── -->
  <div *ngIf="showStepPicker" class="picker-overlay" (click)="showStepPicker = false">
    <div class="picker-panel" (click)="$event.stopPropagation()">
      <div class="picker-header">
        <strong>Choisir une étape</strong>
        <button nz-button nzType="text" nzSize="small" (click)="showStepPicker = false">✕</button>
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
        {{ isEditMode ? 'Enregistrer' : "Créer l'indicateur" }}
      </button>
    </div>
  </div>

</div>

<ng-template #recipeDetailTpl>
  <div style="padding:8px 4px;font-size:13px;line-height:1.7">

    <div style="margin-bottom:18px">
      <div style="font-weight:600;color:#1890ff;margin-bottom:6px;font-size:11px;text-transform:uppercase;letter-spacing:.6px">Objectif</div>
      <p style="margin:0;color:#333">{{ activeRecipeDetail?.detail?.objectif }}</p>
    </div>

    <div style="margin-bottom:18px">
      <div style="font-weight:600;color:#52c41a;margin-bottom:6px;font-size:11px;text-transform:uppercase;letter-spacing:.6px">Utilisation</div>
      <p style="margin:0;color:#333">{{ activeRecipeDetail?.detail?.utilisation }}</p>
    </div>

    <div style="margin-bottom:20px">
      <div style="font-weight:600;color:#fa8c16;margin-bottom:6px;font-size:11px;text-transform:uppercase;letter-spacing:.6px">Comment adapter</div>
      <p style="margin:0;color:#333">{{ activeRecipeDetail?.detail?.adapter }}</p>
    </div>

    <div style="border-top:1px solid #f0f0f0;padding-top:16px">
      <div style="font-weight:600;color:#595959;margin-bottom:10px;font-size:11px;text-transform:uppercase;letter-spacing:.6px">Pipeline - {{ activeRecipeDetail?.pipeline?.length }} étapes</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tbody>
          <tr *ngFor="let s of activeRecipeDetail?.pipeline; let i = index">
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;color:#bbb;width:24px">{{ i + 1 }}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;width:100px">
              <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff"
                [style.background]="stepTypeColor(s.type)">{{ s.type }}</span>
            </td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;color:#444">{{ s.label }}</td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
</ng-template>

<!-- ── Modal explorateur de schéma PLaTon ───────────────────────────────── -->
<ng-template #schemaExplorerTpl>
  <div class="schema-explorer">

    <!-- Sidebar gauche : liste des tables -->
    <aside class="schema-sidebar">
      <div class="schema-search">
        <input nz-input [(ngModel)]="schemaSearch" placeholder="Rechercher une table…" nzSize="small" />
      </div>
      <ul class="schema-table-list">
        <li *ngFor="let t of filteredSchemaTables"
            class="schema-table-item"
            [class.schema-table-active]="t.name === schemaSelected?.name"
            (click)="selectSchemaTable(t.name)">
          <span nz-icon nzType="table" style="margin-right:6px;opacity:.6"></span>
          {{ t.name }}
          <nz-badge *ngIf="schemaRelationsFor(t.name).length > 0"
            [nzCount]="schemaRelationsFor(t.name).length"
            nzSize="small"
            style="margin-left:auto">
          </nz-badge>
        </li>
      </ul>
    </aside>

    <!-- Zone principale -->
    <div class="schema-main" *ngIf="schemaSelected; else noTableSelected">

      <!-- En-tête table -->
      <div class="schema-table-header">
        <span nz-icon nzType="database" style="font-size:20px;color:#1890ff"></span>
        <h3>{{ schemaSelected.name }}</h3>
        <nz-tag nzColor="blue">{{ schemaSelected.columns.length }} colonnes</nz-tag>
        <nz-tag *ngIf="schemaFkOut(schemaSelected.name).length > 0" nzColor="orange">
          {{ schemaFkOut(schemaSelected.name).length }} FK sortantes
        </nz-tag>
        <nz-tag *ngIf="schemaFkIn(schemaSelected.name).length > 0" nzColor="green">
          {{ schemaFkIn(schemaSelected.name).length }} FK entrantes
        </nz-tag>
      </div>

      <!-- Onglets Vue graphique / Colonnes & relations -->
      <nz-tabs [(nzSelectedIndex)]="schemaViewTab" nzSize="small" style="margin-top:4px">

        <!-- ── Onglet 1 : Colonnes & relations ─────────── -->
        <nz-tab nzTitle="Colonnes & relations">
          <div class="schema-section">
            <table class="schema-col-table">
              <thead>
                <tr><th>Nom</th><th>Type</th><th>Nullable</th><th>Lien FK</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let col of schemaSelected.columns">
                  <td class="col-name">
                    <span *ngIf="isSchemaFkCol(schemaSelected.name, col.name)" class="fk-dot" nz-tooltip="Clé étrangère">🔗</span>
                    {{ col.name }}
                  </td>
                  <td class="col-type">{{ col.type }}</td>
                  <td class="col-null">
                    <span *ngIf="col.nullable" style="color:#fa8c16">nullable</span>
                    <span *ngIf="!col.nullable" style="color:#52c41a">NOT NULL</span>
                  </td>
                  <td class="col-fk">
                    <ng-container *ngFor="let rel of schemaFkForCol(schemaSelected.name, col.name)">
                      <span class="fk-link" (click)="selectSchemaTable(rel.targetTable)">
                        → {{ rel.targetTable }}.{{ rel.targetColumn }}
                      </span>
                    </ng-container>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="schema-section" *ngIf="schemaFkOut(schemaSelected.name).length > 0">
            <div class="schema-section-title"><span nz-icon nzType="arrow-right"></span> Références vers</div>
            <div class="schema-rel-list">
              <div *ngFor="let rel of schemaFkOut(schemaSelected.name)" class="schema-rel-item">
                <span class="rel-col">{{ rel.sourceColumn }}</span>
                <span class="rel-arrow">→</span>
                <span class="rel-table" (click)="selectSchemaTable(rel.targetTable)">{{ rel.targetTable }}</span>
                <span class="rel-col-target">.{{ rel.targetColumn }}</span>
              </div>
            </div>
          </div>
          <div class="schema-section" *ngIf="schemaFkIn(schemaSelected.name).length > 0">
            <div class="schema-section-title"><span nz-icon nzType="arrow-left"></span> Référencée par</div>
            <div class="schema-rel-list">
              <div *ngFor="let rel of schemaFkIn(schemaSelected.name)" class="schema-rel-item">
                <span class="rel-table" (click)="selectSchemaTable(rel.sourceTable)">{{ rel.sourceTable }}</span>
                <span class="rel-col-target">.{{ rel.sourceColumn }}</span>
                <span class="rel-arrow">→</span>
                <span class="rel-col">{{ rel.targetColumn }}</span>
              </div>
            </div>
          </div>
        </nz-tab>

        <!-- ── Onglet 2 : Vue graphique ────────────────── -->
        <nz-tab nzTitle="Vue graphique">
          <ng-container *ngIf="schemaDiagram as diag; else noRelations">
            <div class="diagram-container">
              <svg [attr.width]="diag.width" [attr.height]="diag.height" [attr.viewBox]="diag.viewBox">
                <defs>
                  <marker id="arrow-out" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="#1890ff"/>
                  </marker>
                  <marker id="arrow-in" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="#52c41a"/>
                  </marker>
                </defs>
                <g class="diag-edges">
                  <path *ngFor="let edge of diag.edges"
                    [attr.d]="edge.path"
                    [attr.stroke]="edge.isIncoming ? '#52c41a' : '#1890ff'"
                    stroke-width="1.5" fill="none" stroke-dasharray="5,3"
                    [attr.marker-end]="edge.isIncoming ? 'url(#arrow-in)' : 'url(#arrow-out)'">
                  </path>
                </g>
                <g *ngFor="let node of diag.nodes" class="diag-node"
                   [style.transform]="'translate(' + node.x + 'px,' + node.y + 'px)' + (hoveredDiagNode === node.name ? ' scale(1.03)' : '')"
                   (mouseenter)="hoveredDiagNode = node.name"
                   (mouseleave)="hoveredDiagNode = null"
                   (click)="selectSchemaTable(node.name)" style="cursor:pointer">
                  <rect [attr.width]="node.width" [attr.height]="node.height"
                    rx="6" ry="6"
                    [attr.fill]="node.isCenter ? '#e6f7ff' : '#fafafa'"
                    [attr.stroke]="node.isCenter ? '#1890ff' : '#d9d9d9'"
                    [attr.stroke-width]="node.isCenter ? 2 : 1">
                  </rect>
                  <rect [attr.width]="node.width" height="30" rx="6" ry="6"
                    [attr.fill]="node.isCenter ? '#1890ff' : (node.isIncoming ? '#52c41a' : '#8c8c8c')">
                  </rect>
                  <rect [attr.width]="node.width" y="16" height="14"
                    [attr.fill]="node.isCenter ? '#1890ff' : (node.isIncoming ? '#52c41a' : '#8c8c8c')">
                  </rect>
                  <text x="8" y="20" font-size="12" font-weight="700" fill="white" font-family="monospace">
                    {{ node.name.length > 22 ? node.name.slice(0, 21) + '…' : node.name }}
                  </text>
                  <g *ngFor="let col of node.columns; let ci = index">
                    <line x1="0" [attr.y1]="34 + ci * 22"
                          [attr.x2]="node.width" [attr.y2]="34 + ci * 22"
                          stroke="#f0f0f0" stroke-width="1">
                    </line>
                    <rect *ngIf="col.isFK" x="0" [attr.y]="34 + ci * 22"
                          [attr.width]="node.width" height="22" fill="#fff7e6" opacity="0.8">
                    </rect>
                    <text x="6" [attr.y]="34 + ci * 22 + 15" font-size="10"
                          [attr.fill]="col.isPK ? '#722ed1' : col.isFK ? '#fa8c16' : '#8c8c8c'">
                      {{ col.isPK ? '🔑' : col.isFK ? '🔗' : '·' }}
                    </text>
                    <text x="24" [attr.y]="34 + ci * 22 + 15" font-size="11" font-family="monospace"
                          [attr.fill]="col.isFK ? '#fa8c16' : '#262626'"
                          [attr.font-weight]="col.isPK ? '700' : '400'">
                      {{ col.name.length > 18 ? col.name.slice(0, 17) + '…' : col.name }}
                    </text>
                    <text [attr.x]="node.width - 4" [attr.y]="34 + ci * 22 + 15"
                          font-size="10" font-family="monospace" fill="#bbb" text-anchor="end">
                      {{ col.shortType }}
                    </text>
                  </g>
                </g>
              </svg>
            </div>
          </ng-container>
          <ng-template #noRelations>
            <div style="padding:24px;text-align:center;color:#bbb">
              <span nz-icon nzType="deployment-unit" style="font-size:32px"></span>
              <p style="margin-top:8px">Aucune relation FK pour cette table</p>
            </div>
          </ng-template>
        </nz-tab>

      </nz-tabs>

    </div>

    <ng-template #noTableSelected>
      <div class="schema-main schema-empty">
        <span nz-icon nzType="database" style="font-size:48px;color:#d9d9d9"></span>
        <p>Sélectionnez une table dans la liste</p>
      </div>
    </ng-template>

    <!-- Spinner chargement -->
    <div *ngIf="schemaLoading" class="schema-loading">
      <nz-spin nzSimple></nz-spin>
    </div>

  </div>
</ng-template>
  `,
  styles: [`
    .builder { padding: 4px 0; }
    .steps { margin-bottom: 8px; }
    .similar-searching { display:flex;align-items:center;gap:6px;font-size:12px;color:#8c8c8c;margin-top:6px; }
    .similar-banner {
      margin-top: 8px; border: 1px solid #faad14; border-radius: 6px;
      background: #fffbe6; overflow: hidden;
    }
    .similar-banner-header {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 12px; border-bottom: 1px solid #ffe58f;
      font-size: 13px; font-weight: 500; color: #ad6800;
    }
    .similar-banner-icon { font-size:16px;width:16px;height:16px;line-height:1;color:#faad14; }
    .similar-list { display:flex;flex-direction:column; }
    .similar-item {
      display:flex;align-items:center;justify-content:space-between;
      padding:6px 12px; border-bottom:1px solid #fff1b8; background:#fff;
    }
    .similar-item:last-child { border-bottom:none; }
    .similar-item-info { display:flex;align-items:center;gap:6px; }
    .similar-item-name { font-size:13px;font-weight:500;color:#262626; }
    .similar-voir-btn { display:inline-flex !important;align-items:center;gap:3px;padding:0 4px; }
    .similar-voir-btn mat-icon { font-size:14px;width:14px;height:14px;line-height:1; }
    .prev-card { border:1px solid #f0f0f0;border-radius:8px;overflow:hidden; }
    .prev-row {
      padding: 14px 16px;
      border-bottom: 1px solid #f0f0f0;
      background: #fff;
    }
    .prev-row--last { border-bottom: none; }
    .prev-row:nth-child(even) { background: #fafafa; }
    .prev-label {
      display: block; margin-bottom: 6px;
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .6px; color: #8c8c8c;
    }
    .prev-value { margin: 0; font-size: 13px; color: #262626; line-height: 1.5; }
    .prev-hint { font-style: italic; color: #595959; }
    .prev-empty { font-size: 13px; color: #8c8c8c; font-style: italic; }
    .prev-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .prev-meta { display: flex; gap: 0; padding: 0; }
    .prev-meta-cell { flex: 1; padding: 14px 16px; }
    .prev-meta-sep { border-left: 1px solid #f0f0f0; }
    .prev-vizs { display: flex; flex-wrap: wrap; gap: 6px; }
    .prev-viz-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 4px 10px; background: #f5f5f5; border-radius: 4px;
      font-size: 12px; color: #262626; border: 1px solid #e8e8e8;
    }
    .prev-viz-chip mat-icon { font-size: 14px; width: 14px; height: 14px; line-height: 1; }
    .prev-thresholds { display: flex; gap: 12px; flex-wrap: wrap; }
    .prev-threshold { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; padding: 4px 10px; border-radius: 4px; }
    .prev-threshold mat-icon { font-size: 15px; width: 15px; height: 15px; line-height: 1; }
    .prev-threshold--good  { background: #f6ffed; color: #389e0d; }
    .prev-threshold--warn  { background: #fffbe6; color: #d48806; }
    .prev-threshold--danger{ background: #fff2f0; color: #cf1322; }
    .step-clickable { cursor: pointer; }
    .step-clickable:hover ::ng-deep .ant-steps-item-icon { border-color: #1890ff; }
    .step-clickable:hover ::ng-deep .ant-steps-item-title { color: #1890ff; }
    .indicator-header {
      margin-top: 8px; padding: 6px 12px; border-radius: 4px;
      background: #f0f5ff; color: #2f54eb; font-weight: 500; font-size: 13px;
    }
    .step-content { min-height: 280px; }

    /* ── Layout horizontal pour les nz-form-item (via classes internes ng-zorro) ── */
    .step-content ::ng-deep .ant-form-item {
      display: flex !important;
      flex-wrap: nowrap !important;
      align-items: flex-start !important;
      margin-bottom: 14px !important;
    }
    .step-content ::ng-deep .ant-form-item-label {
      flex: 0 0 160px !important;
      width: 160px !important;
      max-width: 160px !important;
      overflow: visible;
      white-space: normal;
    }
    .step-content ::ng-deep .ant-form-item-control {
      flex: 1 1 0 !important;
      min-width: 0 !important;
      max-width: none !important;
    }

    .viz-list { display: flex; flex-direction: column; gap: 16px; padding: 8px 0; }
    .viz-row-card {
      border: 1px solid #e8e8e8;
      border-radius: 8px;
      padding: 16px;
      background: #fafafa;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .viz-row-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e8e8e8;
    }
    .viz-index {
      width: 24px; height: 24px; border-radius: 50%; background: #1890ff; color: white;
      display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0;
    }
    .viz-label-input { flex: 1; }
    .viz-fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px 12px;
      margin-bottom: 12px;
      padding: 12px 0;
      align-items: start;
    }
    @media (min-width: 1200px) {
      .viz-fields {
        grid-template-columns: 1fr 1fr 1fr 1fr;
      }
      .viz-field-type { grid-column: 1 / 2 !important; }
      .viz-field-icon { grid-column: 2 / 3 !important; }
      .viz-field-color { grid-column: 3 / 4 !important; }
      .viz-field-unit { grid-column: 4 / 5 !important; }
    }
    /* Layout vertical pour les items de viz-fields (label au-dessus du champ) */
    .viz-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-start;
      align-self: start;
    }

    .viz-field label {
      font-size: 12px;
      font-weight: 500;
      color: #262626;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .viz-field nz-select,
    .viz-field nz-color-picker,
    .viz-field input[nz-input] {
      width: 100%;
    }

    .viz-field-icon { position: relative; }

    .icon-picker {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 6px;
      background: #fff;
      border: 1px solid #d9d9d9;
      border-radius: 4px;
      width: 100%;
      box-sizing: border-box;
    }

    .icon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
      gap: 4px;
      width: 100%;
    }

    .icon-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 2px solid #d9d9d9;
      border-radius: 3px;
      background: #fff;
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    .icon-button:hover {
      border-color: #1890ff;
      background: #f0f5ff;
    }
    .icon-button.selected {
      border-color: #1890ff;
      background: #e6f7ff;
      font-weight: bold;
    }
    .icon-button mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      color: #595959;
    }
    .icon-button.selected mat-icon {
      color: #1890ff;
    }

    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 4px;
      vertical-align: middle;
      flex-shrink: 0;
    }
    .dot-green  { background: #52c41a; }
    .dot-orange { background: #fa8c16; }
    .dot-red    { background: #ff4d4f; }

    .global-threshold-section {
      padding: 4px 0 8px;
    }
    .global-threshold-section .section-label {
      font-size: 13px;
      font-weight: 500;
      color: #444;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .threshold-row {
      display: flex;
      align-items: center;
      gap: 24px;
      flex-wrap: wrap;
      overflow: visible;
    }

    .threshold-item {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 1 auto;
      min-width: fit-content;
      white-space: nowrap;
      overflow: visible;
    }
    .threshold-item label {
      font-size: 12px;
      color: #666;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .threshold-item nz-input-number {
      width: 75px;
      flex-shrink: 0;
    }
    .threshold-item nz-input-number ::ng-deep input {
      font-size: 12px;
      padding: 2px 6px !important;
    }
    .threshold-item .info-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      margin-left: 2px;
      flex-shrink: 0;
      overflow: visible;
    }

    .recipes { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
    .recipe-wrapper { display: flex; align-items: stretch; }
    .recipe-btn { display: flex; flex-direction: column; align-items: flex-start; height: auto; padding: 6px 12px; border-right: none; border-radius: 6px 0 0 6px; }
    .recipe-btn strong { font-size: 13px; }
    .recipe-btn span   { font-size: 11px; color: #888; }
    .recipe-eye-btn { border-left: 1px dashed #d9d9d9; border-radius: 0 6px 6px 0; padding: 0 12px; color: #999; min-width: 42px; }
    .recipe-eye-btn:hover { color: #1890ff; background: #e6f7ff; }

    .mode-toggle { display: flex; gap: 4px; margin-bottom: 10px; justify-content: flex-end; }

    .json-editor {
      width: 100%; font-family: monospace; font-size: 12px;
      border-radius: 6px; background: #1e1e1e; color: #d4d4d4;
      border: 1px solid #333; padding: 12px; resize: vertical;
    }
    .parse-error {
      margin-top: 8px;
      padding: 10px 12px;
      background: #fff2f0;
      border: 1px solid #ffccc7;
      border-radius: 6px;
    }
    .parse-error-header {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .parse-error-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      line-height: 1;
      color: #ff4d4f;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .parse-error-main {
      font-size: 12px;
      color: #a8071a;
      line-height: 1.5;
    }
    .parse-error-available {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #ffccc7;
    }
    .parse-error-label {
      font-size: 11px;
      font-weight: 600;
      color: #8c8c8c;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      display: block;
      margin-bottom: 6px;
    }
    .parse-error-clickable-hint {
      font-weight: 400;
      font-size: 10px;
      color: #aaa;
      text-transform: none;
      letter-spacing: 0;
      margin-left: 4px;
    }
    .parse-error-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .parse-error-tag {
      font-size: 11px;
      font-family: 'SFMono-Regular', Consolas, monospace;
      background: #fff;
      border: 1px solid #ffa39e;
      border-radius: 3px;
      padding: 2px 7px;
      color: #cf1322;
      white-space: nowrap;
      cursor: default;
      line-height: 1.4;
    }
    .parse-error-tag--clickable {
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .parse-error-tag--clickable:hover {
      background: #cf1322;
      border-color: #cf1322;
      color: #fff;
    }

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
    .param-row nz-select,
    .param-row nz-input-number,
    .param-row input[nz-input] { flex: 1; min-width: 0; width: auto !important; }
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

    .debug-panel { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
    .debug-panel-title { font-size: 13px; font-weight: 600; color: #595959; display: flex; align-items: center; gap: 6px; }
    .debug-context { font-size: 11px; color: #8c8c8c; padding: 4px 8px; background: #fafafa; border-radius: 4px; border: 1px solid #f0f0f0; font-family: monospace; }
    .debug-step { border: 1px solid #d9d9d9; border-radius: 6px; overflow: hidden; }
    .debug-step-error { border-color: #ff4d4f; }
    .debug-step-header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #fafafa; font-size: 12px; }
    .debug-step-index { font-weight: 700; color: #595959; min-width: 20px; }
    .debug-step-type { color: #fff; padding: 1px 7px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .debug-step-duration { color: #8c8c8c; margin-left: auto; }
    .debug-step-error-badge { color: #ff4d4f; font-weight: 700; font-size: 11px; }
    .debug-step-body { margin: 0; padding: 8px 10px; font-size: 11px; font-family: monospace; background: #fff; white-space: pre-wrap; word-break: break-all; max-height: 180px; overflow-y: auto; border-top: 1px solid #f0f0f0; }
    .debug-step-body-error { color: #ff4d4f; }
    .debug-table-wrap { overflow-x: auto; border-top: 1px solid #f0f0f0; max-height: 220px; overflow-y: auto; }
    .debug-table { border-collapse: collapse; font-size: 11px; font-family: monospace; width: max-content; min-width: 100%; }
    .debug-table th { background: #f5f5f5; padding: 4px 8px; border: 1px solid #e8e8e8; font-weight: 600; white-space: nowrap; position: sticky; top: 0; }
    .debug-table td { padding: 3px 8px; border: 1px solid #f0f0f0; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .debug-table tr:nth-child(even) td { background: #fafafa; }
    .debug-table-more { font-size: 11px; color: #8c8c8c; padding: 4px 10px; background: #fafafa; border-top: 1px solid #f0f0f0; }
    .debug-table-more a { color: #1890ff; cursor: pointer; text-decoration: underline; }

    .nav-actions { display: flex; justify-content: space-between; }
    .nav-right   { display: flex; gap: 8px; }

    .info-icon {
      font-size: 14px !important; height: 14px; width: 14px; line-height: 1 !important;
      color: #8c8c8c; cursor: help; margin-left: 4px; vertical-align: middle;
      transition: color .15s;
    }
    .info-icon:hover { color: #1890ff; }

    .import-panel-toggle { margin-bottom: 10px; }
    .import-panel {
      background: #f8f9fa; border: 1px solid #d9d9d9; border-radius: 8px;
      padding: 14px 16px; margin-bottom: 16px;
    }
    .import-mode-toggle { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; align-items: center; }
    .import-file-btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 0 8px; height: 24px;
      border: 1px dashed #d9d9d9; border-radius: 4px; font-size: 12px;
      cursor: pointer; color: #595959; background: #fff;
    }
    .import-file-btn:hover { border-color: #1890ff; color: #1890ff; }
    .import-docs {
      background: #1e1e1e; color: #d4d4d4; border-radius: 6px;
      padding: 10px 14px; font-size: 11px; font-family: monospace;
      margin-bottom: 10px; max-height: 200px; overflow-y: auto;
    }
    .import-docs pre { margin: 0; white-space: pre; }
    .import-actions { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
    .import-hint { font-size: 11px; color: #8c8c8c; }

    /* ── Explorateur de schéma ────────────────────────────────────────────── */
    .schema-explorer {
      display: flex;
      height: calc(95vh - 55px);
      overflow: hidden;
      position: relative;
    }
    .schema-sidebar {
      width: 220px;
      flex-shrink: 0;
      border-right: 1px solid #f0f0f0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .schema-search {
      padding: 8px;
      border-bottom: 1px solid #f0f0f0;
    }
    .schema-table-list {
      list-style: none;
      margin: 0;
      padding: 4px 0;
      overflow-y: auto;
      flex: 1;
    }
    .schema-table-item {
      display: flex;
      align-items: center;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
      border-left: 3px solid transparent;
      transition: all 0.15s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .schema-table-item:hover { background: #f5f5f5; }
    .schema-table-active {
      background: #e6f7ff !important;
      border-left-color: #1890ff !important;
      color: #1890ff;
      font-weight: 600;
    }
    .schema-main {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }
    .schema-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #bbb;
      gap: 12px;
    }
    .schema-table-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
    }
    .schema-table-header h3 { margin: 0; font-size: 18px; font-weight: 700; }
    .schema-section { margin-bottom: 20px; }
    .schema-section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #8c8c8c;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .schema-col-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .schema-col-table th {
      padding: 6px 8px;
      background: #fafafa;
      border: 1px solid #f0f0f0;
      font-weight: 600;
      color: #666;
      text-align: left;
    }
    .schema-col-table td {
      padding: 5px 8px;
      border: 1px solid #f0f0f0;
      vertical-align: middle;
    }
    .col-name { font-family: monospace; font-weight: 500; }
    .col-type { font-family: monospace; color: #722ed1; font-size: 11px; }
    .fk-dot { margin-right: 4px; cursor: help; }
    .fk-link {
      display: inline-block;
      font-size: 11px;
      color: #1890ff;
      cursor: pointer;
      background: #e6f7ff;
      padding: 1px 6px;
      border-radius: 3px;
    }
    .fk-link:hover { background: #bae7ff; }
    .schema-rel-list { display: flex; flex-direction: column; gap: 4px; }
    .schema-rel-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      padding: 4px 8px;
      background: #fafafa;
      border-radius: 4px;
      border: 1px solid #f0f0f0;
    }
    .rel-col { font-family: monospace; font-weight: 600; color: #262626; }
    .rel-col-target { font-family: monospace; color: #595959; }
    .rel-arrow { color: #8c8c8c; }
    .rel-table {
      font-family: monospace;
      font-weight: 600;
      color: #1890ff;
      cursor: pointer;
      text-decoration: underline dotted;
    }
    .rel-table:hover { color: #096dd9; }
    .schema-loading {
      position: absolute;
      inset: 0;
      background: rgba(255,255,255,.7);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .diagram-container {
      overflow: auto;
      border: 1px solid #f0f0f0;
      border-radius: 6px;
      background: #fafafa;
      max-height: calc(90vh - 160px);
    }
    .diagram-container svg { display: block; overflow: visible; }
    .diag-node { transition: transform 0.2s ease; transform-box: fill-box; transform-origin: 50% 50%; }
  `],
})
export class IndicatorBuilderComponent implements OnInit, AfterViewInit {
  private readonly modalRef     = inject(NzModalRef);
  private readonly modalSvc     = inject(NzModalService);
  @ViewChild('recipeDetailTpl')   private recipeDetailTplRef!: TemplateRef<any>;
  @ViewChild('schemaExplorerTpl') private schemaExplorerTplRef!: TemplateRef<any>;
  private readonly hostEl = inject(ElementRef);
  private readonly modalData    = inject(NZ_MODAL_DATA, { optional: true }) as {
    indicator?: IndicatorDefinition;
    circlePreset?: IndicatorCirclePreset;
    circleQueue?: IndicatorScope[];
  } | null;
  private readonly indicatorSvc = inject(IndicatorService);
  private readonly messageSvc   = inject(NzMessageService);
  private readonly cdr          = inject(ChangeDetectorRef);

  get isEditMode(): boolean { return !!this.modalData?.indicator; }

  /** Texte de progression affiché dans le header quand ce builder fait partie d'un cercle. */
  get circleProgress(): string | null {
    const preset = this.modalData?.circlePreset;
    if (!preset) return null;
    const remaining = this.modalData?.circleQueue?.length ?? 0;
    const total = remaining + 1;
    const current = total - remaining;
    return `Cercle « ${preset.circleName} » - contexte ${current}/${total} (${CONTEXT_LABELS[preset.contextType]})`;
  }

  step = 0;
  saving = false;
  activeVizIndex = 0;

  // ── Détection de doublons ─────────────────────────────────────────────────
  private readonly nameSearch$ = new Subject<string>();
  similarIndicators: IndicatorDefinition[] = [];
  similarSearching = false;
  previewIndicator: IndicatorDefinition | null = null;
  previewModalVisible = false;

  // Pipeline unique de l'indicateur
  pipeline: PipelineStep[] = [];

  // Picker d'étape
  showStepPicker = false;

  // Preview
  previewing = false;
  previewResult = '';
  previewError = '';

  // Debug pas à pas
  debugging = false;
  debugSteps: import('../../core/models/indicator.model').StepDebugResult[] = [];
  debugError = '';
  debugExpanded = new Set<string>();

  // Import YAML/JSON
  showImport = false;
  importMode: 'yaml' | 'json' = 'yaml';
  importText = '';
  importError: ImportErrorDisplay | null = null;
  importDocsOpen = false;

  get importPlaceholder(): string {
    return this.importMode === 'yaml'
      ? '# pipeline:\n#   - type: fetch\n#     label: "..."'
      : '{ "pipeline": [ { "type": "fetch", "label": "...", "params": {} } ] }';
  }

  get importDocsText(): string {
    return `╔══════════════════════════════════════════════════════════════════╗
║   RÉFÉRENCE COMPLÈTE - Format ${this.importMode.toUpperCase().padEnd(4)} - Pipeline DSL           ║
╚══════════════════════════════════════════════════════════════════╝

${this.importMode === 'yaml' ? `STRUCTURE DE BASE
─────────────────
pipeline:
  - type: <type>      # obligatoire - nom technique de l'étape (voir liste ci-dessous)
    label: "..."      # optionnel  - nom affiché dans le builder (généré auto si absent)
    params:           # obligatoire - paramètres propres à chaque type
      ...` : `{
  "pipeline": [
    {
      "type": "<type>",    // obligatoire - nom technique (voir liste ci-dessous)
      "label": "...",      // optionnel  - affiché dans le builder (généré auto si absent)
      "params": { ... }    // obligatoire - paramètres propres à chaque type
    }
  ]
}`}

══════════════════════════════════════════════════════════════════
  TYPES D'ÉTAPES DISPONIBLES
══════════════════════════════════════════════════════════════════

┌─ fetch ─────────────────────────────────────────────────────────
│  Charge des lignes depuis une table PLaTon.
│  C'est toujours la 1ère étape d'un pipeline.
${this.importMode === 'yaml' ? `│
│  params:
│    table: SessionData          # NOM EXACT de la table (liste ci-bas)
│    contextFields:              # colonnes filtrées automatiquement selon le contexte
│      - user_id                 #   → filtre sur l'apprenant courant
│      - activity_id             #   → filtre sur l'activité sélectionnée
│      - group_id                #   → filtre sur les membres du groupe de TP` : `│
│  "params": {
│    "table": "SessionData",
│    "contextFields": ["user_id", "activity_id"]
│  }`}
│
│  Tables disponibles :
│    SessionData       → sessions d'exercices (grade, attempts, created_at,
│                         user_id, activity_id, resource_id)
│    Activities        → activités (id, source, course_id, open_at, close_at)
│    Courses           → cours (id, name, owner_id)
│    CourseGroups      → groupes de TP (id, name, course_id)
│    CourseGroupsMember→ membres des groupes (group_id, user_id)
│    CourseMembers     → membres d'un cours (course_id, user_id, role)
│    Resources         → ressources (id, name, type)
│    Users             → utilisateurs (id, first_name, last_name)

┌─ join ──────────────────────────────────────────────────────────
│  Fusionne les données courantes avec une 2ème table.
│  joinType (optionnel, défaut "left") :
│    left  → garde toutes les lignes courantes
│    inner → garde uniquement les correspondances
│    right → garde toutes les lignes de la table jointe
│    full  → garde toutes les lignes des deux côtés
${this.importMode === 'yaml' ? `│
│  params:
│    table: Activities           # table à joindre
│    contextFields: []           # filtres contexte sur cette table (optionnel)
│    leftKey: activity_id        # colonne dans les données courantes
│    rightKey: id                # colonne correspondante dans la 2ème table
│    joinType: left              # left | inner | right | full (optionnel)` : `│
│  "params": {
│    "table": "Activities",
│    "contextFields": [],
│    "leftKey": "activity_id",
│    "rightKey": "id",
│    "joinType": "left"
│  }`}

┌─ filter ────────────────────────────────────────────────────────
│  Garde uniquement les lignes qui respectent une condition.
${this.importMode === 'yaml' ? `│
│  params:
│    field: grade                # colonne à tester
│    operator: ">="              # opérateurs : ==  !=  >  <  >=  <=
│    value: 100                  # valeur de comparaison (nombre ou texte)` : `│
│  "params": {
│    "field": "grade",
│    "operator": ">=",
│    "value": 100
│  }`}

┌─ groupBy ───────────────────────────────────────────────────────
│  Regroupe les lignes par valeur d'une colonne.
│  → produit un tableau de groupes, à utiliser avant findFirst.
${this.importMode === 'yaml' ? `│
│  params:
│    groupField: resource_id     # colonne de regroupement` : `│
│  "params": { "groupField": "resource_id" }`}

┌─ findFirst ─────────────────────────────────────────────────────
│  Dans chaque groupe, prend la 1ère ligne (après tri optionnel).
${this.importMode === 'yaml' ? `│
│  params:
│    whereField: grade           # (optionnel) colonne de filtrage dans le groupe
│    whereValue: 100             # valeur attendue pour whereField
│    sortField: created_at       # (optionnel) trie avant de prendre le 1er` : `│
│  "params": {
│    "whereField": "grade",
│    "whereValue": 100,
│    "sortField": "created_at"
│  }`}

┌─ extract ───────────────────────────────────────────────────────
│  Extrait la valeur d'une colonne de chaque ligne.
│  → produit un tableau de valeurs (nombres), prêt pour aggregate.
${this.importMode === 'yaml' ? `│
│  params:
│    extractField: attempts      # colonne à extraire` : `│
│  "params": { "extractField": "attempts" }`}

┌─ aggregate ─────────────────────────────────────────────────────
│  Calcule une valeur unique à partir du tableau.
${this.importMode === 'yaml' ? `│
│  params:
│    aggregateFn: avg            # avg=moyenne  sum=somme  count=nombre
│                                # min=minimum  max=maximum` : `│
│  "params": { "aggregateFn": "avg" }
│  // aggregateFn: avg | sum | count | min | max`}

┌─ round ─────────────────────────────────────────────────────────
│  Arrondit le résultat numérique final.
${this.importMode === 'yaml' ? `│
│  params:
│    decimals: 2                 # 0=entier  1=1 décimale  2=2 décimales` : `│  "params": { "decimals": 2 }`}

┌─ divide ────────────────────────────────────────────────────────
│  Divise le résultat par une constante.
${this.importMode === 'yaml' ? `│
│  params:
│    divideBy: 60                # ex: 60=secondes→minutes, 100=proportion→%` : `│  "params": { "divideBy": 60 }`}

┌─ js ────────────────────────────────────────────────────────────
│  Calcul personnalisé en JavaScript.
│  La variable "input" contient la sortie de l'étape précédente.
│  Utiliser "return", pas "result =".
${this.importMode === 'yaml' ? `│
│  params:
│    code: |
│      // input = tableau ou valeur de l'étape précédente
│      return Array.isArray(input) ? input.length : 0;` : `│
│  "params": {
│    "code": "return Array.isArray(input) ? input.length : 0;"
│  }`}

══════════════════════════════════════════════════════════════════
  EXEMPLE COMPLET - Note moyenne d'un apprenant
══════════════════════════════════════════════════════════════════
${this.importMode === 'yaml' ? `pipeline:
  - type: fetch
    params:
      table: SessionData
      contextFields: [user_id, activity_id]
  - type: extract
    params:
      extractField: grade
  - type: aggregate
    params:
      aggregateFn: avg
  - type: round
    params:
      decimals: 1` : `{
  "pipeline": [
    { "type": "fetch",     "params": { "table": "SessionData", "contextFields": ["user_id","activity_id"] } },
    { "type": "extract",   "params": { "extractField": "grade" } },
    { "type": "aggregate", "params": { "aggregateFn": "avg" } },
    { "type": "round",     "params": { "decimals": 1 } }
  ]
}`}`;
  }
  previewCtx = {
    userId:     getCurrentUserId() || '',
    groupId:    '',
    activityId: '',
  };

  availableEventTypes: { name: string; label: string }[] = [];

  // Label-picker du panneau de test : sélection en cascade Cours → Groupe/Activité/Utilisateur
  previewCourseId: string | null = null;
  previewCourses: TeacherCourse[] = [];
  previewCoursesLoading = false;
  previewActivities: CourseActivity[] = [];
  previewActivitiesLoading = false;
  previewStudents: { id: string; name: string }[] = [];
  previewStudentsLoading = false;

  // ── Explorateur de schéma PLaTon ─────────────────────────────────────────
  private schemaFull: {
    tables: { name: string; columns: { name: string; type: string; nullable: boolean }[] }[];
    relations: { sourceTable: string; sourceColumn: string; targetTable: string; targetColumn: string }[];
  } | null = null;

  schemaSearch = '';
  schemaSelected: { name: string; columns: { name: string; type: string; nullable: boolean }[] } | null = null;

  get filteredSchemaTables() {
    const q = this.schemaSearch.toLowerCase();
    return (this.schemaFull?.tables ?? []).filter(t => t.name.toLowerCase().includes(q));
  }

  selectSchemaTable(name: string): void {
    this.schemaSelected = this.schemaFull?.tables.find(t => t.name === name) ?? null;
  }

  schemaRelationsFor(tableName: string) {
    if (!this.schemaFull) return [];
    return this.schemaFull.relations.filter(
      r => r.sourceTable === tableName || r.targetTable === tableName,
    );
  }

  schemaFkOut(tableName: string) {
    return this.schemaFull?.relations.filter(r => r.sourceTable === tableName) ?? [];
  }

  schemaFkIn(tableName: string) {
    return this.schemaFull?.relations.filter(r => r.targetTable === tableName) ?? [];
  }

  schemaFkForCol(tableName: string, colName: string) {
    return this.schemaFull?.relations.filter(
      r => r.sourceTable === tableName && r.sourceColumn === colName,
    ) ?? [];
  }

  isSchemaFkCol(tableName: string, colName: string): boolean {
    return this.schemaFkForCol(tableName, colName).length > 0;
  }

  schemaViewTab = 0;
  hoveredDiagNode: string | null = null;

  get schemaDiagram() {
    if (!this.schemaSelected || !this.schemaFull) return null;

    const NODE_W   = 210;
    const ROW_H    = 22;
    const HEADER_H = 32;
    const GAP_X    = 130;
    const GAP_Y    = 16;
    const PAD      = 24;
    const MAX_COLS = 12;

    type DiagCol  = { name: string; isFK: boolean; isPK: boolean; shortType: string };
    type DiagNode = { name: string; x: number; y: number; width: number; height: number; columns: DiagCol[]; isCenter: boolean; isIncoming: boolean };
    type DiagEdge = { path: string; isIncoming: boolean };

    const fkOut = this.schemaFkOut(this.schemaSelected.name);
    const fkIn  = this.schemaFkIn(this.schemaSelected.name);

    const center = this.schemaSelected.name;
    const outTables = [...new Set(fkOut.map(r => r.targetTable))].filter(t => t !== center);
    const inTables  = [...new Set(fkIn.map(r => r.sourceTable))].filter(t => t !== center);
    const selfRels  = fkOut.filter(r => r.targetTable === center);

    const shortType = (t: string) => {
      if (t.includes('character') || t === 'text') return 'varchar';
      if (t.includes('timestamp')) return 'ts';
      if (t === 'double precision') return 'float';
      if (t === 'boolean') return 'bool';
      return t.slice(0, 7);
    };

    const getTableCols = (name: string): DiagCol[] => {
      const raw = this.schemaFull!.tables.find(t => t.name === name)?.columns ?? [];
      return raw.slice(0, MAX_COLS).map(c => ({
        name: c.name,
        isFK: this.isSchemaFkCol(name, c.name),
        isPK: c.name === 'id',
        shortType: shortType(c.type),
      }));
    };

    const nodeH = (cols: DiagCol[]) => HEADER_H + cols.length * ROW_H + 6;

    const centerCols = getTableCols(this.schemaSelected.name);
    const centerH    = nodeH(centerCols);

    const outColSets = outTables.map(t => getTableCols(t));
    const inColSets  = inTables.map(t => getTableCols(t));
    const outHeights = outColSets.map(c => nodeH(c));
    const inHeights  = inColSets.map(c => nodeH(c));

    const totalOutH = outHeights.reduce((s, h) => s + h + GAP_Y, -GAP_Y);
    const totalInH  = inHeights.reduce((s, h) => s + h + GAP_Y, -GAP_Y);
    const totalH    = Math.max(centerH, totalOutH, totalInH, 50);

    const hasLeft = inTables.length > 0;
    const hasRight = outTables.length > 0;

    const centerX = PAD + (hasLeft ? NODE_W + GAP_X : 0);
    const centerY = PAD + Math.max(0, (totalH - centerH) / 2);

    const nodes: DiagNode[] = [];
    const edges: DiagEdge[] = [];

    // Centre
    nodes.push({ name: this.schemaSelected.name, x: centerX, y: centerY, width: NODE_W, height: centerH, columns: centerCols, isCenter: true, isIncoming: false });

    // Boucles auto-référentielles (ex: Sessions.parent_id → Sessions.id)
    const LOOP = 60;
    selfRels.forEach(rel => {
      const si = centerCols.findIndex(c => c.name === rel.sourceColumn);
      const ti = centerCols.findIndex(c => c.name === rel.targetColumn);
      if (si < 0 || ti < 0) return;
      const sx = centerX + NODE_W, sy = centerY + HEADER_H + si * ROW_H + ROW_H / 2;
      const tx = centerX + NODE_W, ty = centerY + HEADER_H + ti * ROW_H + ROW_H / 2;
      edges.push({
        path: `M ${sx} ${sy} C ${sx + LOOP} ${sy}, ${sx + LOOP} ${ty}, ${tx} ${ty}`,
        isIncoming: false,
      });
    });

    // Tables à droite (FK sortantes)
    const rightX = centerX + NODE_W + GAP_X;
    let ry = PAD + Math.max(0, (totalH - totalOutH) / 2);
    outTables.forEach((tname, i) => {
      const cols = outColSets[i];
      const h    = outHeights[i];
      nodes.push({ name: tname, x: rightX, y: ry, width: NODE_W, height: h, columns: cols, isCenter: false, isIncoming: false });

      fkOut.filter(r => r.targetTable === tname).forEach(rel => {
        const si = centerCols.findIndex(c => c.name === rel.sourceColumn);
        const ti = cols.findIndex(c => c.name === rel.targetColumn);
        if (si < 0 || ti < 0) return;
        const sx = centerX + NODE_W, sy = centerY + HEADER_H + si * ROW_H + ROW_H / 2;
        const tx = rightX,           ty = ry    + HEADER_H + ti * ROW_H + ROW_H / 2;
        const cx = sx + GAP_X * 0.45, dx = tx - GAP_X * 0.45;
        edges.push({ path: `M ${sx} ${sy} C ${cx} ${sy}, ${dx} ${ty}, ${tx} ${ty}`, isIncoming: false });
      });
      ry += h + GAP_Y;
    });

    // Tables à gauche (FK entrantes)
    const leftX = PAD;
    let ly = PAD + Math.max(0, (totalH - totalInH) / 2);
    inTables.forEach((tname, i) => {
      const cols = inColSets[i];
      const h    = inHeights[i];
      nodes.push({ name: tname, x: leftX, y: ly, width: NODE_W, height: h, columns: cols, isCenter: false, isIncoming: true });

      fkIn.filter(r => r.sourceTable === tname).forEach(rel => {
        const si = cols.findIndex(c => c.name === rel.sourceColumn);
        const ti = centerCols.findIndex(c => c.name === rel.targetColumn);
        if (si < 0 || ti < 0) return;
        const sx = leftX + NODE_W, sy = ly      + HEADER_H + si * ROW_H + ROW_H / 2;
        const tx = centerX,        ty = centerY + HEADER_H + ti * ROW_H + ROW_H / 2;
        const cx = sx + GAP_X * 0.45, dx = tx - GAP_X * 0.45;
        edges.push({ path: `M ${sx} ${sy} C ${cx} ${sy}, ${dx} ${ty}, ${tx} ${ty}`, isIncoming: true });
      });
      ly += h + GAP_Y;
    });

    const totalW = PAD + (hasLeft ? NODE_W + GAP_X : 0) + NODE_W + (hasRight ? GAP_X + NODE_W : 0) + PAD;
    const svgH   = totalH + PAD * 2;

    return { nodes, edges, width: totalW, height: svgH, viewBox: `0 0 ${totalW} ${svgH}` };
  }

  openSchemaExplorer(): void {
    const openModal = () => {
      this.modalSvc.create({
        nzTitle: 'Schéma PLaTon - Tables et relations',
        nzContent: this.schemaExplorerTplRef,
        nzWidth: '95vw',
        nzFooter: null,
        nzCentered: true,
        nzStyle: { 'max-height': '95vh', 'overflow': 'hidden' },
        nzBodyStyle: { padding: '0', overflow: 'hidden' },
      });
    };

    if (this.schemaFull) { openModal(); return; }

    this.schemaLoading = true;
    this.indicatorSvc.getFullSchema().subscribe({
      next: data => {
        this.schemaFull = data;
        this.schemaLoading = false;
        this.cdr.detectChanges();
        openModal();
      },
      error: () => { this.schemaLoading = false; },
    });
  }

  get previewGroups(): { id: string; name: string }[] {
    return this.previewCourses.find(c => c.id === this.previewCourseId)?.groups ?? [];
  }

  readonly stepCatalog = STEP_CATALOG;
  readonly recipes     = FORMULA_RECIPES;
  activeRecipeDetail: (typeof FORMULA_RECIPES)[number] | null = null;
  readonly contextFilterCols = [
    { value: 'user_id',     label: 'user_id - apprenant courant' },
    { value: 'activity_id', label: 'activity_id - activité sélectionnée' },
    { value: 'course_id',   label: 'course_id - cours sélectionné' },
  ];
  readonly availableIcons = [
    'trending_up', 'trending_down', 'star', 'repeat', 'check_circle',
    'access_time', 'analytics', 'speed', 'emoji_events', 'school',
    'quiz', 'assignment', 'bar_chart', 'show_chart', 'timeline', 'groups', 'leaderboard',
    'pie_chart', 'scatter_plot', 'equalizer', 'moving', 'percent',
    'target', 'favorite', 'grade', 'done', 'warning',
    'info', 'help', 'description', 'document_scanner', 'receipt_long',
    'paid', 'money', 'trending_flat', 'swap_calls', 'call_split',
    'merge_type', 'account_tree', 'manage_search', 'task', 'checklist',
  ];

  platonSchema: PlatonTable[] = [];
  schemaLoading = false;

  private readonly _colsCache = new Map<string, { value: string; label: string }[]>();

  private readonly STEP_TYPE_LABELS: Record<StepType, string> = {
    fetch: 'Récupérer données', join: 'Jointure', filter: 'Filtrer',
    groupBy: 'Grouper par', findFirst: 'Premier résultat', extract: 'Extraire champ',
    aggregate: 'Agréger', round: 'Arrondir', divide: 'Diviser', js: 'Code JS',
  };

  // ── Modèle du formulaire ─────────────────────────────────────────────────

  def: {
    name: string;
    description: string;
    interpretationHint: string;
    requiredEvents: string[];
    contextType: IndicatorScope;
    thresholds: { good: number | null; warning: number | null } | null;
  } = { name: '', description: '', interpretationHint: '', requiredEvents: [], contextType: 'learner', thresholds: null };

  vizList: FlatViz[] = [this.newViz('Vue principale', 'card')];

  // ── Lifecycle ────────────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    if (!this.modalData?.indicator) {
      setTimeout(() => {
        (this.hostEl.nativeElement.querySelector('input[nz-input]') as HTMLInputElement | null)?.focus();
      }, 350);
    }
  }

  ngOnInit(): void {
    this.schemaLoading = true;
    this.indicatorSvc.getPlatonSchema().subscribe({
      next: s  => { this.platonSchema = s; this._colsCache.clear(); this.schemaLoading = false; this.cdr.detectChanges(); },
      error: () => { this.schemaLoading = false; },
    });

    this.indicatorSvc.getEventTypes().subscribe({
      next: types => { this.availableEventTypes = types.filter(t => t.isActive); this.cdr.detectChanges(); },
      error: () => { this.availableEventTypes = [{ name: 'exercise.answered', label: 'Exercice répondu' }]; },
    });
    if (this.modalData?.indicator) this.hydrate(this.modalData.indicator);
    else if (this.modalData?.circlePreset) this.applyCirclePreset(this.modalData.circlePreset);

    this.previewCoursesLoading = true;
    this.indicatorSvc.getTeacherContext(getCurrentUserId()).subscribe({
      next: courses => { this.previewCourses = courses; this.previewCoursesLoading = false; this.cdr.detectChanges(); },
      error: () => { this.previewCoursesLoading = false; },
    });

    // Détection de doublons : debounce 500ms sur le nom
    this.nameSearch$.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      switchMap(term => {
        if (term.trim().length < 3) { this.similarIndicators = []; return []; }
        this.similarSearching = true;
        this.cdr.markForCheck();
        return this.indicatorSvc.searchSimilar(term, this.modalData?.indicator?.id);
      }),
    ).subscribe({
      next: results => {
        this.similarIndicators = results;
        this.similarSearching = false;
        this.cdr.markForCheck();
      },
      error: () => { this.similarSearching = false; this.cdr.markForCheck(); },
    });
  }

  onNameInput(value: string): void {
    this.nameSearch$.next(value);
  }

  openPreview(ind: IndicatorDefinition): void {
    this.previewIndicator = ind;
    this.previewModalVisible = true;
  }

  // ── Label-picker du panneau de test ──────────────────────────────────────

  onPreviewCourseChange(courseId: string | null): void {
    this.previewCtx.groupId = '';
    this.previewCtx.activityId = '';
    this.previewActivities = [];
    this.previewStudents = [];
    if (!courseId) return;

    this.previewActivitiesLoading = true;
    this.indicatorSvc.getCourseActivities(courseId).subscribe({
      next: activities => { this.previewActivities = activities; this.previewActivitiesLoading = false; this.cdr.detectChanges(); },
      error: () => { this.previewActivitiesLoading = false; },
    });

    this.previewStudentsLoading = true;
    this.indicatorSvc.getCourseStudents(courseId).subscribe({
      next: students => { this.previewStudents = students; this.previewStudentsLoading = false; this.cdr.detectChanges(); },
      error: () => { this.previewStudentsLoading = false; },
    });
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  canProceed(): boolean {
    if (this.step === 0) return !!this.def.name.trim() && this.def.requiredEvents.length > 0;
    if (this.step === 1) return !!this.def.contextType && this.vizList.length > 0;
    return true;
  }

  goToStep(target: number): void {
    if (target === this.step) return;
    // Retour en arrière : toujours permis
    if (target < this.step) { this.step = target; return; }
    // En mode édition : navigation libre vers l'avant
    if (this.isEditMode) { this.step = target; return; }
    // En mode création : valider chaque étape intermédiaire avant d'avancer
    for (let i = this.step; i < target; i++) {
      this.step = i;
      if (!this.canProceed()) {
        this.messageSvc.warning('Veuillez compléter cette étape avant de continuer.');
        return;
      }
    }
    this.step = target;
  }

  nextStep(): void { if (this.canProceed()) this.step++; }

  // ── Gestion des visualisations ───────────────────────────────────────────

  private newViz(label: string, type: ViewVisualizationType): FlatViz {
    return {
      id: crypto.randomUUID(), label, type,
      icon: 'analytics', color: '#722ed1', unit: '',
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

  onVizTypeChange(_v: FlatViz): void {}

  onThresholdGoodChange(val: number | null): void {
    if (val === null) { this.clearThresholds(); return; }
    if (!this.def.thresholds) this.def.thresholds = { good: null, warning: null };
    this.def.thresholds.good = val;
  }

  onThresholdWarningChange(val: number | null): void {
    if (val === null) { if (this.def.thresholds) this.def.thresholds.warning = null; return; }
    if (!this.def.thresholds) this.def.thresholds = { good: null, warning: null };
    this.def.thresholds.warning = val;
  }

  clearThresholds(): void {
    this.def.thresholds = null;
  }

  // ── Pipeline ─────────────────────────────────────────────────────────────

  getStepMeta(type: StepType) {
    return STEP_CATALOG.find(s => s.type === type) ?? STEP_CATALOG[0];
  }

  openPicker(): void { this.showStepPicker = true; }

  addStep(type: StepType): void {
    const meta = this.getStepMeta(type);
    this.pipeline.push({
      id: crypto.randomUUID(), type, label: meta.label,
      table:           type === 'fetch'     ? 'SessionData' : undefined,
      contextFields:   type === 'fetch'     ? ['user_id', 'activity_id'] : undefined,
      filterOperator:  type === 'filter'    ? '==' : undefined,
      aggregateFn:     type === 'aggregate' ? 'avg' : undefined,
      decimals:        type === 'round'     ? 2 : undefined,
      divideBy:        type === 'divide'    ? 100 : undefined,
      jsCode:          type === 'js'        ? '// input : sortie de l\'étape précédente\nreturn 0;' : undefined,
    });
    this.showStepPicker = false;
  }

  trackStepById(_: number, s: PipelineStep): string { return s.id; }

  removeStep(i: number): void { this.pipeline.splice(i, 1); }

  applyRecipe(r: (typeof FORMULA_RECIPES)[0]): void {
    this.pipeline = r.pipeline.map(s => ({ ...s, id: crypto.randomUUID() })) as PipelineStep[];
    if (this.showImport) {
      this.importText = this.pipelineToText(this.pipeline, this.importMode);
      this.importError = null;
    }
  }

  openRecipeModal(r: (typeof FORMULA_RECIPES)[0]): void {
    this.activeRecipeDetail = r;
    this.modalSvc.create({
      nzTitle: r.name,
      nzContent: this.recipeDetailTplRef,
      nzWidth: 580,
      nzCentered: true,
      nzFooter: null,
    });
  }

  drop(event: CdkDragDrop<PipelineStep[]>): void {
    moveItemInArray(this.pipeline, event.previousIndex, event.currentIndex);
  }

  activeColumns(): { value: string; label: string }[] {
    const fetch = this.pipeline.find(s => s.type === 'fetch');
    return this.columnsForTable(fetch?.table);
  }

  columnsForTable(name: string | undefined): { value: string; label: string }[] {
    if (!name) return [];
    const cached = this._colsCache.get(name);
    if (cached) return cached;
    const map: Record<string, string> = { sessions: 'SessionData', activities: 'Activities' };
    const resolved = map[name] ?? name;
    const cols = this.platonSchema.find(t => t.name === resolved)?.columns.map(c => ({ value: c.name, label: c.name })) ?? [];
    this._colsCache.set(name, cols);
    return cols;
  }

  // ── Preview ──────────────────────────────────────────────────────────────

  runPreview(): void {
    this.previewing = true;
    this.previewResult = '';
    this.previewError  = '';

    this.indicatorSvc.previewFormulaRaw(this.buildFormula(), {
      userId:     this.previewCtx.userId     || undefined,
      groupId:    this.previewCtx.groupId    || undefined,
      activityId: this.previewCtx.activityId || undefined,
      courseId:   this.previewCourseId       || undefined,
    }).subscribe({
      next: ({ result }) => {
        this.previewResult = typeof result === 'number' ? String(result) : JSON.stringify(result, null, 2);
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

  runDebug(): void {
    this.debugging = true;
    this.debugSteps = [];
    this.debugError = '';

    this.indicatorSvc.previewFormulaSteps(this.buildFormula(), {
      userId:     this.previewCtx.userId     || undefined,
      groupId:    this.previewCtx.groupId    || undefined,
      activityId: this.previewCtx.activityId || undefined,
      courseId:   this.previewCourseId       || undefined,
    }).subscribe({
      next: ({ steps }) => {
        this.debugSteps = steps;
        this.debugging = false;
        this.cdr.detectChanges();
      },
      error: err => {
        this.debugError = err?.error?.message ?? 'Erreur lors du débogage';
        this.debugging = false;
        this.cdr.detectChanges();
      },
    });
  }

  formatStepOutput(output: any): string {
    if (output === null || output === undefined) return '-';
    if (Array.isArray(output)) {
      const preview = output.slice(0, 3).map(r => JSON.stringify(r)).join('\n');
      return output.length > 3 ? `${preview}\n… (${output.length} éléments au total)` : preview || '[]';
    }
    return JSON.stringify(output, null, 2);
  }

  isArray(v: any): boolean { return Array.isArray(v); }
  isObject(v: any): boolean { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  isArrayOfObjects(v: any): boolean { return Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null; }

  getTableCols(arr: any[]): string[] {
    const allKeys = new Set<string>();
    arr.slice(0, 5).forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
    return Array.from(allKeys);
  }

  getTableRows(arr: any[], key: string): string[][] {
    const cols = this.getTableCols(arr);
    const rows = this.debugExpanded.has(key) ? arr : arr.slice(0, 5);
    return rows.map(row =>
      cols.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return '-';
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return str.length > 40 ? str.slice(0, 38) + '…' : str;
      })
    );
  }

  toggleExpandStep(key: string): void {
    this.debugExpanded.has(key) ? this.debugExpanded.delete(key) : this.debugExpanded.add(key);
  }

  // ── Import YAML/JSON ─────────────────────────────────────────────────────

  enterVisualMode(): void {
    this.showImport = false;
    this.importError = null;
  }

  enterImportMode(): void {
    this.importText = this.pipelineToText(this.pipeline, this.importMode);
    this.importError = null;
    this.showImport = true;
  }

  setImportMode(mode: 'yaml' | 'json'): void {
    this.importMode = mode;
    this.importError = null;
    this.importText = this.pipelineToText(this.pipeline, mode);
  }

  /** Sérialise le pipeline courant (visuel ou importé) en YAML/JSON pour ré-édition. */
  private pipelineToText(pipeline: PipelineStep[], mode: 'yaml' | 'json'): string {
    if (!pipeline.length) return '';
    const raw = {
      pipeline: pipeline.map(s => ({
        type: s.type,
        label: s.label,
        params: this.extractParams(s),
      })),
    };
    return mode === 'yaml' ? yaml.dump(raw, { lineWidth: -1 }) : JSON.stringify(raw, null, 2);
  }

  applyImport(): void {
    this.importError = null;
    try {
      const pipeline = this.parseStep3Text(this.importText, this.importMode);
      this.pipeline = pipeline;
      this.showImport = false;
      this.messageSvc.success('Pipeline importé');
      this.cdr.detectChanges();
    } catch (e: any) {
      this.importError = e instanceof PipelineError
        ? { main: e.message, available: e.available, availableLabel: e.availableLabel, wrongValue: e.wrongValue, availableDisplay: e.availableDisplay }
        : { main: e.message };
    }
  }

  applySuggestion(suggestion: string): void {
    const wrong = this.importError?.wrongValue;
    if (!wrong) return;
    const escaped = wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(["']?)\\b${escaped}\\b\\1`);
    this.importText = this.importText.replace(re, `$1${suggestion}$1`);
    // Revalide sans fermer le panneau ni appliquer le pipeline
    try {
      this.parseStep3Text(this.importText, this.importMode);
      this.importError = null;
    } catch (e: any) {
      this.importError = e instanceof PipelineError
        ? { main: e.message, available: e.available, availableLabel: e.availableLabel, wrongValue: e.wrongValue, availableDisplay: e.availableDisplay }
        : { main: e.message };
    }
    this.cdr.detectChanges();
  }

  onImportKeydown(event: KeyboardEvent): void {
    const ta = event.target as HTMLTextAreaElement;
    if (event.key === 'Tab') {
      event.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const indent = '  ';
      ta.value = ta.value.substring(0, start) + indent + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = start + indent.length;
      this.importText = ta.value;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const start = ta.selectionStart;
      const linesBefore = ta.value.substring(0, start).split('\n');
      const currentLine = linesBefore[linesBefore.length - 1] ?? '';
      const indent = currentLine.match(/^(\s*)/)?.[1] ?? '';
      const extraIndent = currentLine.trimEnd().endsWith(':') ? '  ' : '';
      const insertion = '\n' + indent + extraIndent;
      ta.value = ta.value.substring(0, start) + insertion + ta.value.substring(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = start + insertion.length;
      this.importText = ta.value;
    }
  }

  onImportFileUpload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.importMode = file.name.endsWith('.json') ? 'json' : 'yaml';
    const reader = new FileReader();
    reader.onload = (e) => {
      this.importText = (e.target?.result as string) ?? '';
      this.importError = null;
      this.cdr.detectChanges();
    };
    reader.readAsText(file);
  }

  private parseStep3Text(text: string, mode: 'yaml' | 'json'): PipelineStep[] {
    if (!text.trim()) throw new Error('Le champ est vide. Collez votre pipeline ci-dessus avant d\'appliquer.');
    let raw: any;
    try {
      raw = mode === 'yaml' ? yaml.load(text) : JSON.parse(text);
    } catch {
      throw new Error(
        mode === 'yaml'
          ? 'Le YAML contient une erreur de syntaxe. Vérifiez l\'indentation (utilisez des espaces, pas des tabulations) et les guillemets.'
          : 'Le JSON contient une erreur de syntaxe. Vérifiez les virgules, les guillemets et les accolades.'
      );
    }
    if (!raw || typeof raw !== 'object') {
      throw new Error('Le document doit commencer par "pipeline:" (YAML) ou { "pipeline": [...] } (JSON).');
    }
    if (!Array.isArray(raw.pipeline)) {
      const wrongKey = Object.keys(raw).find(k => k !== 'pipeline');
      if (wrongKey) {
        throw new PipelineError(
          `Clé racine "${wrongKey}" inconnue - le document doit commencer par "pipeline".`,
          ['pipeline'], 'Clé attendue', wrongKey,
        );
      }
      throw new Error('Clé "pipeline" introuvable ou invalide. Elle doit contenir une liste d\'étapes.');
    }
    if (raw.pipeline.length === 0) {
      throw new Error('Le pipeline est vide. Ajoutez au moins une étape.');
    }
    const pipeline = raw.pipeline.map((s: any, j: number) => this.validateAndDehydrate(s, j + 1));
    this.validatePipelineColumns(pipeline);
    return pipeline;
  }

  private validateAndDehydrate(raw: any, stepNum: number): PipelineStep {
    const VALID_TYPES: StepType[] = ['fetch', 'join', 'filter', 'groupBy', 'findFirst', 'extract', 'aggregate', 'round', 'divide', 'js'];
    const VALID_AGGREGATE_FNS = ['avg', 'sum', 'count', 'min', 'max'];
    const VALID_FILTER_OPERATORS = ['==', '!=', '>', '<', '>=', '<='];
    const VALID_JOIN_TYPES = ['left', 'inner', 'right', 'full'];
    const VALID_STEP_KEYS = ['type', 'label', 'params'];
    const VALID_PARAMS: Record<StepType, string[]> = {
      fetch:     ['table', 'contextFields'],
      join:      ['table', 'contextFields', 'leftKey', 'rightKey', 'joinType'],
      filter:    ['field', 'operator', 'value'],
      groupBy:   ['groupField'],
      findFirst: ['whereField', 'whereValue', 'sortField'],
      extract:   ['extractField'],
      aggregate: ['aggregateFn'],
      round:     ['decimals'],
      divide:    ['divideBy'],
      js:        ['code'],
    };

    if (!raw || typeof raw !== 'object') {
      throw new Error(`Étape ${stepNum} : doit être un objet avec au minimum les clés "type" et "params".`);
    }

    // ── Niveau 1 : clés de l'étape (type / label / params) ──────────────────
    const stepKeys = Object.keys(raw);
    const wrongStepKey = stepKeys.find(k => !VALID_STEP_KEYS.includes(k));

    if (!raw.type) {
      if (wrongStepKey) {
        throw new PipelineError(
          `Étape ${stepNum} : clé "${wrongStepKey}" inconnue - le nom correct est "type".`,
          ['type'], 'Clé attendue', wrongStepKey,
        );
      }
      throw new PipelineError(
        `Étape ${stepNum} : la clé "type" est manquante. Pour du code JavaScript personnalisé, utilisez "type: js" avec "params.code".`,
        VALID_TYPES, 'Types disponibles',
      );
    }
    if (!VALID_TYPES.includes(raw.type)) {
      throw new PipelineError(
        `Étape ${stepNum} : type "${raw.type}" inconnu. Pour du code JavaScript personnalisé, utilisez "type: js" avec "params.code".`,
        VALID_TYPES, 'Types valides', raw.type,
        VALID_TYPES.map(t => `${t} - ${this.STEP_TYPE_LABELS[t]}`),
      );
    }
    // Clé étrangère présente malgré un type valide (ex: prams, lable…)
    if (wrongStepKey) {
      throw new PipelineError(
        `Étape ${stepNum} : clé "${wrongStepKey}" inconnue au niveau de l'étape.`,
        VALID_STEP_KEYS, 'Clés valides d\'une étape', wrongStepKey,
      );
    }

    if (!raw.label) raw.label = this.STEP_TYPE_LABELS[raw.type as StepType];
    const ctx = `Étape ${stepNum} (${this.STEP_TYPE_LABELS[raw.type as StepType]})`;

    // ── Niveau 2 : params doit être un objet plain ───────────────────────────
    if (raw.params !== undefined && raw.params !== null) {
      if (Array.isArray(raw.params))
        throw new Error(`${ctx} : "params" doit être un objet clé:valeur, pas une liste.`);
      if (typeof raw.params !== 'object')
        throw new Error(`${ctx} : "params" doit être un objet clé:valeur (reçu : ${typeof raw.params}).`);
    }
    const p = raw.params ?? {};

    // ── Niveau 3 : clés à l'intérieur de params ──────────────────────────────
    const validParamKeys = VALID_PARAMS[raw.type as StepType];
    const wrongParamKey = Object.keys(p).find(k => !validParamKeys.includes(k));
    if (wrongParamKey) {
      throw new PipelineError(
        `${ctx} : clé de paramètre "${wrongParamKey}" inconnue.`,
        validParamKeys, 'Paramètres valides', wrongParamKey,
      );
    }

    switch (raw.type as StepType) {
      case 'fetch': {
        if (!p.table || typeof p.table !== 'string' || !p.table.trim())
          throw new Error(`${ctx} : "params.table" est requis - nom de la table PLaTon, ex: SessionData.`);
        if (p.contextFields !== undefined && !Array.isArray(p.contextFields))
          throw new Error(`${ctx} : "params.contextFields" doit être une liste, ex: [user_id, activity_id].`);
        if (Array.isArray(p.contextFields) && p.contextFields.some((f: any) => typeof f !== 'string'))
          throw new Error(`${ctx} : "params.contextFields" doit contenir uniquement des noms de colonnes (chaînes de caractères).`);
        break;
      }
      case 'join': {
        if (!p.table || typeof p.table !== 'string' || !p.table.trim())
          throw new Error(`${ctx} : "params.table" est requis - nom de la table à joindre.`);
        if (!p.leftKey || typeof p.leftKey !== 'string')
          throw new Error(`${ctx} : "params.leftKey" est requis - colonne dans les données courantes servant de clé de jointure.`);
        if (!p.rightKey || typeof p.rightKey !== 'string')
          throw new Error(`${ctx} : "params.rightKey" est requis - colonne correspondante dans la table à joindre.`);
        if (p.contextFields !== undefined && !Array.isArray(p.contextFields))
          throw new Error(`${ctx} : "params.contextFields" doit être une liste, ex: [user_id, activity_id].`);
        if (Array.isArray(p.contextFields) && p.contextFields.some((f: any) => typeof f !== 'string'))
          throw new Error(`${ctx} : "params.contextFields" doit contenir uniquement des noms de colonnes (chaînes de caractères).`);
        if (p.joinType !== undefined && !VALID_JOIN_TYPES.includes(p.joinType))
          throw new PipelineError(`${ctx} : "params.joinType" invalide ("${p.joinType}").`, VALID_JOIN_TYPES, 'Valeurs possibles (défaut : left)', p.joinType);
        break;
      }
      case 'filter': {
        if (!p.field || typeof p.field !== 'string')
          throw new Error(`${ctx} : "params.field" est requis - nom de la colonne à tester.`);
        if (!p.operator)
          throw new PipelineError(`${ctx} : "params.operator" est requis.`, VALID_FILTER_OPERATORS, 'Opérateurs valides');
        if (!VALID_FILTER_OPERATORS.includes(p.operator))
          throw new PipelineError(`${ctx} : opérateur "${p.operator}" inconnu.`, VALID_FILTER_OPERATORS, 'Opérateurs valides', p.operator);
        if (p.value === undefined || p.value === null)
          throw new Error(`${ctx} : "params.value" est requis - valeur à comparer avec "${p.field}".`);
        if (typeof p.value !== 'string' && typeof p.value !== 'number')
          throw new Error(`${ctx} : "params.value" doit être une chaîne ou un nombre (reçu : ${typeof p.value}).`);
        break;
      }
      case 'groupBy': {
        if (!p.groupField || typeof p.groupField !== 'string')
          throw new Error(`${ctx} : "params.groupField" est requis - nom de la colonne de regroupement.`);
        break;
      }
      case 'findFirst': {
        if (p.whereField !== undefined && typeof p.whereField !== 'string')
          throw new Error(`${ctx} : "params.whereField" doit être une chaîne (nom de colonne).`);
        if (p.whereField && (p.whereValue === undefined || p.whereValue === null))
          throw new Error(`${ctx} : "params.whereValue" est requis quand "params.whereField" est défini.`);
        if (p.sortField !== undefined && typeof p.sortField !== 'string')
          throw new Error(`${ctx} : "params.sortField" doit être une chaîne (nom de colonne).`);
        break;
      }
      case 'extract': {
        if (!p.extractField || typeof p.extractField !== 'string')
          throw new Error(`${ctx} : "params.extractField" est requis - nom de la colonne dont extraire la valeur.`);
        break;
      }
      case 'aggregate': {
        if (!p.aggregateFn)
          throw new PipelineError(`${ctx} : "params.aggregateFn" est requis.`, VALID_AGGREGATE_FNS, 'Fonctions valides');
        if (!VALID_AGGREGATE_FNS.includes(p.aggregateFn))
          throw new PipelineError(`${ctx} : fonction "${p.aggregateFn}" inconnue.`, VALID_AGGREGATE_FNS, 'Fonctions valides', p.aggregateFn);
        break;
      }
      case 'round': {
        if (p.decimals === undefined || p.decimals === null)
          throw new Error(`${ctx} : "params.decimals" est requis - nombre de décimales (ex: 0, 1, 2).`);
        if (typeof p.decimals !== 'number' || !Number.isInteger(p.decimals) || p.decimals < 0)
          throw new Error(`${ctx} : "params.decimals" doit être un entier positif ou nul (reçu : ${p.decimals}).`);
        break;
      }
      case 'divide': {
        if (p.divideBy === undefined || p.divideBy === null)
          throw new Error(`${ctx} : "params.divideBy" est requis - constante de division (ex: 60, 100).`);
        if (typeof p.divideBy !== 'number')
          throw new Error(`${ctx} : "params.divideBy" doit être un nombre (reçu : ${typeof p.divideBy}).`);
        if (p.divideBy === 0)
          throw new Error(`${ctx} : "params.divideBy" ne peut pas être 0 (division par zéro).`);
        break;
      }
      case 'js': {
        if (!p.code || typeof p.code !== 'string' || !p.code.trim())
          throw new Error(`${ctx} : "params.code" est requis - le code JavaScript à exécuter. Utilisez "return", ex: return input.length;`);
        break;
      }
    }
    return this.dehydrateStep({ id: crypto.randomUUID(), type: raw.type, label: raw.label, params: p });
  }

  private validatePipelineColumns(pipeline: PipelineStep[]): void {
    if (!this.platonSchema.length) return;

    const tableNames = this.platonSchema.map(t => t.name);
    const colsOf = (tableName: string): Set<string> =>
      new Set(this.platonSchema.find(t => t.name === tableName)?.columns.map(c => c.name) ?? []);

    let knownCols = new Set<string>();

    for (let i = 0; i < pipeline.length; i++) {
      const s = pipeline[i];
      const n = i + 1;
      const ctx = `Étape ${n} (${this.STEP_TYPE_LABELS[s.type]})`;

      switch (s.type) {
        case 'fetch': {
          if (!tableNames.includes(s.table!))
            throw new PipelineError(`${ctx} : table "${s.table}" introuvable dans le schéma PLaTon.`, tableNames, 'Tables disponibles', s.table);
          const cols = colsOf(s.table!);
          for (const f of s.contextFields ?? []) {
            if (!cols.has(f))
              throw new PipelineError(`${ctx} : colonne de contexte "${f}" introuvable dans "${s.table}".`, [...cols], 'Colonnes disponibles', f);
          }
          knownCols = cols;
          break;
        }
        case 'join': {
          if (!tableNames.includes(s.joinTable!))
            throw new PipelineError(`${ctx} : table "${s.joinTable}" introuvable dans le schéma PLaTon.`, tableNames, 'Tables disponibles', s.joinTable);
          const joinCols = colsOf(s.joinTable!);
          if (knownCols.size && s.joinLeftKey && !knownCols.has(s.joinLeftKey))
            throw new PipelineError(`${ctx} : colonne de jointure gauche "${s.joinLeftKey}" introuvable dans les données courantes.`, [...knownCols], 'Colonnes disponibles', s.joinLeftKey);
          if (s.joinRightKey && !joinCols.has(s.joinRightKey))
            throw new PipelineError(`${ctx} : colonne de jointure droite "${s.joinRightKey}" introuvable dans "${s.joinTable}".`, [...joinCols], 'Colonnes disponibles', s.joinRightKey);
          for (const f of s.joinContextFields ?? []) {
            if (!joinCols.has(f))
              throw new PipelineError(`${ctx} : colonne de filtre "${f}" introuvable dans "${s.joinTable}".`, [...joinCols], 'Colonnes disponibles', f);
          }
          for (const col of joinCols) knownCols.add(col);
          break;
        }
        case 'filter': {
          if (knownCols.size && s.filterField && !knownCols.has(s.filterField))
            throw new PipelineError(`${ctx} : colonne "${s.filterField}" introuvable dans les données courantes.`, [...knownCols], 'Colonnes disponibles', s.filterField);
          break;
        }
        case 'groupBy': {
          if (knownCols.size && s.groupField && !knownCols.has(s.groupField))
            throw new PipelineError(`${ctx} : colonne de regroupement "${s.groupField}" introuvable dans les données courantes.`, [...knownCols], 'Colonnes disponibles', s.groupField);
          break;
        }
        case 'findFirst': {
          if (knownCols.size && s.whereField && !knownCols.has(s.whereField))
            throw new PipelineError(`${ctx} : colonne de filtre "${s.whereField}" introuvable dans les données courantes.`, [...knownCols], 'Colonnes disponibles', s.whereField);
          if (knownCols.size && s.sortField && !knownCols.has(s.sortField))
            throw new PipelineError(`${ctx} : colonne de tri "${s.sortField}" introuvable dans les données courantes.`, [...knownCols], 'Colonnes disponibles', s.sortField);
          break;
        }
        case 'extract': {
          if (knownCols.size && s.extractField && !knownCols.has(s.extractField))
            throw new PipelineError(`${ctx} : colonne "${s.extractField}" introuvable dans les données courantes.`, [...knownCols], 'Colonnes disponibles', s.extractField);
          knownCols = new Set();
          break;
        }
        case 'js':
          knownCols = new Set();
          break;
        // aggregate, round, divide : ne changent pas le contexte de colonnes
      }
    }
  }

  stepTypeColor(type: string): string {
    const map: Record<string, string> = {
      fetch: '#0958d9', join: '#531dab', filter: '#c41d7f',
      groupBy: '#d46b08', findFirst: '#389e0d', extract: '#08979c',
      aggregate: '#1d39c4', round: '#8c8c8c', divide: '#8c8c8c', js: '#ad6800',
    };
    return map[type] ?? '#595959';
  }

  // ── Soumission ───────────────────────────────────────────────────────────

  submit(): void {
    if (!this.def.name.trim()) { this.messageSvc.error('Le nom est requis'); return; }

    this.saving = true;

    const payload = {
      name: this.def.name.trim(),
      description: this.def.description.trim(),
      interpretationHint: this.def.interpretationHint.trim() || null,
      contextType: this.def.contextType,
      requiredEvents: this.def.requiredEvents,
      // En édition normale (hors wizard cercle), on conserve le circleName existant de l'indicateur
      // pour ne pas l'effacer accidentellement à chaque sauvegarde.
      circleName: this.modalData?.circlePreset?.circleName
        ?? this.modalData?.indicator?.circleName
        ?? null,
      formula: this.buildFormula(),
      thresholds: this.def.thresholds?.good != null || this.def.thresholds?.warning != null
        ? { good: this.def.thresholds?.good ?? undefined, warning: this.def.thresholds?.warning ?? undefined }
        : null,
      visualizations: this.vizList.map(v => ({
        id: v.id,
        label: v.label,
        type: v.type,
        icon: v.icon,
        color: v.color,
        unit: v.unit,
      })),
      isActive: false,
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

  private buildFormula() {
    return {
      version: '1.0',
      pipeline: this.pipeline.map(s => ({ id: s.id, type: s.type, label: s.label, params: this.extractParams(s) })),
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
      case 'join':      return { table: s.joinTable, contextFields: s.joinContextFields ?? [], leftKey: s.joinLeftKey, rightKey: s.joinRightKey, joinType: s.joinType ?? 'left' };
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
      // fetch
      table:           s.type === 'fetch' ? s.params?.table : undefined,
      contextFields:   s.type === 'fetch' ? s.params?.contextFields : undefined,
      useGroupContext: s.type === 'fetch' ? s.params?.contextFields?.includes('group_id') : undefined,
      // join
      joinTable:          s.type === 'join' ? s.params?.table : undefined,
      joinContextFields:  s.type === 'join' ? s.params?.contextFields : undefined,
      joinLeftKey:        s.type === 'join' ? s.params?.leftKey : undefined,
      joinRightKey:       s.type === 'join' ? s.params?.rightKey : undefined,
      joinType:           s.type === 'join' ? (s.params?.joinType ?? 'left') : undefined,
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

  /** Pré-remplit le formulaire à partir des données partagées d'un cercle en cours de création. */
  private applyCirclePreset(preset: IndicatorCirclePreset): void {
    this.def.name           = preset.name;
    this.def.description    = preset.description;
    this.def.requiredEvents = [...preset.requiredEvents];
    this.def.contextType    = preset.contextType;
  }

  private hydrate(ind: IndicatorDefinition): void {
    this.def.name               = ind.name;
    this.def.description        = ind.description || '';
    this.def.interpretationHint = ind.interpretationHint || '';
    this.def.requiredEvents     = ind.requiredEvents || [];
    this.def.contextType        = ind.contextType ?? 'learner';

    this.def.thresholds = ind.thresholds
      ? { good: ind.thresholds.good ?? null, warning: ind.thresholds.warning ?? null }
      : null;

    const vizs = ind.visualizations ?? [];
    this.vizList = vizs.length > 0
      ? vizs.map(v => ({
          id:    v.id ?? crypto.randomUUID(),
          label: v.label ?? 'Vue',
          type:  v.type ?? 'card',
          icon:  v.icon ?? 'analytics',
          color: v.color ?? '#722ed1',
          unit:  v.unit ?? '',
        }))
      : [this.newViz('Vue principale', 'card')];

    this.pipeline = (ind.formula?.pipeline ?? []).map((s: any) => this.dehydrateStep(s));
  }
}
