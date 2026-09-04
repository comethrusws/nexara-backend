import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Singleton platform rate card. Holds the default merchant fee slabs, API
 * channel slabs, upline commission rates, and GST applied across the
 * platform. Individual merchants may override slabs/commissions on their own
 * record; anything they leave unset falls back to this config.
 */
@Entity({ name: 'platform_fee_config' })
export class PlatformFeeConfig {
  @PrimaryColumn({ name: 'key', type: 'varchar', length: 32, default: 'DEFAULT' })
  key: string;

  @Column({ name: 'standard_slabs_json', type: 'text' })
  standardSlabsJson: string;

  @Column({ name: 'api_slabs_json', type: 'text' })
  apiSlabsJson: string;

  @Column({
    name: 'distributor_commission_percent',
    type: 'varchar',
    length: 10,
    default: '0.20',
  })
  distributorCommissionPercent: string;

  @Column({
    name: 'super_distributor_commission_percent',
    type: 'varchar',
    length: 10,
    default: '0.025',
  })
  superDistributorCommissionPercent: string;

  @Column({
    name: 'master_distributor_commission_percent',
    type: 'varchar',
    length: 10,
    default: '0.010',
  })
  masterDistributorCommissionPercent: string;

  @Column({ name: 'gst_percent', type: 'varchar', length: 10, default: '18.00' })
  gstPercent: string;

  @Column({ name: 'updated_by', type: 'varchar', length: 255, nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
