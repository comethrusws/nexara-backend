import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from './organization.entity';

@Entity({ name: 'organization_feature' })
@Index(['organizationId', 'featureCode'], { unique: true })
export class OrganizationFeature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'feature_code', type: 'varchar', length: 64 })
  featureCode: string;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled: boolean;
}
