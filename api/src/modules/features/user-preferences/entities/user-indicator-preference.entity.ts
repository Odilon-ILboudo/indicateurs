// src/indicators/entities/user-indicator-preference.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { IndicatorDefinition } from '../../indicators/entities/indicator-definition.entity';

@Entity('user_indicator_preferences')
@Index(['userId', 'indicatorId'], { unique: true })
@Index(['userId'])
@Index(['indicatorId'])
export class UserIndicatorPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string;

  @Column({ name: 'indicator_id', type: 'uuid' })
  indicatorId: string;

  @ManyToOne(() => IndicatorDefinition)
  @JoinColumn({ name: 'indicator_id' })
  indicator: IndicatorDefinition;

  @Column({ name: 'is_visible', type: 'boolean', default: true })
  isVisible: boolean;

  @Column({ type: 'jsonb', nullable: true })
  displayPreferences: {
    icon?: string;    // Icône différente
    color?: string;   // Couleur différente
  };

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}