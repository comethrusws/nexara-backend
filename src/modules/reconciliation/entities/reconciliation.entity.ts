import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ReconciliationStatus =
  | 'MATCHED'
  | 'PENDING'
  | 'MISMATCH'
  | 'MANUAL_REVIEW'
  | 'FAILED';

@Entity({ name: 'reconciliation_item' })
export class ReconciliationItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'payout_id', type: 'uuid' })
  payoutId: string;

  @Index()
  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  @Column({ name: 'merchant_name', type: 'varchar', length: 255 })
  merchantName: string;

  @Column({ name: 'merchant_reference', type: 'varchar', length: 64 })
  merchantReference: string;

  @Column({ name: 'amount', type: 'varchar', length: 20 })
  amount: string;

  @Column({ name: 'nexara_status', type: 'varchar', length: 32 })
  nexaraStatus: string;

  @Column({ name: 'bank_status', type: 'varchar', length: 32 })
  bankStatus: string;

  @Column({ name: 'status', type: 'varchar', length: 32 })
  status: ReconciliationStatus;

  @Column({ name: 'bank_ref', type: 'varchar', length: 128, nullable: true })
  bankRef: string | null;

  @Column({ name: 'discrepancy_details', type: 'varchar', length: 500, nullable: true })
  discrepancyDetails: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolved_by', type: 'varchar', length: 255, nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolution_notes', type: 'varchar', length: 500, nullable: true })
  resolutionNotes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
