import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type ContextType = 'learner' | 'teacher' | 'admin' | 'course' | 'activity' | 'group';

export type VizType = 'card' | 'gauge' | 'line-chart' | 'bar-chart' | 'histogram';

export interface FormulaDefinition {
  version: '1.0';
  pipeline: { id: string; type: string; label?: string; params: Record<string, any> }[];
}

// Une visualisation au sein d’un indicateur (1 indicateur peut en avoir plusieurs).
export interface IndicatorVisualization {
  id: string;
  label: string;
  type: VizType;
  icon?: string;
  color?: string;
  unit?: string;
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

  // Contexte unique pour cet indicateur (Option B : 1 indicateur = 1 contexte)
  @Column({ type: 'varchar', nullable: true })
  contextType: ContextType;

  // Regroupement nominal de plusieurs indicateurs créés ensemble sous une même famille.
  @Column({ type: 'varchar', length: 255, nullable: true })
  familyName: string | null;

  // Indicateur source d'une réutilisation - traçabilité seulement, aucun lien vivant
  @Column({ type: 'varchar', nullable: true })
  baseIndicatorId: string | null;

  @Column({ type: 'jsonb' })
  requiredEvents: string[];

  // Tableau de visualisations (min. 1). Chacune peut avoir sa propre formule
  @Column({ type: 'jsonb', nullable: true })
  visualizations: IndicatorVisualization[];

  @Column({ default: true })
  isActive: boolean;

  /* Complétude réelle du formulaire, indépendante de `isActive` - reflète le bouton final du wizard, pas "Sauvegarder le brouillon". */
  @Column({ default: false })
  isComplete: boolean;

  /* Ligne technique pour faire exister une famille vide - isActive=false, jamais affichée, supprimée au premier vrai membre. */
  @Column({ default: false })
  isFamilyPlaceholder: boolean;

  @Column({ default: 0 })
  usageCount: number;

  // Formule partagée utilisée par les visualisations sans formule propre
  @Column({ type: 'jsonb', nullable: true })
  formula: FormulaDefinition | null;

  /* Seuils de performance partagés par toutes les visualisations - `critical` est une borne purement documentaire. */
  @Column({ type: 'jsonb', nullable: true })
  thresholds: { good?: number; warning?: number; critical?: number } | null;

  // Aide à l'analyse : texte libre expliquant comment interpréter les résultats (optionnel). */
  @Column({ type: 'text', nullable: true })
  interpretationHint: string | null;

  /* Restreint la visibilité à des rôles précis, en override de la règle par défaut du contextType. */
  @Column({ type: 'jsonb', nullable: true })
  visibilityRoles: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
