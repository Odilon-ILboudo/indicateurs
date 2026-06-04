// src/indicators/entities/indicator-definition.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type ContextType = 'global' | 'course' | 'activity' | 'learner' | 'teacher' | 'group';

export interface ViewVisualization {
  type: 'card' | 'gauge' | 'line-chart' | 'bar-chart' | 'histogram';
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
  contextType: ContextType;
  views: ViewConfig[];
}

@Entity('indicator_definitions')
@Index(['isActive'])
export class IndicatorDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'jsonb', default: [] })
  supportedContexts: ContextType[];

  @Column({ type: 'jsonb' })
  requiredEvents: string[];

  // Visualisation par défaut (peut être surchargée par l'utilisateur)
  @Column({ type: 'jsonb', nullable: true })
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
  };

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  usageCount: number;

  // Formule DSL legacy (rétro-compatibilité - utiliser contextConfigs à la place)
  @Column({ type: 'jsonb', nullable: true })
  formula: {
    version: '1.0';
    dataSource?: 'platon.sessions' | 'platon.activities';
    pipeline: {
      id: string;
      type: string;
      label?: string;
      params: Record<string, any>;
    }[];
  } | null;

  // Nouveau modèle multi-contexte/multi-vue - remplace formula + visualization
  @Column({ type: 'jsonb', nullable: true })
  contextConfigs: ContextConfig[] | null;

  // Configuration du template (paramètres modifiables par l'utilisateur)
  @Column({ type: 'jsonb', nullable: true })
  templateConfig: {
    // Seuils paramétrables
    thresholds: {
      good: {
        label: string;
        defaultValue: number;
        min: number;
        max: number;
      };
      warning: {
        label: string;
        defaultValue: number;
        min: number;
        max: number;
      };
      danger: {
        label: string;
        defaultValue: number;
        min: number;
        max: number;
      };
    };
    // Affichage paramétrable
    display: {
      unit: {
        label: string;
        defaultValue: string;
        options?: string[];
      };
      icon: {
        label: string;
        defaultValue: string;
        options?: string[];
      };
      color: {
        label: string;
        defaultValue: string;
        options?: string[];
      };
    };
    // Descriptions paramétrables
    description: {
      dataSource: {
        label: string;
        defaultValue: string;
      };
      calculationRule: {
        label: string;
        defaultValue: string;
      };
      usageExample: {
        label: string;
        defaultValue: string;
      };
    };
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}