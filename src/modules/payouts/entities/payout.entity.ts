import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PayoutStatus {
  INITIATED = 'INITIATED',
  FUNDS_BLOCKED = 'FUNDS_BLOCKED',
  SUBMITTED_TO_BANK = 'SUBMITTED_TO_BANK',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
}

@Entity({ name: 'payout' })
@Index(['merchantId', 'merchantReference'], { unique: true })
export class Payout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  @Column({ name: 'merchant_reference', type: 'varchar', length: 64 })
  merchantReference: string;

  @Column({ name: 'amount', type: 'varchar', length: 20 })
  amount: string;

  @Column({ name: 'fee', type: 'varchar', length: 20 })
  fee: string;

  @Column({ name: 'gst', type: 'varchar', length: 20 })
  gst: string;

  @Column({ name: 'reserved', type: 'varchar', length: 20 })
  reserved: string;

  @Column({ name: 'status', type: 'varchar', length: 32 })
  status: PayoutStatus;

  @Column({ name: 'payment_mode', type: 'varchar', length: 16 })
  paymentMode: string;

  @Column({ name: 'beneficiary_name', type: 'varchar', length: 255 })
  beneficiaryName: string;

  @Column({
    name: 'beneficiary_account_last4',
    type: 'varchar',
    length: 4,
    nullable: true,
  })
  beneficiaryAccountLast4: string | null;

  @Column({ name: 'beneficiary_ifsc', type: 'varchar', length: 11, nullable: true })
  beneficiaryIfsc: string | null;

  @Column({ name: 'beneficiary_vpa', type: 'varchar', length: 128, nullable: true })
  beneficiaryVpa: string | null;

  @Column({ name: 'hold_transaction_id', type: 'int', nullable: true })
  holdTransactionId: number | null;

  @Column({ name: 'bank_code', type: 'varchar', length: 16, nullable: true })
  bankCode: string | null;

  @Column({
    name: 'bank_reference',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  bankReference: string | null;

  @Column({
    name: 'failure_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  failureReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
