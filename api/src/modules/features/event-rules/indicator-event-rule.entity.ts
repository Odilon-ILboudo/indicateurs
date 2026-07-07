import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { IndicatorEventType } from '../event-types/event-type.entity';

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

@Entity('indicator_event_rules')
export class IndicatorEventRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_type_id' })
  eventTypeId: string;

  @ManyToOne(() => IndicatorEventType, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'event_type_id' })
  eventType: IndicatorEventType;

  @Column({ name: 'source_table' })
  sourceTable: string;

  @Column({ name: 'watched_column', type: 'varchar', nullable: true })
  watchedColumn: string | null;

  @Column({ default: 'UPDATE' })
  operation: EventRuleOperation;

  @Column({ type: 'jsonb' })
  condition: EventRuleCondition;

  @Column({ name: 'context_mapping', type: 'jsonb' })
  contextMapping: EventRuleContextMapping;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'trigger_installed', default: false })
  triggerInstalled: boolean;

  @Column({ name: 'installed_at', type: 'timestamptz', nullable: true })
  installedAt: Date | null;

  @Column({ name: 'last_applied_sql', type: 'text', nullable: true })
  lastAppliedSql: string | null;

  @Column({ name: 'last_install_error', type: 'text', nullable: true })
  lastInstallError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
