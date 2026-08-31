import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'bill_payment' })
export class BillPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  @Column({ name: 'merchant_name', type: 'varchar', length: 255 })
  merchantName: string;

  @Column({ name: 'biller_id', type: 'varchar', length: 64 })
  billerId: string;

  @Column({ name: 'biller_name', type: 'varchar', length: 255 })
  billerName: string;

  @Column({ name: 'category', type: 'varchar', length: 32 })
  category: string;

  @Column({ name: 'consumer_number', type: 'varchar', length: 64 })
  consumerNumber: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 255 })
  customerName: string;

  @Column({ name: 'bill_number', type: 'varchar', length: 64 })
  billNumber: string;

  @Column({ name: 'bill_amount', type: 'varchar', length: 20 })
  billAmount: string;

  @Column({ name: 'conv_fee', type: 'varchar', length: 20, default: '0.00' })
  convFee: string;

  @Column({ name: 'total_paid', type: 'varchar', length: 20 })
  totalPaid: string;

  @Column({ name: 'status', type: 'varchar', length: 16 })
  status: 'SUCCESS' | 'FAILED' | 'PROCESSING';

  @Column({ name: 'bbps_ref', type: 'varchar', length: 64 })
  bbpsRef: string;

  @CreateDateColumn({ name: 'paid_at', type: 'timestamptz' })
  paidAt: Date;
}
