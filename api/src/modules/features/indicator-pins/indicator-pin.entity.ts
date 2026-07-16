import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique, Index } from 'typeorm';

export type IndicatorPinContextType = 'course' | 'activity';

/** Un enseignant fige un indicateur existant sur un cours/une activité précis :
 *  tous les membres l'ont alors actif et non désactivable, avec des seuils
 *  propres à ce contexte. Totalement indépendant de `UserIndicatorPreference` -
 *  aucune écriture croisée entre les deux, pour ne jamais faire fuiter un
 *  indicateur épinglé sur les autres cours/activités d'un membre, ni laisser
 *  une désactivation personnelle effacer un indicateur figé par l'enseignant. */
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
