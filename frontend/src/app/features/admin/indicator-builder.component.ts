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
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
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
import { IndicatorDefinition, IndicatorScope, ViewVisualizationType, TeacherCourse, CourseActivity, contextIcon } from '../../core/models/indicator.model';
import { ReuseIndicatorResult } from './reuse-indicator-modal.component';
import { EventRuleManagerComponent } from './event-rule-manager.component';
import {
  StepType, PipelineStep, PlatonTableSchema,
  PipelineError, ImportedIndicatorMeta, ImportErrorDisplay, toImportErrorDisplay,
  dehydrateStep, parseIndicatorImport, replaceValueInText, validatePipelineStepComplete, looksLikeJson,
} from './pipeline-import.util';
import { getCurrentUserId } from '../../core/auth/current-user';

// ── Types DSL ────────────────────────────────────────────────────────────────

interface FlatViz {
  id: string;
  label: string;
  type: ViewVisualizationType;
  icon: string;
  color: string;
  unit: string;
}

/** Données partagées par les membres d'une famille, transmis de builder en builder. */
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

/** Carte affichée dans la modale "Pipelines" - `detail` (objectif/utilisation/adapter) n'existe
 *  que pour les pipelines prédéfinis (FORMULA_RECIPES) ; `usedBy` n'existe que pour les
 *  pipelines dérivés d'indicateurs déjà créés (voir loadExistingPipelines()). */
interface PipelineCatalogItem {
  name: string;
  desc: string;
  pipeline: Omit<PipelineStep, 'id'>[];
  detail?: { objectif: string; utilisation: string; adapter: string };
  usedBy?: string[];
}

