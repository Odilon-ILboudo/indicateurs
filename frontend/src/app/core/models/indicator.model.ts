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

/** Une visualisation au sein d'un indicateur. */
export interface IndicatorVisualization {
  id: string;
  label: string;
  type: ViewVisualizationType;
  icon?: string;
  color?: string;
  unit?: string;
  thresholds?: { good: number; warning: number; danger: number };
  /** Formule propre à cette vue. Si absente, utilise indicator.formula. */
  formula?: IndicatorFormula | null;
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
  /** Regroupement nominal de plusieurs indicateurs créés ensemble (ex: "Tentatives avant réussite"). */
  familyName?: string | null;
  formula?: IndicatorFormula | null;
  requiredEvents: string[];
  /** Tableau de visualisations (min. 1). La première est la vue "carte" par défaut. */
  visualizations: IndicatorVisualization[];
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

export interface UserDashboardSettings {
  dismissedToast: boolean;
  activeIndicators: string[];
  favoriteIndicators: string[];
  layout: {
    columns: number;
  };
}
