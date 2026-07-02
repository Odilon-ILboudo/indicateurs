import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('indicator_feedback')
export class IndicatorFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  indicatorId: string;

  @Column()
  userId: string;

  @Column({ type: 'int' })
  rating: number; // 1-5

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
