import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'webhook_delivery' })
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'webhook_id', type: 'uuid' })
  webhookId: string;

  @Column({ name: 'event', type: 'varchar', length: 64 })
  event: string;

  @Column({ name: 'payload_summary', type: 'varchar', length: 255 })
  payloadSummary: string;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ name: 'attempts', type: 'int', default: 1 })
  attempts: number;

  @Column({ name: 'status', type: 'varchar', length: 16 })
  status: 'SUCCESS' | 'FAILED';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
