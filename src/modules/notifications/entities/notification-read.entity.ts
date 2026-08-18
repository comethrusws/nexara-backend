import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'notification_read' })
@Index(['userId', 'notificationId'], { unique: true })
export class NotificationRead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId: string;

  @CreateDateColumn({ name: 'read_at', type: 'timestamptz' })
  readAt: Date;
}
