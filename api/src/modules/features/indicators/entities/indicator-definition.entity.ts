// src/indicators/entities/indicator-definition.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type ContextType = 'learner' | 'teacher' | 'admin' | 'course' | 'activity' | 'group';

export type VizType = 'card' | 'gauge' | 'line-chart' | 'bar-chart' | 'histogram';

export interface FormulaDefinition {
  version: '1.0';
  pipeline: { id: string; type: string; label?: string; params: Record<string, any> }[];
}

/** Une visualisation au sein d'un indicateur (1 indicateur peut en avoir plusieurs). */
export interface IndicatorVisualization {
  id: string;
  label: string;
  type: VizType;
  icon?: string;
  color?: string;
  /** Métadonnées d’affichage propres à cette visualisation (unité + seuils de performance). */
  unit?: string;
  thresholds?: { good: number; warning: number; danger: number };
  /** Formule propre à cette vue. Si absente, utilise indicator.formula. */
  formula?: FormulaDefinition | null;
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

  /** Contexte unique pour cet indicateur (Option B : 1 indicateur = 1 contexte). */
  @Column({ type: 'varchar', nullable: true })
  contextType: ContextType;

  /** Regroupement nominal de plusieurs indicateurs créés ensemble (ex: "Tentatives avant réussite"). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  familyName: string | null;

  @Column({ type: 'jsonb' })
  requiredEvents: string[];

  /** Tableau de visualisations (min. 1). Chacune peut avoir sa propre formule. */
  @Column({ type: 'jsonb', nullable: true })
  visualizations: IndicatorVisualization[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  usageCount: number;

  /** Formule partagée utilisée par les visualisations sans formule propre. */
  @Column({ type: 'jsonb', nullable: true })
  formula: FormulaDefinition | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
