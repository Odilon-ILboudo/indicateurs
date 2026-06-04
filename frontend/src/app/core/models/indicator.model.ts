export type IndicatorScope = 'global' | 'course' | 'activity' | 'learner' | 'teacher' | 'group';
export type IndicatorCategory = 'performance' | 'progress';

export type ViewVisualizationType = 'card' | 'gauge' | 'line-chart' | 'bar-chart' | 'histogram';

export interface ViewVisualization {
  type: ViewVisualizationType;
  icon?: string;
  color?: string;
  unit?: string;
  thresholds?: { good: number; warning: number; danger: number };
}

export interface ViewConfig {
  id: string;
  label: string;
  formula: {
    version: '1.0';
    pipeline: {
      id: string;
      type: string;
      label?: string;
      params: Record<string, any>;
    }[];
  };
  visualization: ViewVisualization;
}

export interface ContextConfig {
  contextType: IndicatorScope;
  views: ViewConfig[];
}

export interface ViewResult {
  value: number;
  structuredValue?: any;
  metadata: Record<string, any>;
}


export interface IndicatorDefinition {
  id: string;  // ← AJOUTER cette propriété (UUID)
  name: string;
  description: string;
  scope?: IndicatorScope;  // optionnel
  category?: IndicatorCategory;
  supportedContexts?: IndicatorScope[];  // ← AJOUTER
  formula?: {
    version: '1.0';
    dataSource: 'platon.sessions' | 'platon.activities';
    pipeline: {
      id: string;
      type: string;
      label?: string;
      params: Record<string, any>;
    }[];
  } | null;
  requiredEvents: string[];
  dataSource?: string;
  calculationRule?: string;
  usageExample?: string;
  visualization: {
    defaultType: 'card' | 'chart' | 'gauge' | 'table';
    icon?: string;
    color?: string;
    unit?: string;
    thresholds?: {
      good: number;
      warning: number;
      danger: number;
    };
    availableVisualizations?: ('card' | 'chart' | 'gauge' | 'table')[];
  };
  templateConfig?: {  // ← AJOUTER pour admin
    thresholds?: {
      good?: { label: string; defaultValue: number; min: number; max: number };
      warning?: { label: string; defaultValue: number; min: number; max: number };
      danger?: { label: string; defaultValue: number; min: number; max: number };
    };
    display?: {
      unit?: { label: string; defaultValue: string; options?: string[] };
      icon?: { label: string; defaultValue: string; options?: string[] };
      color?: { label: string; defaultValue: string; options?: string[] };
    };
    description?: {
      dataSource?: { label: string; defaultValue: string };
      calculationRule?: { label: string; defaultValue: string };
      usageExample?: { label: string; defaultValue: string };
    };
  };
  usageCount?: number;
  isActive: boolean;
  metadata: Record<string, any>;
  // Nouveau modèle multi-contexte/multi-vue
  contextConfigs?: ContextConfig[];
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
  activityId?: string; // Pour les contextes course/group : activité sélectionnée par l'enseignant
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

export interface UserDashboardSettings {
  dismissedToast: boolean; // Toast persistant supprimé
  activeIndicators: string[]; // IDs des indicateurs actifs
  favoriteIndicators: string[];
  layout: {
    columns: number; // Nombre de colonnes pour la grille d'indicateurs
  };
}