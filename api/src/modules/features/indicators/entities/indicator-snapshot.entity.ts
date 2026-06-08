import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('indicator_snapshots')
@Unique(['indicatorId', 'contextType', 'contextId', 'activityId'])
export class IndicatorSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  indicatorId: string;

  @Column({ default: 'group' })
  contextType: string;

  @Column()
  contextId: string;  // groupId (CourseGroups.id)

  @Column()
  activityId: string;

  @Column()
  title: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
