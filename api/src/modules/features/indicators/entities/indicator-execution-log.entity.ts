import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('indicator_execution_logs')
@Index(['indicatorId', 'executedAt'])
export class IndicatorExecutionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  indicatorId: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ type: 'float', nullable: true })
  value: number;

  @Column({ nullable: true })
  durationMs: number;

  @Column({ type: 'text', nullable: true })
  error: string;

  @CreateDateColumn()
  executedAt: Date;
}
