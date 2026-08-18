import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Merchant } from './merchant.entity';

export type DocumentKycStatus = 'PENDING' | 'VERIFIED' | 'FAILED';

@Entity({ name: 'merchant_kyc' })
export class MerchantKyc {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Merchant, (merchant) => merchant.kyc, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchant_id' })
  merchant: Merchant;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  @Column({
    name: 'aadhaar_status',
    type: 'varchar',
    length: 16,
    default: 'PENDING',
  })
  aadhaarStatus: DocumentKycStatus;

  @Column({
    name: 'aadhaar_last4',
    type: 'varchar',
    length: 4,
    nullable: true,
  })
  aadhaarLast4: string | null;

  @Column({
    name: 'aadhaar_provider_ref',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  aadhaarProviderRef: string | null;

  @Column({
    name: 'pan_status',
    type: 'varchar',
    length: 16,
    default: 'PENDING',
  })
  panStatus: DocumentKycStatus;

  @Column({ name: 'pan_masked', type: 'varchar', length: 16, nullable: true })
  panMasked: string | null;

  @Column({
    name: 'pan_provider_ref',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  panProviderRef: string | null;

  @Column({ name: 'aadhaar_front_path', type: 'varchar', length: 500, nullable: true })
  aadhaarFrontPath: string | null;

  @Column({ name: 'aadhaar_back_path', type: 'varchar', length: 500, nullable: true })
  aadhaarBackPath: string | null;

  @Column({ name: 'pan_image_path', type: 'varchar', length: 500, nullable: true })
  panImagePath: string | null;

  @Column({
    name: 'aadhaar_image_match',
    type: 'varchar',
    length: 16,
    default: 'PENDING',
  })
  aadhaarImageMatch: 'PENDING' | 'MATCHED' | 'MISMATCH';

  @Column({
    name: 'pan_image_match',
    type: 'varchar',
    length: 16,
    default: 'PENDING',
  })
  panImageMatch: 'PENDING' | 'MATCHED' | 'MISMATCH';

  @Column({ name: 'selfie_path', type: 'varchar', length: 500, nullable: true })
  selfiePath: string | null;

  @Column({ name: 'latitude', type: 'varchar', length: 32, nullable: true })
  latitude: string | null;

  @Column({ name: 'longitude', type: 'varchar', length: 32, nullable: true })
  longitude: string | null;

  @Column({ name: 'agreement_signed_at', type: 'timestamptz', nullable: true })
  agreementSignedAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
