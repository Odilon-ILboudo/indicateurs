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
import { SchemaExplorerModalComponent } from './schema-explorer-modal.component';
import { buildImportDocsText } from './pipeline-import-docs.util';
import { stepDetails as stepDetailsFor, eventRuleHint as computeEventRuleHint } from './pipeline-step-display.util';
import {
  StepType, PipelineStep, PlatonTableSchema,
  PipelineError, ImportedIndicatorMeta, ImportErrorDisplay, toImportErrorDisplay,
  dehydrateStep, parseIndicatorImport, replaceValueInText, validatePipelineStepComplete, looksLikeJson,
} from './pipeline-import.util';
import { getCurrentUserId } from '../../core/auth/current-user';

//  Types DSL

interface FlatViz {
  id: string;
  label: string;
  type: ViewVisualizationType;
  icon: string;
  color: string;
  unit: string;
}

// Données partagées par les membres d'une famille, transmis de builder en builder.
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

//  Catalogues 

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
 que pour les pipelines prédéfinis (FORMULA_RECIPES) ; `usedBy` n'existe que pour les
 pipelines dérivés d'indicateurs déjà créés (voir loadExistingPipelines()).
*/
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

//  Composant

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
  templateUrl: './indicator-builder.component.html',
  styleUrls: ['./indicator-builder.component.scss'],
})
export class IndicatorBuilderComponent implements OnInit, AfterViewInit {
  private readonly modalRef     = inject(NzModalRef);
  private readonly modalSvc     = inject(NzModalService);
  @ViewChild('recipesModalTpl')   private recipesModalTplRef!: TemplateRef<any>;
  private readonly hostEl = inject(ElementRef);
  private readonly modalData    = inject(NZ_MODAL_DATA, { optional: true }) as {
    indicator?: IndicatorDefinition;
    familyPreset?: IndicatorFamilyPreset;
    familyQueue?: IndicatorScope[];
    /** Réutilisation choisie dans la modale de démarrage (blanc/réutiliser/import), avant
     l'ouverture de ce wizard - alternative à `familyPreset` pour une création standard.
    */
    reuseSeed?: { source: IndicatorDefinition; override: ReuseIndicatorResult };
    /** Import YAML/JSON choisi et déjà validé dans la modale de démarrage (voir
     NewIndicatorChoiceModalComponent.chooseImport()) - appliqué tel quel dès l'ouverture du
     wizard, aucune re-validation nécessaire.
    */
    importSeed?: { pipeline: PipelineStep[]; meta: ImportedIndicatorMeta };
  } | null;
  private readonly indicatorSvc = inject(IndicatorService);
  private readonly messageSvc   = inject(NzMessageService);
  private readonly cdr          = inject(ChangeDetectorRef);

  get isEditMode(): boolean { return !!this.modalData?.indicator; }

  // Texte de progression affiché dans le header quand ce builder fait partie d'une famille.
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

  //  Détection de doublons 
  private readonly nameSearch$ = new Subject<string>();
  similarIndicators: IndicatorDefinition[] = [];
  similarSearching = false;

