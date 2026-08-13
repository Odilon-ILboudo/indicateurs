export type IndicatorScope = 'learner' | 'teacher' | 'admin' | 'course' | 'activity' | 'group';

/** Icône Material fixe par contexte - pour qu'un coup d'œil suffise à identifier à qui
 *  s'adresse un indicateur (apprenant/enseignant/cours/activité/...), au lieu d'un choix libre
 *  par visualisation. Volontairement pas de couleur ici : la couleur reste personnalisable
 *  (préférence utilisateur + choix admin par visualisation), seule l'icône est automatique. */
export const CONTEXT_ICONS: Record<IndicatorScope, string> = {
  learner:  'person',
  teacher:  'co_present',
  admin:    'admin_panel_settings',
  course:   'school',
  activity: 'assignment',
  group:    'group',
};

export function contextIcon(contextType: IndicatorScope | null | undefined): string {
  return (contextType && CONTEXT_ICONS[contextType]) || 'analytics';
}

export type ViewVisualizationType = 'card' | 'gauge' | 'line-chart' | 'bar-chart' | 'histogram';

export interface IndicatorFormula {
  version: '1.0';
  pipeline: {
    id: string;
    type: string;
    label?: string;
    params: Record<string, any>;
  }[];
}

/** Une visualisation au sein d’un indicateur. */
export interface IndicatorVisualization {
  id: string;
  label: string;
  type: ViewVisualizationType;
  icon?: string;
  color?: string;
  unit?: string;
}

export interface ViewResult {
  value: number;
  structuredValue?: any;
  metadata: Record<string, any>;
}

/** `critical` est une borne purement documentaire (légende) : au-delà de
 *  `warning`, la carte est de toute façon rouge, avec ou sans `critical`. */
export interface IndicatorThresholds {
  good?: number;
  warning?: number;
  critical?: number;
}

export interface IndicatorDefinition {
  id: string;
  name: string;
  description: string;
  contextType: IndicatorScope;
  /** Regroupement nominal de plusieurs indicateurs créés ensemble sous une même famille. */
  familyName?: string | null;
  formula?: IndicatorFormula | null;
  requiredEvents: string[];
  /** Tableau de visualisations (min. 1). La première est la vue "carte" par défaut. */
  visualizations: IndicatorVisualization[];
  /** Seuils de performance partagés par toutes les visualisations (optionnel). */
  thresholds?: IndicatorThresholds | null;
  /** Aide à l'analyse : texte libre expliquant comment interpréter les résultats (optionnel). */
  interpretationHint?: string | null;
  /** Restreint la visibilité de cet indicateur à des rôles précis, en override de la règle
   *  par défaut du contextType (optionnel). */
  visibilityRoles?: string[] | null;
  /** Indicateur à partir duquel celui-ci a été créé (traçabilité uniquement, aucun lien
   *  vivant après la création). */
  baseIndicatorId?: string | null;
  /** Ligne technique représentant une famille vide (pas d'indicateur réel pour l'instant) -
   *  jamais visible des utilisateurs finaux, uniquement dans la gestion admin. */
  isFamilyPlaceholder?: boolean;
  usageCount?: number;
  isActive: boolean;
  /** Complétude réelle du formulaire (nom, contexte, ≥1 visualisation, pipeline valide),
   *  indépendante de `isActive` qui reste un interrupteur manuel de publication. Fixée à la
   *  sauvegarde par indicator-builder.component.ts#submit() selon le bouton utilisé. */
  isComplete: boolean;
  metadata?: Record<string, any>;
}

export interface IndicatorValue {
  value: number;
  timestamp: Date;
  trend?: 'up' | 'down' | 'stable';
  metadata?: {
    lastUpdate?: Date;
    unit?: string;
    thresholds?: any;
  };
}

export interface DashboardContext {
  scope: IndicatorScope;
  scopeId: string;
  userId: string;
  activityId?: string;
  // Pour scope='group' course-aware uniquement (voir isCourseAware côté backend) :
  // agrège toutes les activités du cours plutôt qu'une seule. Mutuellement exclusif
  // avec activityId pour ce scope.
  courseId?: string;
  groupId?: string;
  academicYear?: string;
  semester?: string;
}

export interface CourseActivity {
  id: string;
  name: string;
}

export interface TeacherCourse {
  id: string;
  name: string;
}

export interface IndicatorSnapshot {
  id: string;
  indicatorId: string;
  contextType: string;
  contextId: string;
  // Exactement l'un des deux, jamais les deux (voir isCourseAware côté backend).
  activityId: string | null;
  courseId: string | null;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StepDebugResult {
  index: number;
  type: string;
  durationMs: number;
  output: any;
  error?: string;
}

export interface UserDashboardSettings {
  dismissedToast: boolean;
  activeIndicators: string[];
  favoriteIndicators: string[];
  layout: {
    columns: number;
  };
}

export interface IndicatorFeedback {
  id: string;
  indicatorId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface IndicatorNotification {
  id: string;
  indicatorId: string;
  title: string;
  message: string;
  createdAt: string;
}

export interface IndicatorFeedbacksResult {
  feedbacks: IndicatorFeedback[];
  count: number;
  averageRating: number;
}

// ── Événements & déclencheurs dynamiques ────────────────────────────────────

export interface EventTypeOption {
  id: string;
  name: string;
  label: string;
  description: string | null;
  isActive: boolean;
}

export type EventRuleOperation = 'INSERT' | 'UPDATE' | 'INSERT_OR_UPDATE';
export type EventRuleConditionKind = 'always' | 'changed' | 'equals' | 'not_equals' | 'threshold_crossed';

export interface EventRuleCondition {
  kind: EventRuleConditionKind;
  value?: string | number | boolean | null;
  operator?: '>' | '>=' | '<' | '<=';
  threshold?: number;
}

export interface EventRuleContextMapping {
  userId: string;
  courseId?: string;
  activityId?: string;
  sessionId?: string;
}

export interface EventRule {
  id: string;
  eventTypeId: string;
  eventType: EventTypeOption;
  sourceTable: string;
  watchedColumn: string | null;
  operation: EventRuleOperation;
  condition: EventRuleCondition;
  contextMapping: EventRuleContextMapping;
  isActive: boolean;
  triggerInstalled: boolean;
  installedAt: string | null;
  lastAppliedSql: string | null;
  lastInstallError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventRuleBody {
  eventTypeId?: string;
  newEventType?: { name: string; label: string; description?: string };
  sourceTable: string;
  watchedColumn?: string | null;
  operation: EventRuleOperation;
  condition: EventRuleCondition;
  contextMapping: EventRuleContextMapping;
}

export interface InstallTriggerResult {
  success: boolean;
  message?: string;
  sql: string;
}

// ── Figer un indicateur sur un cours/activité (pins enseignant) ─────────────

export type IndicatorPinContextType = 'course' | 'activity';

/** Un enseignant fige un indicateur existant sur un cours/une activité précis :
 *  tous les membres l'ont alors actif et non désactivable, avec des seuils
 *  propres à ce contexte. Totalement indépendant des préférences perso
 *  (`user_indicator_preferences`) : aucune écriture croisée entre les deux. */
export interface IndicatorPin {
  id: string;
  indicatorId: string;
  contextType: IndicatorPinContextType;
  contextId: string;
  thresholdsOverride: IndicatorThresholds | null;
  pinnedByUserId: string;
  createdAt?: string;
}

