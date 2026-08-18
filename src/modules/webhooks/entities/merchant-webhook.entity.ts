import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'merchant_webhook' })
export class MerchantWebhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  @Column({ name: 'url', type: 'varchar', length: 500 })
  url: string;

  @Column({ name: 'events', type: 'text' })
  events: string;

  @Column({ name: 'secret', type: 'varchar', length: 128 })
  secret: string;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'ACTIVE' })
  status: 'ACTIVE' | 'FAILING';

  @Column({ name: 'last_delivery_at', type: 'timestamptz', nullable: true })
  lastDeliveryAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
