export type IndicatorScope = 'learner' | 'teacher' | 'admin' | 'course' | 'activity' | 'group';

/* Icône Material fixe par contexte, pas de choix libre - identifie à qui s'adresse l'indicateur. */
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

// Une visualisation au sein d’un indicateur.
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

/* `critical` est une borne purement documentaire : au-delà de `warning`, la carte est rouge de toute façon. */
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
  // Regroupement nominal de plusieurs indicateurs créés ensemble sous une même famille.
  familyName?: string | null;
  formula?: IndicatorFormula | null;
  requiredEvents: string[];
  // Tableau de visualisations (min. 1). La première est la vue "carte" par défaut.
  visualizations: IndicatorVisualization[];
  // Seuils de performance partagés par toutes les visualisations (optionnel)
  thresholds?: IndicatorThresholds | null;
  // Aide à l'analyse : texte libre expliquant comment interpréter les résultats (optionnel)
  interpretationHint?: string | null;
  /* Restreint la visibilité à des rôles précis, en override de la règle par défaut du contextType (optionnel). */
  visibilityRoles?: string[] | null;
  /* Indicateur à partir duquel celui-ci a été créé - traçabilité uniquement, aucun lien vivant après coup. */
  baseIndicatorId?: string | null;
  /* Ligne technique pour une famille vide (pas d'indicateur réel), jamais visible des utilisateurs finaux. */
  isFamilyPlaceholder?: boolean;
  usageCount?: number;
  isActive: boolean;
  /* Complétude réelle du formulaire, indépendante de `isActive` (interrupteur manuel de publication). */
  isComplete: boolean;
  metadata?: Record<string, any>;
}

export interface IndicatorValue {
  value: number;
  timestamp: Date;
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
  /* Pour scope='group' course-aware uniquement : agrège tout le cours plutôt qu'une activité, mutuellement exclusif avec activityId. */
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

// Événements & déclencheurs dynamiques
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

// Figer un indicateur sur un cours/activité (pins enseignant)
export type IndicatorPinContextType = 'course' | 'activity';

/* Pin : un enseignant fige un indicateur sur un cours/activité (actif pour tous, seuils propres), sans écriture croisée avec les préférences perso. */
export interface IndicatorPin {
  id: string;
  indicatorId: string;
  contextType: IndicatorPinContextType;
  contextId: string;
  thresholdsOverride: IndicatorThresholds | null;
  pinnedByUserId: string;
  createdAt?: string;
}

