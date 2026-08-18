import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'beneficiary' })
export class SavedBeneficiary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'account_number', type: 'varchar', length: 32, nullable: true })
  accountNumber: string | null;

  @Column({ name: 'account_last4', type: 'varchar', length: 4, nullable: true })
  accountLast4: string | null;

  @Column({ name: 'ifsc', type: 'varchar', length: 11, nullable: true })
  ifsc: string | null;

  @Column({ name: 'bank_name', type: 'varchar', length: 128, nullable: true })
  bankName: string | null;

  @Column({ name: 'vpa', type: 'varchar', length: 128, nullable: true })
  vpa: string | null;

  @Column({ name: 'payment_mode', type: 'varchar', length: 16, default: 'IMPS' })
  paymentMode: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