const FORMULA_RECIPES: PipelineCatalogItem[] = [
  {
    name: 'Tentatives avant réussite',
    desc: 'Nb moyen de tentatives avant la 1ère note de 100',
    detail: {
      objectif: `Mesure la persévérance d'un apprenant sur une activité. Indique combien de fois en moyenne il a fallu tenter un exercice avant d'obtenir 100/100. Utile pour détecter les exercices difficiles ou mal calibrés.`,
      utilisation: `Idéal pour une visualisation card ou gauge. Fonctionne en contexte learner (valeur propre à l'apprenant) ou activity (vue agrégée sur tous les apprenants). Résultat : un nombre décimal, ex: 3.25.`,
      adapter: `S'appuie sur la colonne attempts_at_success (nombre de tentatives au moment de la 1ère réussite, calculée depuis Answers - contrairement à "attempts" qui continue d'augmenter après une réussite). Ajouter un step filter supplémentaire pour cibler une ressource spécifique. Passer aggregateFn de "avg" à "max" pour voir la pire performance.`,
    },
    pipeline: [
      { type: 'fetch',   label: 'Charger sessions', table: 'SessionData', contextFields: ['user_id', 'activity_id'] },
      { type: 'filter',  label: 'Sessions réussies', filterField: 'attempts_at_success', filterOperator: '>', filterValue: 0 },
      { type: 'extract', label: 'Tentatives avant réussite', extractField: 'attempts_at_success' },
      { type: 'aggregate', label: 'Moyenne',         aggregateFn: 'avg' },
      { type: 'round',   label: 'Arrondir',           decimals: 2 },
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
      adapter: `Changer filterValue: 100 pour un autre seuil (ex: 80 pour "exercices quasi-réussis"). Ajouter un join sur Resources puis un groupBy pour ventiler par catégorie d'exercice.`,
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
    desc: 'Moyenne des tentatives par étudiant d\'un groupe de TP, avec noms lisibles (bar-chart)',
    detail: {
      objectif: `Vue enseignant sur l'activité d'un groupe de TP. Chaque barre représente un étudiant du groupe et sa hauteur la moyenne de ses tentatives par exercice. Une moyenne plutôt qu'un total évite de pénaliser un étudiant simplement parce qu'il a fait plus d'exercices que les autres.`,
      utilisation: `Conçu pour un bar-chart. Nécessite le contexte group avec useGroupContext: true dans le step fetch. Le join sur Users permet d'afficher les prénoms/noms à la place des IDs. Résultat : { "Jean Dupont": 3.5, "Marie Martin": 1.8, ... }.`,
      adapter: `Remplacer attempts par grade dans le step js pour obtenir la note moyenne par étudiant du groupe. Ajouter un filter pour ne compter que les sessions réussies. Changer le label en row.email si on préfère les adresses email aux noms complets.`,
    },
    pipeline: [
      { type: 'fetch', label: 'Charger sessions du groupe', table: 'SessionData', contextFields: ['group_id', 'activity_id'], useGroupContext: true },
      { type: 'join',  label: 'Joindre noms des étudiants', joinTable: 'Users', joinLeftKey: 'user_id', joinRightKey: 'id' },
      { type: 'js',    label: 'Moyenne par étudiant', jsCode:
`const groups = {};
for (const row of input) {
  const attempts = parseFloat(row.attempts);
  if (isNaN(attempts)) continue;
  const label = (row.first_name && row.last_name) ? row.first_name + ' ' + row.last_name : row.user_id;
  if (!groups[label]) groups[label] = [];
  groups[label].push(attempts);
}
const out = {};
for (const [label, vals] of Object.entries(groups)) {
  out[label] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}
return out;` },
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
    NzIconModule, NzToolTipModule, NzSpinModule, NzSwitchModule, NzTabsModule,
    NzModalModule, NzBadgeModule,
  ],
  template: `
<div class="builder">

  <nz-steps [nzCurrent]="step" nzSize="small" class="steps">
    <nz-step nzTitle="Définition"  nzDescription="Nom et description"                    class="step-clickable" (click)="goToStep(0)"></nz-step>
    <nz-step nzTitle="Contexte"    nzDescription="Contexte et visualisations"             class="step-clickable" (click)="goToStep(1)"></nz-step>
    <nz-step nzTitle="Formules"    nzDescription="Pipeline et événements déclencheurs"    class="step-clickable" (click)="goToStep(2)"></nz-step>
  </nz-steps>

  <div class="indicator-header" *ngIf="def.name">
    {{ isEditMode ? 'Édition : ' : 'Nouvel indicateur : ' }}{{ def.name }}
    <span *ngIf="familyProgress"> - {{ familyProgress }}</span>
  </div>

  <nz-divider></nz-divider>

  <!-- ── ÉTAPE 1 ─────────────────────────────────────────────────────── -->
  <div *ngIf="step === 0" class="step-content">

    <!-- Le choix "réutiliser/importer/à partir de zéro" se fait désormais avant l'ouverture du
         wizard (modale de démarrage) - ce bandeau ne fait que rappeler d'où vient le contenu
         pré-rempli le cas échéant. -->
    <p class="section-hint" *ngIf="def.baseIndicatorId">
      "{{ reuseAppliedName }}" copié comme point de départ (nom, description, contexte, seuils,
      visualisations et pipeline) - tout reste modifiable librement dans les étapes suivantes.
    </p>

    <div class="wizard-section">
      <div class="wizard-section-title"><span nz-icon nzType="file-text"></span> Informations générales</div>

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
                <mat-icon [style.color]="ind.visualizations?.[0]?.color || '#8c8c8c'" style="font-size:16px;width:16px;height:16px;line-height:1">{{ contextIcon(ind.contextType) }}</mat-icon>
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
                <span class="prev-label">Famille</span>
                <p class="prev-value">{{ ind.familyName || '-' }}</p>
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
                  <mat-icon [style.color]="v.color || '#8c8c8c'">{{ contextIcon(ind.contextType) }}</mat-icon>
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
                  <span>Critique <strong>&gt; {{ ind.thresholds!.critical ?? ind.thresholds!.warning ?? ind.thresholds!.good }}</strong></span>
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

    </div>
  </div>

  <!-- ── ÉTAPE 2 ─────────────────────────────────────────────────────── -->
  <div *ngIf="step === 1" class="step-content">

    <div class="wizard-section">
      <div class="wizard-section-title"><span nz-icon nzType="aim"></span> Contexte</div>
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
    </div>

    <div class="wizard-section">
      <div class="wizard-section-title"><span nz-icon nzType="bar-chart"></span> Visualisations</div>

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
            <label>Type <mat-icon class="info-icon" nz-tooltip="Forme d'affichage. Carte = valeur. Barres = résultat {clé:valeur}. Histogramme = distribution [{bucket, count}]. Jauge = valeur avec plafond. Ligne = historique temporel." nzTooltipPlacement="top">info_outline</mat-icon></label>
            <nz-select [(ngModel)]="v.type" style="width:100%" (ngModelChange)="onVizTypeChange(v)">
              <nz-option nzValue="card"       nzLabel="Valeur"></nz-option>
              <nz-option nzValue="gauge"      nzLabel="Jauge"></nz-option>
              <nz-option nzValue="bar-chart"  nzLabel="Barres horizontales"></nz-option>
              <nz-option nzValue="histogram"  nzLabel="Histogramme"></nz-option>
              <nz-option nzValue="line-chart" nzLabel="Graphique ligne"></nz-option>
            </nz-select>
          </div>
          <div class="viz-field viz-field-icon">
            <label>Icône <mat-icon class="info-icon" nz-tooltip="Automatique selon le contexte de l'indicateur (choisi à la section « Contexte » ci-dessus) - pour rester reconnaissable d'un coup d'œil. Plus de choix manuel." nzTooltipPlacement="top">info_outline</mat-icon></label>
            <div class="icon-preview">
              <mat-icon>{{ contextIcon(def.contextType) }}</mat-icon>
              <span>Automatique ({{ CONTEXT_LABELS[def.contextType] }})</span>
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

    </div>

    <!-- Seuil global (optionnel) -->
    <div class="wizard-section">
      <div class="wizard-section-title">
        <span nz-icon nzType="dashboard"></span> Seuil de performance
        <mat-icon class="info-icon"
          nz-tooltip="Optionnel. Définit 3 zones colorées : ● Bon (vert) : valeur ≤ seuil Bon - ● Moyen (orange) : valeur entre Bon et Moyen - ● Critique (rouge) : valeur > seuil Moyen. Le seuil Critique est optionnel et sert de repère dans la légende - la carte est de toute façon rouge au-delà du seuil Moyen, que Critique soit renseigné ou non. Colore la valeur dans la carte et affiche la légende dans le panneau latéral."
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
        <div class="threshold-item">
          <label><span class="dot dot-red"></span> Critique &gt;</label>
          <nz-input-number
            [ngModel]="def.thresholds?.critical ?? null"
            (ngModelChange)="onThresholdCriticalChange($event)"
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

    <div class="wizard-section">
      <div class="wizard-section-title"><span nz-icon nzType="deployment-unit"></span> Construction du pipeline</div>

    <!-- Recettes / explorateur de schéma / toggle Visuel-Import : répartis sur toute la ligne -->
    <div class="step3-toolbar">
      <div class="step3-toolbar-group">
        <button nz-button nzType="default" nzSize="small" (click)="openRecipesModal()">
          <span nz-icon nzType="bulb"></span>
          Pipelines
        </button>
        <button nz-button nzType="default" nzSize="small" (click)="openSchemaExplorer()">
          <span nz-icon nzType="database"></span>
          Explorer le schéma PLaTon
        </button>
      </div>
      <div class="step3-toolbar-group">
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
          <button nz-button nzSize="small" nzType="default"
            (click)="formatImportText()"
            nz-tooltip="Réindente automatiquement le texte collé vers le mode actif ({{ importMode.toUpperCase() }}) - accepte du JSON ou du YAML en entrée, quel que soit le mode.">
            <span nz-icon nzType="align-left"></span> Formater
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
          Aucune étape - choisissez un pipeline prédéfini ou ajoutez manuellement.
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
    </ng-container>

    </div>

    <!-- Preview - uniquement en mode Visuel, comme avant (section à part, pas imbriquée dans
         "Construction du pipeline" pour que les deux restent des cartes indépendantes). -->
    <ng-container *ngIf="!showImport">
    <div class="wizard-section">
      <div class="wizard-section-title"><span nz-icon nzType="experiment"></span> Tester cette formule</div>
      <div class="preview-section">
        <div class="preview-inputs">
          <div class="preview-field">
            <label>Cours <mat-icon class="info-icon" nz-tooltip="Cours dans lequel chercher les données de test (toutes ressources PLaTon, recherche par nom). Ne filtre la requête que si l'étape 'fetch' a coché 'course_id' dans ses colonnes de contexte - sinon cette sélection sert juste à faire apparaître les activités/groupes/utilisateurs ci-dessous." nzTooltipPlacement="top">info_outline</mat-icon></label>
            <nz-select [(ngModel)]="previewCourseId" (ngModelChange)="onPreviewCourseChange($event)"
              nzPlaceHolder="Tous les cours" nzShowSearch [nzServerSearch]="true"
              (nzOnSearch)="onCourseSearch($event)" [nzDropdownRender]="courseLoadMoreTpl"
              [nzLoading]="previewCoursesLoading" style="width:260px">
              <nz-option *ngFor="let c of previewCourses" [nzValue]="c.id" [nzLabel]="c.name"></nz-option>
            </nz-select>
            <ng-template #courseLoadMoreTpl>
              <div *ngIf="previewCoursesHasMore" class="course-load-more">
                <nz-divider style="margin:4px 0"></nz-divider>
                <button nz-button nzType="link" nzBlock nzSize="small"
                  [nzLoading]="previewCoursesLoading"
                  (click)="$event.stopPropagation(); loadMoreCourses()">
                  Voir plus
                </button>
              </div>
            </ng-template>
          </div>
          <div class="preview-field">
            <label>Activité <mat-icon class="info-icon" nz-tooltip="Filtre sur l'activité, uniquement si l'étape 'fetch' a coché 'activity_id' dans ses colonnes de contexte. Laissé vide, ce filtre est simplement omis de la requête (pas d'erreur, pas de résultat vide - les données de toutes les activités remontent)." nzTooltipPlacement="top">info_outline</mat-icon></label>
            <nz-select [(ngModel)]="previewCtx.activityId" nzPlaceHolder="Toutes"
              nzShowSearch nzAllowClear [nzLoading]="previewActivitiesLoading"
              [nzDisabled]="!previewCourseId" style="width:220px">
              <nz-option *ngFor="let a of previewActivities" [nzValue]="a.id" [nzLabel]="a.name"></nz-option>
            </nz-select>
          </div>
          <div class="preview-field">
            <label>Groupe <mat-icon class="info-icon" nz-tooltip="Filtre sur le groupe de TP, uniquement si l'étape 'fetch' a coché 'group_id' dans ses colonnes de contexte - déclenche alors une requête différente (jointure vers les membres du groupe) qui exige aussi qu'une activité soit sélectionnée ci-dessus, sinon l'étape est ignorée." nzTooltipPlacement="top">info_outline</mat-icon></label>
            <nz-select [(ngModel)]="previewCtx.groupId" nzPlaceHolder="Aucun"
              nzShowSearch nzAllowClear [nzLoading]="previewGroupsLoading"
              [nzDisabled]="!previewCourseId" style="width:200px">
              <nz-option *ngFor="let g of previewGroups" [nzValue]="g.id" [nzLabel]="g.name"></nz-option>
            </nz-select>
          </div>
          <div class="preview-field">
            <label>Utilisateur <mat-icon class="info-icon" nz-tooltip="Filtre sur cet apprenant précis, uniquement si l'étape 'fetch' a coché 'user_id' dans ses colonnes de contexte. Laissé vide alors que 'user_id' est coché : le filtre est omis, la requête remonte les données de TOUS les utilisateurs (pas une erreur - à surveiller, le résultat peut sembler valide sans être celui attendu)." nzTooltipPlacement="top">info_outline</mat-icon></label>
            <nz-select [(ngModel)]="previewCtx.userId" nzPlaceHolder="Aucun"
              nzShowSearch nzAllowClear [nzLoading]="previewStudentsLoading"
              [nzDisabled]="!previewCourseId" style="width:220px">
              <nz-option *ngFor="let s of previewStudents" [nzValue]="s.id" [nzLabel]="s.name"></nz-option>
            </nz-select>
          </div>
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
            activityId={{ previewCtx.activityId || '-' }} &nbsp;|&nbsp;
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
    </div>
    </ng-container>

    <!-- Restriction de visibilité (optionnel, uniquement course/activity) -->
    <ng-container *ngIf="def.contextType === 'course' || def.contextType === 'activity'">
      <div class="wizard-section">
        <div class="wizard-section-title">
          <span nz-icon nzType="eye-invisible" style="color:#ff4d4f"></span>
          <span style="color:#ff4d4f">Restreindre la visibilité</span>
          <mat-icon class="info-icon"
            nz-tooltip="Optionnel. Un indicateur de contexte Cours ou Activité est visible par tous les rôles par défaut. Si son résultat expose des données nominatives (ex. performance détaillée par étudiant), sélectionnez ici les seuls rôles autorisés à le voir - par exemple Enseignant + Admin, pour l'exclure des étudiants."
            nzTooltipPlacement="right">info_outline</mat-icon>
        </div>
        <nz-select
          [(ngModel)]="def.visibilityRoles"
          nzMode="multiple"
          nzPlaceHolder="Aucune restriction (visible par tous les rôles)"
          style="width:100%">
          <nz-option *ngFor="let r of visibilityRoleOptions" [nzValue]="r.value" [nzLabel]="r.label"></nz-option>
        </nz-select>
      </div>
    </ng-container>

    <div class="wizard-section">
      <div class="wizard-section-title"><span nz-icon nzType="bell"></span> Événements déclencheurs</div>
    <nz-form-item>
      <nz-form-control>
        <div style="display:flex;align-items:center;gap:10px">
          <nz-switch [(ngModel)]="def.useTriggerEvents" (ngModelChange)="onUseTriggerEventsChange($event)"></nz-switch>
          <span>Activer des événements déclencheurs</span>
          <button nz-button nzType="link" nzSize="small" *ngIf="def.useTriggerEvents"
            (click)="showEventHint = !showEventHint" style="margin-left:auto">
            <span nz-icon nzType="question-circle"></span>
            Comment configurer l'événement pour ce pipeline ?
          </button>
        </div>
        <div style="margin-top:6px;font-size:12px;color:#999">
          Activé : l'indicateur est recalculé en temps réel dès qu'un événement choisi survient.
          Désactivé : l'indicateur est recalculé automatiquement chaque minute, sans événement précis.
        </div>

        <!-- Aide dynamique, propre au pipeline défini à l'étape ci-dessus (pas une modale : la
             suggestion dépend d'un état qui change en direct avec le pipeline). Uniquement
             pertinente si des événements déclencheurs sont effectivement utilisés. -->
        <div class="event-hint-panel" *ngIf="def.useTriggerEvents && showEventHint">
          <ng-container *ngIf="eventRuleHint() as hint; else noHintYet">
            <p class="event-hint-intro">
              Basé sur le pipeline défini ci-dessus - à vérifier/adapter dans "Autres" du
              sélecteur d'événements, pas une configuration garantie.
            </p>
            <div class="event-hint-row">
              <span class="event-hint-label">Table{{ hint.tables.length > 1 ? 's' : '' }} à surveiller</span>
              <span class="event-hint-value">
                <nz-tag *ngFor="let t of hint.tables">{{ t }}</nz-tag>
              </span>
            </div>
            <div class="event-hint-row" *ngIf="hint.columns.length">
              <span class="event-hint-label">Colonne(s) probablement pertinente(s)</span>
              <span class="event-hint-value">
                <nz-tag *ngFor="let c of hint.columns" nzColor="blue">{{ c }}</nz-tag>
              </span>
            </div>
            <div class="event-hint-row event-hint-row--mapping">
              <span class="event-hint-label">Mapping de contexte suggéré</span>
              <div class="event-hint-mapping">
                <div *ngFor="let m of hint.contextMapping" class="event-hint-mapping-row">
                  <span>{{ m.label }}</span>
                  <span [class.event-hint-mapping-missing]="!m.column">{{ m.column ?? 'non détecté - à choisir manuellement' }}</span>
                </div>
              </div>
            </div>
          </ng-container>
          <ng-template #noHintYet>
            <p class="event-hint-empty">
              Ajoutez au moins une étape "Récupérer données" (fetch) au pipeline ci-dessus pour
              voir une suggestion.
            </p>
          </ng-template>
        </div>
      </nz-form-control>
    </nz-form-item>
    <nz-form-item *ngIf="def.useTriggerEvents">
      <nz-form-label [nzRequired]="true">Événements <mat-icon class="info-icon" nz-tooltip="Événements PLaTon qui déclenchent l'ingestion de nouvelles données. L'indicateur est recalculé automatiquement quand ces événements surviennent." nzTooltipPlacement="right">info_outline</mat-icon></nz-form-label>
      <nz-form-control>
        <nz-select [(ngModel)]="def.requiredEvents" (ngModelChange)="onRequiredEventsChange($event)" nzMode="multiple"
          nzPlaceHolder="Sélectionner un ou plusieurs événements configurés" style="width:100%">
          <nz-option *ngFor="let evt of availableEventTypes"
            [nzValue]="evt.name" [nzLabel]="evt.name + ' - ' + evt.label">
          </nz-option>
          <nz-option [nzValue]="OTHER_EVENT_OPTION" nzLabel="Autres (configurer un nouvel événement...)"></nz-option>
        </nz-select>
      </nz-form-control>
    </nz-form-item>

    </div>
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
      <button nz-button *ngIf="step < 2" [nzLoading]="saving" [disabled]="!def.name.trim()" (click)="submit()"
        nz-tooltip="Enregistre l'indicateur tel quel, incomplet. Il n'apparaîtra pas aux utilisateurs tant qu'il n'est pas activé.">
        <span nz-icon nzType="save"></span> Sauvegarder le brouillon
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

<!-- ── Modal pipelines prédéfinis : grille ou détail d'un pipeline (vue interne, jamais une
     seconde modale par-dessus celle-ci) ────────────────────────────────────────────────── -->
<ng-template #recipesModalTpl>

  <nz-tabset *ngIf="!selectedRecipe" [(nzSelectedIndex)]="recipesActiveTab" nzSize="small">
    <nz-tab nzTitle="Prédéfinis">
      <div class="recipes-grid">
        <div class="recipe-card" *ngFor="let r of recipes" (click)="applyRecipeAndClose(r)">
          <div class="recipe-card-title">
            <span class="recipe-card-title-text">
              <span nz-icon nzType="bulb" style="font-size:14px"></span>
              {{ r.name }}
            </span>
            <button nz-button nzType="text" nzSize="small" class="recipe-card-eye"
              (click)="showRecipeDetail(r); $event.stopPropagation()" nz-tooltip="Voir le détail">
              <span nz-icon nzType="eye"></span>
            </button>
          </div>
          <div class="recipe-card-body">{{ r.desc }}</div>
        </div>
      </div>
    </nz-tab>

    <nz-tab nzTitle="Depuis les indicateurs existants">
      <div class="recipes-grid" *ngIf="existingPipelines.length; else noExisting">
        <div class="recipe-card" *ngFor="let r of existingPipelines" (click)="applyRecipeAndClose(r)">
          <div class="recipe-card-title">
            <span class="recipe-card-title-text">
              <span nz-icon nzType="deployment-unit" style="font-size:14px"></span>
              {{ r.name }}
            </span>
            <button nz-button nzType="text" nzSize="small" class="recipe-card-eye"
              (click)="showRecipeDetail(r); $event.stopPropagation()" nz-tooltip="Voir le détail">
              <span nz-icon nzType="eye"></span>
            </button>
          </div>
          <div class="recipe-card-body">{{ r.desc }}</div>
        </div>
      </div>
      <ng-template #noExisting>
        <p class="section-hint">Aucun indicateur actif avec un pipeline pour l'instant.</p>
      </ng-template>
    </nz-tab>
  </nz-tabset>

  <!-- Vue détail - pas de bouton "Retour" séparé : le X de la modale sert de retour ici
       (voir openRecipesModal(), nzOnCancel), et referme réellement la modale seulement
       depuis la vue grille. -->
  <div *ngIf="selectedRecipe as r">
    <div class="recipe-detail">

      <!-- Colonne gauche : contexte (objectif / utilisation / adaptation) pour les recettes
           prédéfinies, ou simple liste "utilisé par" pour un pipeline issu d'indicateurs
           existants (pas de texte curaté disponible dans ce cas). -->
      <div class="recipe-detail-info">
        <ng-container *ngIf="r.detail; else usedByBlock">
          <div class="recipe-detail-section recipe-detail-section--objectif">
            <div class="recipe-detail-section-title">
              <span nz-icon nzType="aim"></span> Objectif
            </div>
            <p>{{ r.detail.objectif }}</p>
          </div>

          <div class="recipe-detail-section recipe-detail-section--utilisation">
            <div class="recipe-detail-section-title">
              <span nz-icon nzType="play-circle"></span> Utilisation
            </div>
            <p>{{ r.detail.utilisation }}</p>
          </div>

          <div class="recipe-detail-section recipe-detail-section--adapter">
            <div class="recipe-detail-section-title">
              <span nz-icon nzType="tool"></span> Comment adapter
            </div>
            <p>{{ r.detail.adapter }}</p>
          </div>
        </ng-container>
        <ng-template #usedByBlock>
          <div class="recipe-detail-section recipe-detail-section--objectif">
            <div class="recipe-detail-section-title">
              <span nz-icon nzType="deployment-unit"></span> Utilisé par
            </div>
            <p *ngFor="let name of r.usedBy">{{ name }}</p>
          </div>
        </ng-template>
      </div>

      <!-- Colonne droite : pipeline -->
      <div class="recipe-detail-pipeline">
        <div class="recipe-detail-pipeline-title">
          Pipeline <span class="recipe-detail-pipeline-count">{{ r.pipeline.length }} étape{{ r.pipeline.length > 1 ? 's' : '' }}</span>
        </div>
        <div class="recipe-detail-steps">
          <div class="recipe-detail-step" *ngFor="let s of r.pipeline; let i = index; let last = last">
            <div class="recipe-detail-step-num">{{ i + 1 }}</div>
            <div class="recipe-detail-step-body">
              <span class="recipe-detail-step-type" [style.background]="stepTypeColor(s.type)">{{ s.type }}</span>
              <span class="recipe-detail-step-label">{{ s.label }}</span>

              <pre class="recipe-detail-step-code" *ngIf="s.type === 'js'">{{ s.jsCode }}</pre>

              <div class="recipe-detail-step-info" *ngIf="s.type !== 'js'">
                <div class="recipe-detail-step-info-row" *ngFor="let d of stepDetails(s)">
                  <span class="recipe-detail-step-info-label">{{ d.label }} :</span>
                  <span class="recipe-detail-step-info-value">{{ d.value }}</span>
                </div>
              </div>
            </div>
            <div class="recipe-detail-step-connector" *ngIf="!last"></div>
          </div>
        </div>
      </div>

    </div>

    <div class="recipe-detail-actions">
      <button nz-button nzType="primary" (click)="applyRecipeAndClose(r)">
        <span nz-icon nzType="check"></span> Utiliser ce pipeline
      </button>
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
      <nz-tabset [(nzSelectedIndex)]="schemaViewTab" nzSize="small" style="margin-top:4px">

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

      </nz-tabset>

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

    .icon-preview {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: #fafafa;
      border: 1px solid #e8e8e8;
      border-radius: 6px;
      width: 100%;
      box-sizing: border-box;
      color: #595959;
      font-size: 12px;
    }
    .icon-preview mat-icon { color: #1890ff; }

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

    .section-hint { color: #888; font-size: 12px; margin: 4px 0 10px; }

    /* Sections bien délimitées dans chaque étape du wizard - remplace les simples nz-divider */
    .wizard-section { border: 1px solid #1890ff; border-radius: 10px; padding: 16px 18px; margin-bottom: 16px; background: #fff; }
    .wizard-section:last-child { margin-bottom: 0; }
    .wizard-section-title { font-size: 13px; font-weight: 600; color: #444; margin-bottom: 14px; display: flex; align-items: center; gap: 6px; }

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

    /* Modale "Pipelines" - style calqué sur .compare-card (modale "Comparaison par groupe") */
    .recipes-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .recipe-card {
      border: 1px solid #f0f0f0; border-radius: 10px; overflow: hidden;
      background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.06); cursor: pointer;
      transition: border-color .15s, box-shadow .15s;
    }
    .recipe-card:hover { border-color: #722ed1; box-shadow: 0 4px 12px rgba(114,46,209,.12); }
    .recipe-card-title {
      display: flex; align-items: center; justify-content: space-between; gap: 6px;
      padding: 10px 14px; background: #f9f0ff; border-bottom: 1px solid #efdbff;
      font-size: 13px; font-weight: 600; color: #531dab;
    }
    .recipe-card-title-text { display: flex; align-items: center; gap: 6px; }
    .recipe-card-eye { color: #9254de; margin: -4px -6px -4px 0; }
    .recipe-card-eye:hover { color: #531dab; background: #efdbff; }
    .recipe-card-body { padding: 12px 14px; font-size: 12px; color: #888; line-height: 1.5; }

    /* Détail d'un pipeline - paysage, 2 sections côte à côte */
    .recipe-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
    .recipe-detail-info { display: flex; flex-direction: column; gap: 14px; }
    .recipe-detail-section { border-radius: 8px; padding: 12px 14px; background: #fafafa; border-left: 3px solid #d9d9d9; }
    .recipe-detail-section-title { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 6px; }
    .recipe-detail-section p { margin: 0; color: #333; font-size: 13px; line-height: 1.6; }
    .recipe-detail-section--objectif { border-left-color: #1890ff; }
    .recipe-detail-section--objectif .recipe-detail-section-title { color: #1890ff; }
    .recipe-detail-section--utilisation { border-left-color: #52c41a; }
    .recipe-detail-section--utilisation .recipe-detail-section-title { color: #52c41a; }
    .recipe-detail-section--adapter { border-left-color: #fa8c16; }
    .recipe-detail-section--adapter .recipe-detail-section-title { color: #fa8c16; }

    .recipe-detail-pipeline { border: 1px solid #f0f0f0; border-radius: 8px; padding: 16px; background: #fff; }
    .recipe-detail-pipeline-title { font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .6px; color: #595959; margin-bottom: 14px; display: flex; align-items: baseline; gap: 8px; }
    .recipe-detail-pipeline-count { font-weight: 400; text-transform: none; letter-spacing: 0; color: #bbb; font-size: 11px; }
    .recipe-detail-steps { display: flex; flex-direction: column; }
    .recipe-detail-step { position: relative; display: flex; align-items: flex-start; gap: 10px; padding-bottom: 18px; }
    .recipe-detail-step-num {
      width: 22px; height: 22px; border-radius: 50%; background: #f0f0f0; color: #888;
      display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;
      flex-shrink: 0; z-index: 1;
    }
    .recipe-detail-step-body { display: flex; flex-direction: column; gap: 4px; padding-top: 2px; flex: 1; min-width: 0; }
    .recipe-detail-step-type { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #fff; width: fit-content; }
    .recipe-detail-step-label { font-size: 13px; color: #444; }
    .recipe-detail-step-connector { position: absolute; left: 10px; top: 22px; bottom: 0; width: 2px; background: #f0f0f0; }
    .recipe-detail-step-info { display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }
    .recipe-detail-step-info-row { display: flex; gap: 6px; font-size: 12px; }
    .recipe-detail-step-info-label { color: #999; flex-shrink: 0; }
    .recipe-detail-step-info-value { color: #555; word-break: break-word; }
    .recipe-detail-step-code {
      margin-top: 4px; padding: 8px 10px; background: #282c34; color: #abb2bf;
      border-radius: 6px; font-family: 'Fira Code', 'Courier New', monospace; font-size: 12px;
      line-height: 1.5; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto;
    }
    .recipe-detail-actions { display: flex; justify-content: flex-end; margin-top: 16px; }

    /* Aide dynamique "comment configurer l'événement pour ce pipeline" */
    .event-hint-panel { margin-top: 10px; padding: 12px 14px; background: #f9f0ff; border: 1px solid #efdbff; border-radius: 6px; }
    .event-hint-intro { margin: 0 0 10px; font-size: 12px; color: #531dab; font-style: italic; }
    .event-hint-row { margin-bottom: 10px; display: flex; align-items: flex-start; gap: 10px; }
    .event-hint-row:last-child { margin-bottom: 0; }
    .event-hint-label { flex-shrink: 0; width: 220px; font-size: 12px; font-weight: 600; color: #595959; }
    .event-hint-value { display: flex; flex-wrap: wrap; gap: 4px; }
    .event-hint-mapping { display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .event-hint-mapping-row { display: flex; justify-content: space-between; font-size: 12px; color: #333; }
    .event-hint-mapping-missing { color: #bbb; font-style: italic; }
    .event-hint-empty { margin: 0; font-size: 12px; color: #888; }

    .mode-toggle { display: flex; gap: 4px; margin-bottom: 10px; justify-content: flex-end; }
    .step3-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .step3-toolbar-group { display: flex; align-items: center; gap: 8px; }

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
    .preview-inputs  { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
    .preview-field   { display: flex; flex-direction: column; gap: 4px; }
    .preview-field label { font-size: 12px; font-weight: 500; color: #595959; display: flex; align-items: center; gap: 4px; }
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
  @ViewChild('recipesModalTpl')   private recipesModalTplRef!: TemplateRef<any>;
  @ViewChild('schemaExplorerTpl') private schemaExplorerTplRef!: TemplateRef<any>;
  private readonly hostEl = inject(ElementRef);
  private readonly modalData    = inject(NZ_MODAL_DATA, { optional: true }) as {
    indicator?: IndicatorDefinition;
    familyPreset?: IndicatorFamilyPreset;
    familyQueue?: IndicatorScope[];
    /** Réutilisation choisie dans la modale de démarrage (blanc/réutiliser/import), avant
     *  l'ouverture de ce wizard - alternative à `familyPreset` pour une création standard. */
    reuseSeed?: { source: IndicatorDefinition; override: ReuseIndicatorResult };
    /** Import YAML/JSON choisi et déjà validé dans la modale de démarrage (voir
     *  NewIndicatorChoiceModalComponent.chooseImport()) - appliqué tel quel dès l'ouverture du
     *  wizard, aucune re-validation nécessaire. */
    importSeed?: { pipeline: PipelineStep[]; meta: ImportedIndicatorMeta };
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
    return `Famille « ${preset.familyName} » - contexte ${current}/${total} (${CONTEXT_LABELS[preset.contextType]})`;
  }

  step = 0;
  saving = false;
  activeVizIndex = 0;

  // ── Détection de doublons ─────────────────────────────────────────────────
  private readonly nameSearch$ = new Subject<string>();
  similarIndicators: IndicatorDefinition[] = [];
  similarSearching = false;

  // ── Recherche serveur du cours (panneau "Tester cette formule") ─────────────
  private readonly courseSearch$ = new Subject<string>();
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
      ? '# name: "..."\n# pipeline:\n#   - type: fetch\n#     label: "..."'
      : '{ "name": "...", "pipeline": [ { "type": "fetch", "label": "...", "params": {} } ] }';
  }

  get importDocsText(): string {
    return `╔══════════════════════════════════════════════════════════════════╗
║   RÉFÉRENCE COMPLÈTE - Format ${this.importMode.toUpperCase().padEnd(4)} - Indicateur complet       ║
╚══════════════════════════════════════════════════════════════════╝

${this.importMode === 'yaml' ? `STRUCTURE DE BASE
─────────────────
name: "..."                  # obligatoire - nom de l'indicateur
description: "..."           # optionnel
interpretationHint: "..."    # optionnel  - aide à l'analyse
requiredEvents: [...]        # optionnel  - noms d'événements déclencheurs
contextType: learner         # optionnel  - learner | teacher | admin | course | activity | group
thresholds:                  # optionnel  - { good, warning, critical }
  good: 80
visualizations:               # optionnel  - liste de { label, type, icon, color, unit }
  - label: "Vue principale"
    type: card
pipeline:                    # obligatoire - liste d'étapes
  - type: <type>      # obligatoire - nom technique de l'étape (voir liste ci-dessous)
    label: "..."      # optionnel  - nom affiché dans le builder (généré auto si absent)
    params:           # obligatoire - paramètres propres à chaque type
      ...

Seul un champ absent de l'import conserve la valeur déjà saisie dans le formulaire ; "name" et
"pipeline" doivent toujours être présents.` : `{
  "name": "...",                  // obligatoire - nom de l'indicateur
  "description": "...",           // optionnel
  "interpretationHint": "...",    // optionnel  - aide à l'analyse
  "requiredEvents": [...],        // optionnel  - noms d'événements déclencheurs
  "contextType": "learner",       // optionnel  - learner | teacher | admin | course | activity | group
  "thresholds": { "good": 80 },   // optionnel  - { good, warning, critical }
  "visualizations": [             // optionnel  - liste de { label, type, icon, color, unit }
    { "label": "Vue principale", "type": "card" }
  ],
  "pipeline": [                   // obligatoire - liste d'étapes
    {
      "type": "<type>",    // obligatoire - nom technique (voir liste ci-dessous)
      "label": "...",      // optionnel  - affiché dans le builder (généré auto si absent)
      "params": { ... }    // obligatoire - paramètres propres à chaque type
    }
  ]
}

Seul un champ absent de l'import conserve la valeur déjà saisie dans le formulaire ; "name" et
"pipeline" doivent toujours être présents.`}

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
${this.importMode === 'yaml' ? `name: "Note moyenne"
pipeline:
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
  "name": "Note moyenne",
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
  readonly OTHER_EVENT_OPTION = '__create_new__';

  /** L'option "Autres" du sélecteur d'événements n'est pas un vrai événement - elle ouvre le
   *  gestionnaire d'événements & règles directement depuis le wizard, puis se retire elle-même
   *  de la sélection (elle ne doit jamais être envoyée au backend comme requiredEvents). */
  onRequiredEventsChange(values: string[]): void {
    if (!values.includes(this.OTHER_EVENT_OPTION)) return;
    this.def.requiredEvents = values.filter(v => v !== this.OTHER_EVENT_OPTION);
    const ref = this.modalSvc.create({
      nzTitle: 'Événements & déclencheurs',
      nzContent: EventRuleManagerComponent,
      nzFooter: null,
      nzWidth: '80vw',
      nzCentered: true,
      nzBodyStyle: { 'max-height': '80vh', 'overflow-y': 'auto' },
    });
    ref.afterClose.subscribe(() => {
      this.indicatorSvc.getEventTypes(true).subscribe({
        next: types => { this.availableEventTypes = types; this.cdr.detectChanges(); },
        error: () => {},
      });
    });
  }

  // ── Aide dynamique "comment configurer l'événement pour ce pipeline" ────────
  showEventHint = false;

  private static readonly CONTEXT_FIELD_PATTERNS: { label: string; patterns: string[] }[] = [
    { label: 'Utilisateur concerné', patterns: ['user_id'] },
    { label: 'Cours',                patterns: ['course_id'] },
    { label: 'Activité',             patterns: ['activity_id'] },
    { label: 'Session',              patterns: ['session_id'] },
  ];

  /** Suggère une configuration de règle event-rule à partir du pipeline courant (table,
   *  colonnes, mapping de contexte) - une suggestion à vérifier, jamais une garantie. */
  eventRuleHint(): {
    tables: string[];
    columns: string[];
    contextMapping: { label: string; column: string | null }[];
  } | null {
    const fetchStep = this.pipeline.find(s => s.type === 'fetch');
    if (!fetchStep) return null;

    const tables = new Set<string>();
    if (fetchStep.table) tables.add(fetchStep.table);
    for (const s of this.pipeline) {
      if (s.type === 'join' && s.joinTable) tables.add(s.joinTable);
    }

    const columns = new Set<string>();
    for (const s of this.pipeline) {
      if (s.type === 'extract' && s.extractField) columns.add(s.extractField);
      if (s.type === 'filter' && s.filterField) columns.add(s.filterField);
      if (s.type === 'groupBy' && s.groupField) columns.add(s.groupField);
      if (s.type === 'findFirst') {
        if (s.whereField) columns.add(s.whereField);
        if (s.sortField) columns.add(s.sortField);
      }
    }

    const contextFields = [...(fetchStep.contextFields ?? [])];
    for (const s of this.pipeline) {
      if (s.type === 'join' && s.joinContextFields) contextFields.push(...s.joinContextFields);
    }

    const contextMapping = IndicatorBuilderComponent.CONTEXT_FIELD_PATTERNS.map(({ label, patterns }) => ({
      label,
      column: contextFields.find(f => patterns.some(p => f === p || f.includes(p))) ?? null,
    }));

    return { tables: [...tables], columns: [...columns], contextMapping };
  }

  // Label-picker du panneau de test : sélection en cascade Cours → Groupe/Activité/Utilisateur
  previewCourseId: string | null = null;
  previewCourses: TeacherCourse[] = [];
  previewCoursesLoading = false;
  // Pagination "charger plus" (10 par page) sur la recherche de cours - voir loadMoreCourses().
  private previewCoursesQuery = '';
  private previewCoursesOffset = 0;
  previewCoursesHasMore = false;
  previewActivities: CourseActivity[] = [];
  previewActivitiesLoading = false;
  previewGroups: { id: string; name: string }[] = [];
  previewGroupsLoading = false;
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

  readonly stepCatalog = STEP_CATALOG;
  readonly recipes     = FORMULA_RECIPES;
  readonly CONTEXT_LABELS = CONTEXT_LABELS;
  readonly contextIcon = contextIcon;
  selectedRecipe: PipelineCatalogItem | null = null;
  // Onglet "Depuis les indicateurs existants" de la modale Pipelines - chargé une seule fois à
  // la première ouverture (indicateurs ACTIFS uniquement, un brouillon peut être incomplet),
  // dédupliqué par contenu réel du pipeline (type+params, l'id et le label sont ignorés).
  existingPipelines: PipelineCatalogItem[] = [];
  private existingPipelinesLoaded = false;
  recipesActiveTab = 0;
  readonly contextFilterCols = [
    { value: 'user_id',     label: 'user_id - apprenant courant' },
    { value: 'activity_id', label: 'activity_id - activité sélectionnée' },
    { value: 'course_id',   label: 'course_id - cours sélectionné' },
  ];

  // ── Réutiliser un indicateur existant (capitalisation) - choix fait en amont dans la modale
  //    de démarrage (NewIndicatorChoiceModalComponent) ; ce composant ne fait plus qu'appliquer
  //    le résultat (`modalData.reuseSeed`) via composeFromReuseSource(), voir ngOnInit. ─────────
  reuseAppliedName: string | null = null;

  private composeFromReuseSource(src: IndicatorDefinition, override: ReuseIndicatorResult): void {
    // Étape 1 (Général)
    this.def.name               = `${src.name} (copie)`;
    this.def.description        = src.description || '';
    this.def.interpretationHint = src.interpretationHint || '';
    this.def.requiredEvents     = [...(src.requiredEvents || [])];
    this.def.useTriggerEvents   = this.def.requiredEvents.length > 0;

    // Étape 2 (Contexte / seuils / visualisations)
    this.def.contextType = src.contextType ?? 'learner';
    this.def.thresholds  = src.thresholds
      ? { good: src.thresholds.good ?? null, warning: src.thresholds.warning ?? null, critical: src.thresholds.critical ?? null }
      : null;
    const vizs = src.visualizations ?? [];
    this.vizList = vizs.length > 0
      ? vizs.map(v => ({
          id:    crypto.randomUUID(),
          label: v.label ?? 'Vue',
          type:  v.type ?? 'card',
          icon:  v.icon ?? 'analytics',
          color: v.color ?? '#722ed1',
          unit:  v.unit ?? '',
        }))
      : [this.newViz('Vue principale', 'card')];

    // Étape 3 (Formule)
    if (!src.formula?.pipeline?.length) {
      this.def.baseIndicatorId = src.id;
      this.reuseAppliedName = src.name;
      this.messageSvc.success(`"${src.name}" copié comme point de départ.`);
      return;
    }

    const cloned = src.formula.pipeline.map((s: any) => ({ ...s, params: { ...s.params } }));
    const fetchStep: any = cloned.find((s: any) => s.type === 'fetch');
    if (fetchStep) {
      const fields = [...override.contextFields];
      if (override.useGroupContext) fields.push('group_id');
      fetchStep.params = { ...fetchStep.params, contextFields: fields };
    }

    this.pipeline = cloned.map((s: any) => dehydrateStep(s));
    this.def.baseIndicatorId = src.id;
    this.reuseAppliedName = src.name;
    this.messageSvc.success(`"${src.name}" copié comme point de départ.`);
  }
  platonSchema: PlatonTableSchema[] = [];
  schemaLoading = false;

  private readonly _colsCache = new Map<string, { value: string; label: string }[]>();

  // ── Modèle du formulaire ─────────────────────────────────────────────────

  def: {
    name: string;
    description: string;
    interpretationHint: string;
    requiredEvents: string[];
    /** Flag UI-only (jamais envoyé au backend) : pilote l'affichage du bloc "Événements" à
     *  l'étape Formules. Décoché → requiredEvents vide, l'indicateur est recalculé par le
     *  cron minute côté serveur plutôt que par un événement précis. */
    useTriggerEvents: boolean;
    contextType: IndicatorScope;
    thresholds: { good: number | null; warning: number | null; critical: number | null } | null;
    visibilityRoles: string[] | null;
    baseIndicatorId: string | null;
  } = { name: '', description: '', interpretationHint: '', requiredEvents: [], useTriggerEvents: false, contextType: 'learner', thresholds: null, visibilityRoles: null, baseIndicatorId: null };

  readonly visibilityRoleOptions: { value: string; label: string }[] = [
    { value: 'student', label: 'Étudiant' },
    { value: 'teacher', label: 'Enseignant' },
    { value: 'admin', label: 'Admin' },
  ];

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

    this.indicatorSvc.getEventTypes(true).subscribe({
      next: types => { this.availableEventTypes = types; this.cdr.detectChanges(); },
      error: () => { this.availableEventTypes = []; },
    });
    if (this.modalData?.indicator) {
      this.hydrate(this.modalData.indicator);
    } else {
      // reuseSeed/importSeed écrasent les valeurs ensuite, sauf le contexte, imposé par le slot
      if (this.modalData?.familyPreset) this.applyFamilyPreset(this.modalData.familyPreset);
      if (this.modalData?.reuseSeed) {
        this.composeFromReuseSource(this.modalData.reuseSeed.source, this.modalData.reuseSeed.override);
        if (this.modalData?.familyPreset) this.def.contextType = this.modalData.familyPreset.contextType;
      }
      if (this.modalData?.importSeed) {
        // Déjà validé (y compris colonnes/tables) dans la modale de choix initial - simple
        // application, aucune re-validation ni fallback d'erreur nécessaire ici.
        this.pipeline = this.modalData.importSeed.pipeline;
        this.applyImportedMeta(this.modalData.importSeed.meta);
        if (this.modalData?.familyPreset) this.def.contextType = this.modalData.familyPreset.contextType;
      }
    }

    // Chargement initial : les 10 premiers cours (toutes ressources PLaTon, pas seulement
    // celles de l'utilisateur courant - voir courseSearch$ ci-dessous pour la recherche, et
    // loadMoreCourses() pour charger la suite, 10 par 10).
    this.previewCoursesLoading = true;
    this.indicatorSvc.searchCourses('').subscribe({
      next: courses => {
        this.previewCourses = courses;
        this.previewCoursesOffset = courses.length;
        this.previewCoursesHasMore = courses.length === 10;
        this.previewCoursesLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.previewCoursesLoading = false; },
    });

    // Recherche serveur sur le sélecteur de cours (nzServerSearch) - debounce pour ne pas
    // spammer le backend à chaque frappe, 10 résultats par page côté serveur (voir
    // loadMoreCourses() pour la suite).
    this.courseSearch$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        this.previewCoursesLoading = true;
        this.previewCoursesQuery = q;
        return this.indicatorSvc.searchCourses(q);
      }),
    ).subscribe({
      next: courses => {
        this.previewCourses = courses;
        this.previewCoursesOffset = courses.length;
        this.previewCoursesHasMore = courses.length === 10;
        this.previewCoursesLoading = false;
        this.cdr.detectChanges();
      },
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

  onCourseSearch(value: string): void {
    this.courseSearch$.next(value);
  }

  /** Ajoute (n'écrase pas) la page suivante de cours - déclenché en scrollant jusqu'en bas du
   *  menu déroulant (nzScrollToBottom), même recherche que celle actuellement tapée. */
  loadMoreCourses(): void {
    if (this.previewCoursesLoading || !this.previewCoursesHasMore) return;
    this.previewCoursesLoading = true;
    this.indicatorSvc.searchCourses(this.previewCoursesQuery, this.previewCoursesOffset).subscribe({
      next: courses => {
        this.previewCourses = [...this.previewCourses, ...courses];
        this.previewCoursesOffset += courses.length;
        this.previewCoursesHasMore = courses.length === 10;
        this.previewCoursesLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.previewCoursesLoading = false; },
    });
  }

  // ── Création d'un nouveau type d'événement ("Autres…" dans le sélecteur) ──

  openPreview(ind: IndicatorDefinition): void {
    this.previewIndicator = ind;
    this.previewModalVisible = true;
  }

  // ── Label-picker du panneau de test ──────────────────────────────────────

  onPreviewCourseChange(courseId: string | null): void {
    this.previewCtx.groupId = '';
    this.previewCtx.activityId = '';
    this.previewActivities = [];
    this.previewGroups = [];
    this.previewStudents = [];
    if (!courseId) return;

    this.previewActivitiesLoading = true;
    this.indicatorSvc.getCourseActivities(courseId).subscribe({
      next: activities => { this.previewActivities = activities; this.previewActivitiesLoading = false; this.cdr.detectChanges(); },
      error: () => { this.previewActivitiesLoading = false; },
    });

    // Chargement dédié plutôt que dérivé du cache de recherche de cours (previewCourses) : ce
    // cache est remplacé à chaque nouvelle recherche ou page suivante, et peut ne plus contenir
    // le cours sélectionné - les groupes semblaient alors "ne jamais charger".
    this.previewGroupsLoading = true;
    this.indicatorSvc.getCourseGroups(courseId).subscribe({
      next: groups => { this.previewGroups = groups; this.previewGroupsLoading = false; this.cdr.detectChanges(); },
      error: () => { this.previewGroupsLoading = false; },
    });

    this.previewStudentsLoading = true;
    this.indicatorSvc.getCourseStudents(courseId).subscribe({
      next: students => { this.previewStudents = students; this.previewStudentsLoading = false; this.cdr.detectChanges(); },
      error: () => { this.previewStudentsLoading = false; },
    });
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  canProceed(): boolean {
    if (this.step === 0) return !!this.def.name.trim();
    if (this.step === 1) return !!this.def.contextType && this.vizList.length > 0;
    return true;
  }

  /** Décoché → on vide la sélection pour ne jamais soumettre un requiredEvents "fantôme", et on
   *  referme l'aide (plus pertinente sans événements activés). */
  onUseTriggerEventsChange(enabled: boolean): void {
    if (!enabled) {
      this.def.requiredEvents = [];
      this.showEventHint = false;
    }
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
    if (!this.def.thresholds) this.def.thresholds = { good: null, warning: null, critical: null };
    this.def.thresholds.good = val;
  }

  onThresholdWarningChange(val: number | null): void {
    if (val === null) { if (this.def.thresholds) this.def.thresholds.warning = null; return; }
    if (!this.def.thresholds) this.def.thresholds = { good: null, warning: null, critical: null };
    this.def.thresholds.warning = val;
  }

  onThresholdCriticalChange(val: number | null): void {
    if (val === null) { if (this.def.thresholds) this.def.thresholds.critical = null; return; }
    if (!this.def.thresholds) this.def.thresholds = { good: null, warning: null, critical: null };
    this.def.thresholds.critical = val;
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

  applyRecipe(r: PipelineCatalogItem): void {
    this.pipeline = r.pipeline.map(s => ({ ...s, id: crypto.randomUUID() })) as PipelineStep[];
    if (this.showImport) {
      this.importText = this.pipelineToText(this.pipeline, this.importMode);
      this.importError = null;
    }
  }

  /** Les recettes s'ouvrent dans une modale dédiée. Le détail d'un pipeline (bouton œil) est
   *  une vue interne de cette même modale, jamais une seconde modale par-dessus. */
  private recipesModalRef: NzModalRef | null = null;

  openRecipesModal(): void {
    this.selectedRecipe = null;
    this.recipesActiveTab = 0;
    this.loadExistingPipelines();
    this.recipesModalRef = this.modalSvc.create({
      nzTitle: 'Pipelines',
      nzContent: this.recipesModalTplRef,
      nzWidth: 820,
      nzCentered: true,
      nzFooter: null,
      // Le X sert de "retour" tant qu'on est sur la vue détail (pas de bouton dédié) - ne
      // referme réellement la modale que depuis la vue grille.
      nzOnCancel: () => {
        if (this.selectedRecipe) { this.backToRecipesGrid(); return false; }
        return true;
      },
    });
  }

  /** Construit l'onglet "Depuis les indicateurs existants" : un pipeline par groupe
   *  d'indicateurs (actifs uniquement) partageant EXACTEMENT le même contenu de pipeline
   *  (type+params de chaque étape - l'id et le label affiché n'entrent pas dans la comparaison). */
  private loadExistingPipelines(): void {
    if (this.existingPipelinesLoaded) return;
    this.indicatorSvc.loadIndicators().subscribe(indicators => {
      const groups = new Map<string, { names: string[]; rawPipeline: any[] }>();
      for (const ind of indicators) {
        const rawPipeline = ind.formula?.pipeline;
        if (!rawPipeline?.length) continue;
        const fingerprint = JSON.stringify(rawPipeline.map((s: any) => ({ type: s.type, params: s.params })));
        const group = groups.get(fingerprint);
        if (group) group.names.push(ind.name);
        else groups.set(fingerprint, { names: [ind.name], rawPipeline });
      }
      this.existingPipelines = Array.from(groups.values()).map(g => ({
        name: g.names.length > 1 ? `${g.names[0]} (+${g.names.length - 1} autre${g.names.length > 2 ? 's' : ''})` : g.names[0],
        desc: `${g.rawPipeline.length} étape${g.rawPipeline.length > 1 ? 's' : ''}`,
        usedBy: g.names,
        pipeline: g.rawPipeline.map(s => dehydrateStep(s)) as Omit<PipelineStep, 'id'>[],
      }));
      this.existingPipelinesLoaded = true;
      this.cdr.markForCheck();
    });
  }

  /** Détail complet d'une étape pour la vue "Pipeline" des cartes (Prédéfinis / Existants) - le
   *  type JS est traité à part dans le template (bloc de code en lecture seule). */
  protected stepDetails(s: PipelineStep): { label: string; value: string }[] {
    switch (s.type) {
      case 'fetch':
        return [
          { label: 'Table', value: s.table || '—' },
          { label: 'Filtrer par contexte', value: s.contextFields?.length ? s.contextFields.join(', ') : '—' },
          { label: 'Requête groupe de TP', value: s.useGroupContext ? 'Oui' : 'Non' },
        ];
      case 'join':
        return [
          { label: 'Table jointe', value: s.joinTable || '—' },
          { label: 'Type de jointure', value: (s.joinType || 'left').toUpperCase() },
          { label: 'Clé left', value: s.joinLeftKey || '—' },
          { label: 'Clé right', value: s.joinRightKey || '—' },
          { label: 'Filtrer par contexte', value: s.joinContextFields?.length ? s.joinContextFields.join(', ') : '—' },
        ];
      case 'filter':
        return [
          { label: 'Champ', value: s.filterField || '—' },
          { label: 'Opérateur', value: s.filterOperator || '—' },
          { label: 'Valeur', value: s.filterValue != null ? String(s.filterValue) : '—' },
        ];
      case 'groupBy':
        return [{ label: 'Grouper par', value: s.groupField || '—' }];
      case 'findFirst':
        return [
          { label: 'Condition (champ)', value: s.whereField || '—' },
          { label: 'Valeur attendue', value: s.whereValue != null ? String(s.whereValue) : '—' },
          { label: 'Trier par', value: s.sortField || '—' },
        ];
      case 'extract':
        return [{ label: 'Champ à extraire', value: s.extractField || '—' }];
      case 'aggregate':
        return [{ label: 'Fonction', value: s.aggregateFn || '—' }];
      case 'round':
        return [{ label: 'Décimales', value: s.decimals != null ? String(s.decimals) : '—' }];
      case 'divide':
        return [{ label: 'Diviser par', value: s.divideBy != null ? String(s.divideBy) : '—' }];
      default:
        return [];
    }
  }

  showRecipeDetail(r: PipelineCatalogItem): void {
    this.selectedRecipe = r;
    this.recipesModalRef?.updateConfig({ nzTitle: r.name, nzWidth: 920 });
  }

  backToRecipesGrid(): void {
    this.selectedRecipe = null;
    this.recipesModalRef?.updateConfig({ nzTitle: 'Pipelines', nzWidth: 820 });
  }

  applyRecipeAndClose(r: PipelineCatalogItem): void {
    this.applyRecipe(r);
    this.recipesModalRef?.close();
    this.recipesModalRef = null;
    this.selectedRecipe = null;
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

  /** Réindente le texte collé dans le langage du mode actif, sans jamais convertir d'un format
   *  à l'autre. N'écrase le texte que si le parsing réussit. */
  formatImportText(): void {
    if (this.importMode === 'json') {
      try {
        this.importText = JSON.stringify(JSON.parse(this.importText), null, 2);
        this.importError = null;
      } catch {
        this.messageSvc.error('Impossible de formater : le texte n\'est pas du JSON valide.');
      }
      return;
    }
    if (looksLikeJson(this.importText)) {
      this.messageSvc.error('Ce texte est du JSON, pas du YAML - passez en mode JSON pour le formater tel quel.');
      return;
    }
    try {
      this.importText = yaml.dump(yaml.load(this.importText), { lineWidth: -1 });
      this.importError = null;
    } catch {
      this.messageSvc.error('Impossible de formater : le texte contient une erreur de syntaxe YAML.');
    }
  }

  /** Sérialise l'indicateur courant (nom, description, événements, seuils, visualisations et
   *  pipeline) en YAML/JSON pour ré-édition - un export produit ici doit pouvoir être
   *  ré-importé à l'identique par parseStep3Text(). */
  private pipelineToText(pipeline: PipelineStep[], mode: 'yaml' | 'json'): string {
    if (!pipeline.length) return '';
    const raw: Record<string, unknown> = {
      name: this.def.name || undefined,
      description: this.def.description || undefined,
      interpretationHint: this.def.interpretationHint || undefined,
      requiredEvents: this.def.requiredEvents.length ? this.def.requiredEvents : undefined,
      contextType: this.def.contextType,
      thresholds: this.def.thresholds ?? undefined,
      visualizations: this.vizList.length
        ? this.vizList.map(v => ({ label: v.label, type: v.type, icon: v.icon, color: v.color, unit: v.unit }))
        : undefined,
      pipeline: pipeline.map(s => ({
        type: s.type,
        label: s.label,
        params: this.extractParams(s),
      })),
    };
    Object.keys(raw).forEach(k => raw[k] === undefined && delete raw[k]);
    return mode === 'yaml' ? yaml.dump(raw, { lineWidth: -1 }) : JSON.stringify(raw, null, 2);
  }

  applyImport(): void {
    this.importError = null;
    try {
      const { pipeline, meta } = parseIndicatorImport(this.importText, this.importMode, this.platonSchema);
      this.pipeline = pipeline;
      this.applyImportedMeta(meta);
      this.showImport = false;
      this.messageSvc.success('Indicateur importé');
      this.cdr.detectChanges();
    } catch (e: any) {
      this.importError = toImportErrorDisplay(e);
    }
  }

  /** Applique les champs (hors pipeline) d'un import à `def`/`vizList` - un champ absent de
   *  l'import (donc non présent dans `meta`) laisse la valeur déjà saisie dans le formulaire
   *  inchangée, seul `name` est toujours écrasé puisqu'il est obligatoire dans l'import. */
  private applyImportedMeta(meta: ImportedIndicatorMeta): void {
    this.def.name = meta.name;
    if (meta.description !== undefined) this.def.description = meta.description;
    if (meta.interpretationHint !== undefined) this.def.interpretationHint = meta.interpretationHint;
    if (meta.requiredEvents !== undefined) {
      this.def.requiredEvents = meta.requiredEvents;
      this.def.useTriggerEvents = meta.requiredEvents.length > 0;
    }
    if (meta.contextType !== undefined) this.def.contextType = meta.contextType;
    if (meta.thresholds !== undefined) {
      this.def.thresholds = meta.thresholds
        ? { good: meta.thresholds.good ?? null, warning: meta.thresholds.warning ?? null, critical: meta.thresholds.critical ?? null }
        : null;
    }
    if (meta.visualizations !== undefined && meta.visualizations.length > 0) {
      this.vizList = meta.visualizations.map(v => ({
        id:    crypto.randomUUID(),
        label: v.label ?? 'Vue',
        type:  (v.type as ViewVisualizationType) ?? 'card',
        icon:  v.icon ?? 'analytics',
        color: v.color ?? '#722ed1',
        unit:  v.unit ?? '',
      }));
    }
  }

  applySuggestion(suggestion: string): void {
    const wrong = this.importError?.wrongValue;
    if (!wrong) return;
    this.importText = replaceValueInText(this.importText, wrong, suggestion);
    // Revalide sans fermer le panneau ni appliquer le pipeline
    try {
      parseIndicatorImport(this.importText, this.importMode, this.platonSchema);
      this.importError = null;
    } catch (e: any) {
      this.importError = toImportErrorDisplay(e);
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
    if (this.def.useTriggerEvents && this.def.requiredEvents.length === 0) {
      this.messageSvc.error('Sélectionnez au moins un événement, ou désactivez "Activer des événements déclencheurs".');
      return;
    }
    // Le pipeline peut rester vide ou partiel (brouillon) - seules les étapes déjà ajoutées
    // doivent être complètes, pour ne pas enregistrer un step à moitié rempli en silence.
    for (let i = 0; i < this.pipeline.length; i++) {
      const err = validatePipelineStepComplete(this.pipeline[i], i);
      if (err) { this.messageSvc.error(err); return; }
    }
    // Ordre attendu par indicator-card.component.ts#statusColor : val<=good -> vert,
    // val<=warning -> orange, sinon rouge.
    const { good, warning, critical } = this.def.thresholds ?? {};
    if (good != null && warning != null && good > warning) {
      this.messageSvc.error('Le seuil "Bon" doit être inférieur ou égal au seuil "Attention".');
      return;
    }
    if (warning != null && critical != null && warning > critical) {
      this.messageSvc.error('Le seuil "Attention" doit être inférieur ou égal au seuil "Critique".');
      return;
    }
    if (good != null && critical != null && warning == null && good > critical) {
      this.messageSvc.error('Le seuil "Bon" doit être inférieur ou égal au seuil "Critique".');
      return;
    }

    // Complet uniquement si enregistré via le bouton final (étape 2) et les champs requis présents
    const isComplete = this.step === 2
      && !!this.def.contextType
      && this.vizList.length > 0
      && this.pipeline.length > 0;

    this.saving = true;

    const payload = {
      name: this.def.name.trim(),
      description: this.def.description.trim(),
      interpretationHint: this.def.interpretationHint.trim() || null,
      contextType: this.def.contextType,
      requiredEvents: this.def.requiredEvents,
      // En édition normale (hors wizard famille), on conserve le familyName existant de l'indicateur
      // pour ne pas l'effacer accidentellement à chaque sauvegarde.
      familyName: this.modalData?.familyPreset?.familyName
        ?? this.modalData?.indicator?.familyName
        ?? null,
      formula: this.buildFormula(),
      thresholds: this.def.thresholds?.good != null || this.def.thresholds?.warning != null || this.def.thresholds?.critical != null
        ? {
            good: this.def.thresholds?.good ?? undefined,
            warning: this.def.thresholds?.warning ?? undefined,
            critical: this.def.thresholds?.critical ?? undefined,
          }
        : null,
      visibilityRoles: this.def.visibilityRoles && this.def.visibilityRoles.length > 0
        ? this.def.visibilityRoles
        : null,
      baseIndicatorId: this.def.baseIndicatorId ?? null,
      visualizations: this.vizList.map(v => ({
        id: v.id,
        label: v.label,
        type: v.type,
        // Icône toujours dérivée du contexte à l'enregistrement - jamais un choix manuel
        // (voir contextIcon()) ; ignore toute valeur importée/héritée dans v.icon.
        icon: this.contextIcon(this.def.contextType),
        color: v.color,
        unit: v.unit,
      })),
      isActive: false,
      isComplete,
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

  /** Pré-remplit le formulaire à partir des données partagées d'une famille en cours de création. */
  private applyFamilyPreset(preset: IndicatorFamilyPreset): void {
    this.def.name             = preset.name;
    this.def.description      = preset.description;
    this.def.requiredEvents   = [...preset.requiredEvents];
    this.def.useTriggerEvents = this.def.requiredEvents.length > 0;
    this.def.contextType      = preset.contextType;
  }

  private hydrate(ind: IndicatorDefinition): void {
    this.def.name               = ind.name;
    this.def.description        = ind.description || '';
    this.def.interpretationHint = ind.interpretationHint || '';
    this.def.requiredEvents     = ind.requiredEvents || [];
    this.def.useTriggerEvents   = this.def.requiredEvents.length > 0;
    this.def.contextType        = ind.contextType ?? 'learner';
    this.def.visibilityRoles    = ind.visibilityRoles || null;
    this.def.baseIndicatorId    = ind.baseIndicatorId || null;

    this.def.thresholds = ind.thresholds
      ? { good: ind.thresholds.good ?? null, warning: ind.thresholds.warning ?? null, critical: ind.thresholds.critical ?? null }
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

    this.pipeline = (ind.formula?.pipeline ?? []).map((s: any) => dehydrateStep(s));
  }
}
