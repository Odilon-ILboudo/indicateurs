import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('indicator_notifications')
export class IndicatorNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  indicatorId: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
