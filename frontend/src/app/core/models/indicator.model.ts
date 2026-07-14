export type IndicatorScope = 'learner' | 'teacher' | 'admin' | 'course' | 'activity' | 'group';

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
  thresholds?: { good?: number; warning?: number } | null;
  /** Aide à l'analyse : texte libre expliquant comment interpréter les résultats (optionnel). */
  interpretationHint?: string | null;
  usageCount?: number;
  isActive: boolean;
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
  groups: { id: string; name: string }[];
}

export interface IndicatorSnapshot {
  id: string;
  indicatorId: string;
  contextType: string;
  contextId: string;
  activityId: string;
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

