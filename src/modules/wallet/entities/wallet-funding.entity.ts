import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const FundingChannel = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  UPI: 'UPI',
  CARD: 'CARD',
} as const;

export type FundingChannel =
  (typeof FundingChannel)[keyof typeof FundingChannel];

export const FundingStatus = {
  PENDING: 'PENDING',
  POSTED: 'POSTED',
  FAILED: 'FAILED',
} as const;

@Entity({ name: 'wallet_funding' })
export class WalletFunding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  @Column({ name: 'channel', type: 'varchar', length: 32 })
  channel: FundingChannel;

  @Column({ name: 'amount', type: 'varchar', length: 20 })
  amount: string;

  @Column({ name: 'status', type: 'varchar', length: 16 })
  status: string;

  @Column({ name: 'external_ref', type: 'varchar', length: 64 })
  externalRef: string;

  @Column({ name: 'notes', type: 'varchar', length: 255, nullable: true })
  notes: string | null;

  @Column({ name: 'payment_date', type: 'date', nullable: true })
  paymentDate: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
