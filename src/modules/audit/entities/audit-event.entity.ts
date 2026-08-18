import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'audit_event' })
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'actor_email', type: 'varchar', length: 255 })
  actorEmail: string;

  @Column({ name: 'actor_role', type: 'varchar', length: 16 })
  actorRole: string;

  @Column({ name: 'action', type: 'varchar', length: 64 })
  action: string;

  @Column({ name: 'merchant_id', type: 'uuid', nullable: true })
  merchantId: string | null;

  @Column({ name: 'reference', type: 'varchar', length: 128, nullable: true })
  reference: string | null;

  @Column({ name: 'details', type: 'text' })
  details: string;

  @Column({ name: 'previous_value', type: 'text', nullable: true })
  previousValue: string | null;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
