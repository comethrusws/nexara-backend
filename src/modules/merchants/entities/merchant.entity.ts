import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { MerchantKyc } from './merchant-kyc.entity';
import { FeeType, MerchantStatus, MerchantTier } from '../merchant.enums';

@Entity({ name: 'merchant' })
export class Merchant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'business_name', type: 'varchar', length: 255 })
  businessName: string;

  @Column({ name: 'contact_person', type: 'varchar', length: 255 })
  contactPerson: string;

  @Column({ name: 'mobile', type: 'varchar', length: 15 })
  mobile: string;

  @Column({ name: 'email', type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'address', type: 'varchar', length: 500 })
  address: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 32,
    default: MerchantStatus.CREATED,
  })
  status: MerchantStatus;

  @Column({ name: 'daily_payout_limit', type: 'varchar', length: 20 })
  dailyPayoutLimit: string;

  @Column({
    name: 'per_payout_limit',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  perPayoutLimit: string | null;

  @Column({
    name: 'tier',
    type: 'varchar',
    length: 16,
    default: MerchantTier.SILVER,
  })
  tier: MerchantTier;

  @Column({
    name: 'fee_type',
    type: 'varchar',
    length: 16,
    default: FeeType.FIXED,
  })
  feeType: FeeType;

  @Column({ name: 'fee_value', type: 'varchar', length: 20, default: '10.00' })
  feeValue: string;

  @Column({ name: 'gst_percent', type: 'varchar', length: 10, default: '18.00' })
  gstPercent: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @OneToOne(() => MerchantKyc, (kyc) => kyc.merchant, { cascade: true })
  kyc: MerchantKyc;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
