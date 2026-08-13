import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// L'unicité (indicatorId, contextType, contextId, activityId|courseId) est appliquée par
// deux index uniques partiels en base (voir la migration SnapshotCourseScope), pas par un
// simple @Unique() : activityId et courseId sont mutuellement exclusifs et l'un des deux
// est toujours NULL, ce qu'un @Unique() composite ne gère pas correctement.
@Entity('indicator_snapshots')
export class IndicatorSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  indicatorId: string;

  @Column({ default: 'group' })
  contextType: string;

  @Column()
  contextId: string;  // groupId (CourseGroups.id)

  /** Exactement l'un des deux (activityId ou courseId) est renseigné, jamais les deux. */
  @Column({ type: 'varchar', nullable: true })
  activityId: string | null;

  @Column({ type: 'varchar', nullable: true })
  courseId: string | null;

  @Column()
  title: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
