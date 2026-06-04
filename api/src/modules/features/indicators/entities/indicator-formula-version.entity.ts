// src/modules/features/indicators/entities/indicator-formula-version.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('indicator_formula_versions')
@Index(['indicatorId', 'versionNum'])
export class IndicatorFormulaVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  indicatorId: string;

  @Column()
  versionNum: number;

  @Column({ type: 'jsonb' })
  formula: any;

  @Column({ nullable: true })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