  //  Recherche serveur du cours (panneau "Tester cette formule") ─
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
    return buildImportDocsText(this.importMode);
  }
  previewCtx = {
    userId:     getCurrentUserId() || '',
    groupId:    '',
    activityId: '',
  };

  availableEventTypes: { name: string; label: string }[] = [];
  readonly OTHER_EVENT_OPTION = '__create_new__';

  /** L'option "Autres" du sélecteur d'événements n'est pas un vrai événement - elle ouvre le
   gestionnaire d'événements & règles directement depuis le wizard, puis se retire elle-même
   de la sélection (elle ne doit jamais être envoyée au backend comme requiredEvents).
  */
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

  //  Aide dynamique "comment configurer l'événement pour ce pipeline"
  showEventHint = false;

  eventRuleHint(): {
    tables: string[];
    columns: string[];
    contextMapping: { label: string; column: string | null }[];
  } | null {
    return computeEventRuleHint(this.pipeline);
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

  //  Explorateur de schéma PLaTon (SchemaExplorerModalComponent, modale autonome)

  openSchemaExplorer(): void {
    this.modalSvc.create({
      nzTitle: 'Schéma PLaTon - Tables et relations',
      nzContent: SchemaExplorerModalComponent,
      nzWidth: '95vw',
      nzFooter: null,
      nzCentered: true,
      nzStyle: { 'max-height': '95vh', 'overflow': 'hidden' },
      nzBodyStyle: { padding: '0', overflow: 'hidden' },
    });
  }

  readonly stepCatalog = STEP_CATALOG;
  readonly recipes     = FORMULA_RECIPES;
  readonly CONTEXT_LABELS = CONTEXT_LABELS;
  readonly contextIcon = contextIcon;
  selectedRecipe: PipelineCatalogItem | null = null;
  /*
  Onglet "Depuis les indicateurs existants" de la modale Pipelines - chargé une seule fois à
  la première ouverture (indicateurs ACTIFS uniquement, un brouillon peut être incomplet),
  dédupliqué par contenu réel du pipeline (type+params, l'id et le label sont ignorés).
  */
  existingPipelines: PipelineCatalogItem[] = [];
  private existingPipelinesLoaded = false;
  recipesActiveTab = 0;
  readonly contextFilterCols = [
    { value: 'user_id',     label: 'user_id - apprenant courant' },
    { value: 'activity_id', label: 'activity_id - activité sélectionnée' },
    { value: 'course_id',   label: 'course_id - cours sélectionné' },
  ];

  /*
   Réutiliser un indicateur existant (capitalisation) - choix fait en amont dans la modale
  de démarrage (NewIndicatorChoiceModalComponent) ; ce composant ne fait plus qu'appliquer
  le résultat (`modalData.reuseSeed`) via composeFromReuseSource(), voir ngOnInit. ─
  */
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

  //  Modèle du formulaire 

  def: {
    name: string;
    description: string;
    interpretationHint: string;
    requiredEvents: string[];
    /* Flag UI-only (jamais envoyé au backend) : pilote l'affichage du bloc "Événements" à
     l'étape Formules. Décoché → requiredEvents vide, l'indicateur est recalculé par le
     cron minute côté serveur plutôt que par un événement précis.
    */
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

  //  Lifecycle

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
        /*
        Déjà validé (y compris colonnes/tables) dans la modale de choix initial - simple
        application, aucune re-validation ni fallback d'erreur nécessaire ici.
        */
        this.pipeline = this.modalData.importSeed.pipeline;
        this.applyImportedMeta(this.modalData.importSeed.meta);
        if (this.modalData?.familyPreset) this.def.contextType = this.modalData.familyPreset.contextType;
      }
    }

    /*
    Chargement initial : les 10 premiers cours (toutes ressources PLaTon, pas seulement
    celles de l'utilisateur courant - voir courseSearch$ ci-dessous pour la recherche, et
    loadMoreCourses() pour charger la suite, 10 par 10).
    */
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

    /*
    Recherche serveur sur le sélecteur de cours (nzServerSearch) - debounce pour ne pas
    spammer le backend à chaque frappe, 10 résultats par page côté serveur (voir
    loadMoreCourses() pour la suite).
    */
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

  /* Ajoute (n'écrase pas) la page suivante de cours - déclenché en scrollant jusqu'en bas du
   menu déroulant (nzScrollToBottom), même recherche que celle actuellement tapée.
  */
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

  //  Création d'un nouveau type d'événement ("Autres…" dans le sélecteur) 

  openPreview(ind: IndicatorDefinition): void {
    this.previewIndicator = ind;
    this.previewModalVisible = true;
  }

  //  Label-picker du panneau de test 

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

    /*
    Chargement dédié plutôt que dérivé du cache de recherche de cours (previewCourses) : ce
    cache est remplacé à chaque nouvelle recherche ou page suivante, et peut ne plus contenir
    le cours sélectionné - les groupes semblaient alors "ne jamais charger".
    */
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

  //  Navigation 

  canProceed(): boolean {
    if (this.step === 0) return !!this.def.name.trim();
    if (this.step === 1) return !!this.def.contextType && this.vizList.length > 0;
    return true;
  }

  /* Décoché → on vide la sélection pour ne jamais soumettre un requiredEvents "fantôme", et on
   referme l'aide (plus pertinente sans événements activés).
  */
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

  //  Gestion des visualisations

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

  //  Pipeline 

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

  /* Les recettes s'ouvrent dans une modale dédiée. Le détail d'un pipeline (bouton œil) est
   une vue interne de cette même modale, jamais une seconde modale par-dessus.
  */
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
      /*
      Le X sert de "retour" tant qu'on est sur la vue détail (pas de bouton dédié) - ne
      referme réellement la modale que depuis la vue grille.
      */
      nzOnCancel: () => {
        if (this.selectedRecipe) { this.backToRecipesGrid(); return false; }
        return true;
      },
    });
  }

  /* Construit l'onglet "Depuis les indicateurs existants" : un pipeline par groupe
   d'indicateurs (actifs uniquement) partageant EXACTEMENT le même contenu de pipeline
   (type+params de chaque étape - l'id et le label affiché n'entrent pas dans la comparaison).
  */
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

  protected stepDetails(s: PipelineStep): { label: string; value: string }[] {
    return stepDetailsFor(s);
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

  //  Preview

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

  //  Import YAML/JSON 

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
   à l'autre. N'écrase le texte que si le parsing réussit.
  */
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

  /* Sérialise l'indicateur courant (nom, description, événements, seuils, visualisations et
   pipeline) en YAML/JSON pour ré-édition - un export produit ici doit pouvoir être
   ré-importé à l'identique par parseStep3Text().
  */
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

  /* Applique les champs (hors pipeline) d'un import à `def`/`vizList` - un champ absent de
   l'import (donc non présent dans `meta`) laisse la valeur déjà saisie dans le formulaire
   inchangée, seul `name` est toujours écrasé puisqu'il est obligatoire dans l'import.
  */
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

  //  Soumission 

  submit(): void {
    if (!this.def.name.trim()) { this.messageSvc.error('Le nom est requis'); return; }
    if (this.def.useTriggerEvents && this.def.requiredEvents.length === 0) {
      this.messageSvc.error('Sélectionnez au moins un événement, ou désactivez "Activer des événements déclencheurs".');
      return;
    }
    /*
    Le pipeline peut rester vide ou partiel (brouillon) - seules les étapes déjà ajoutées
    doivent être complètes, pour ne pas enregistrer un step à moitié rempli en silence.
    */
    for (let i = 0; i < this.pipeline.length; i++) {
      const err = validatePipelineStepComplete(this.pipeline[i], i);
      if (err) { this.messageSvc.error(err); return; }
    }
    /*
    Ordre attendu par indicator-card.component.ts#statusColor : val<=good -> vert,
    val<=warning -> orange, sinon rouge.
    */
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
      /*
      En édition normale (hors wizard famille), on conserve le familyName existant de l'indicateur
      pour ne pas l'effacer accidentellement à chaque sauvegarde.
      */
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
        /*
        Icône toujours dérivée du contexte à l'enregistrement - jamais un choix manuel
        (voir contextIcon()) ; ignore toute valeur importée/héritée dans v.icon.
        */
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

  //  Helpers

  private buildFormula() {
    return {
      version: '1.0',
      pipeline: this.pipeline.map(s => ({ id: s.id, type: s.type, label: s.label, params: this.extractParams(s) })),
    };
  }

  private extractParams(s: PipelineStep): Record<string, any> {
    switch (s.type) {
      case 'fetch': {
        /*
        On retire 'group_id' de la sélection brute puis on le réinjecte uniquement si le switch est actif,
        sinon désactiver le switch après l'avoir activé une fois ne le retirait jamais de contextFields.
        */
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

  // Pré-remplit le formulaire à partir des données partagées d'une famille en cours de création.
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
