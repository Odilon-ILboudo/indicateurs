import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('ingestion_cursors')
export class IngestionCursor {
  @PrimaryColumn({ name: 'stream_name' })
  streamName: string;

  @Column({ name: 'last_id', type: 'bigint', default: 0 })
  lastId: string; // bigint retourné comme string par PostgreSQL

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
