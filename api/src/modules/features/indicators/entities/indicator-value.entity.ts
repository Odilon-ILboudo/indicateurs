import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { IndicatorDefinition } from './indicator-definition.entity';

@Entity('indicator_values')
@Index(['indicatorId', 'contextId'])
@Index(['contextType', 'contextId'])
@Index(['indicatorId', 'contextType', 'contextId'], { unique: true })
@Index('idx_indicator_value_metadata', { synchronize: false })
export class IndicatorValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  indicatorId: string;

  @ManyToOne(() => IndicatorDefinition)
  @JoinColumn({ name: 'indicatorId' })
  indicator: IndicatorDefinition;

  @Column()
  contextType: string;

  @Column()
  contextId: string;

  @Column({ type: 'float', default: 0 })
  value: number;

  // Métadonnées de la valeur (historique, compteurs)
  @Column({ type: 'jsonb', default: {} })
  metadata: {
    count?: number;           // Nombre d'éléments pris en compte
    lastUpdate?: Date;        // Dernière mise à jour
    history?: Array<{         // Historique des valeurs
      value: number;
      timestamp: Date;
    }>;
    [key: string]: any;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Ajoute la nouvelle valeur à l'historique existant, utilisé par calculateTrend. */
export function buildValueMetadata(
  previous: IndicatorValue['metadata'] | null | undefined,
  value: number,
  extra: Record<string, any> = {},
): IndicatorValue['metadata'] {
  const history = [...(previous?.history ?? []), { value, timestamp: new Date() }];
  return { ...extra, lastUpdate: new Date(), history };
}