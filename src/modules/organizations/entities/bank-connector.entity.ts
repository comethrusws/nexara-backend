import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'bank_connector' })
export class BankConnector {
  @PrimaryColumn({ name: 'code', type: 'varchar', length: 16 })
  code: string;

  @Column({ name: 'name', type: 'varchar', length: 128 })
  name: string;

  @Column({ name: 'enabled', type: 'boolean', default: false })
  enabled: boolean;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;
}
