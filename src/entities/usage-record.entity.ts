import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('usage_records')
export class UsageRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'timestamp' })
  billingPeriodStart!: Date;

  @Column({ type: 'timestamp' })
  billingPeriodEnd!: Date;

  @Column({ type: 'int', default: 0 })
  videosGenerated!: number;

  @Column({ type: 'int' })
  videosLimit!: number;

  @Column({ type: 'int', default: 0 })
  textsGenerated!: number;

  @Column({ type: 'int', default: 0 })
  textsLimit!: number;

  @ManyToOne(() => User, (user: User) => user.usageRecords, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
