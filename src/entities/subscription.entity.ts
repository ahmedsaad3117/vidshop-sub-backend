import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubscriptionStatus } from './enums/subscription-status.enum';
import { SubscriptionTier } from './subscription-tier.entity';
import { User } from './user.entity';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  tierId!: string;

  @Column({ type: 'uuid', nullable: true })
  pendingTierId!: string | null;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status!: SubscriptionStatus;

  @Column({ type: 'varchar', nullable: true })
  freemiusInstallId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  freemiusUserId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  freemiusLicenseId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  freemiusPlanId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  licenseKey!: string | null;

  @Column({ type: 'timestamp' })
  currentPeriodStart!: Date;

  @Column({ type: 'timestamp' })
  currentPeriodEnd!: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt!: Date | null;

  @ManyToOne(() => User, (user: User) => user.subscriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @ManyToOne(() => SubscriptionTier, (tier: SubscriptionTier) => tier.subscriptions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'tierId' })
  tier!: SubscriptionTier;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
