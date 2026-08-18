import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'wallet_mapping' })
export class WalletMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 64, unique: true })
  merchantId: string;

  @Column({ name: 'fineract_client_id', type: 'int' })
  fineractClientId: number;

  @Column({ name: 'fineract_savings_account_id', type: 'int' })
  fineractSavingsAccountId: number;

  @Column({ name: 'fineract_external_id', type: 'varchar', length: 128 })
  fineractExternalId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
