import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../auth.constants';

@Entity({ name: 'app_user' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'email', type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ name: 'mpin_hash', type: 'varchar', length: 255, nullable: true })
  mpinHash: string | null;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Index({ unique: true })
  @Column({ name: 'mobile', type: 'varchar', length: 15, nullable: true })
  mobile: string | null;

  @Column({ name: 'role', type: 'varchar', length: 16 })
  role: UserRole;

  @Column({ name: 'merchant_id', type: 'uuid', nullable: true })
  merchantId: string | null;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'ACTIVE' })
  status: 'ACTIVE' | 'DISABLED';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
