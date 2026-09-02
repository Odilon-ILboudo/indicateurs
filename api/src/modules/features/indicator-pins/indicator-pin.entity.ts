import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique, Index } from 'typeorm';

export type IndicatorPinContextType = 'course' | 'activity';

/** Un enseignant fige un indicateur sur un cours/une activité précis : tous les membres l'ont
 *  alors actif et non désactivable. Totalement indépendant de UserIndicatorPreference. */
@Entity('indicator_pins')
@Unique(['indicatorId', 'contextType', 'contextId'])
@Index(['contextType', 'contextId'])
export class IndicatorPin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  indicatorId: string;

  @Column({ type: 'varchar' })
  contextType: IndicatorPinContextType;

  @Column()
  contextId: string;

  @Column({ type: 'jsonb', nullable: true })
  thresholdsOverride: { good?: number; warning?: number; critical?: number } | null;

  @Column()
  pinnedByUserId: string;

  @CreateDateColumn()
  createdAt: Date;
}
