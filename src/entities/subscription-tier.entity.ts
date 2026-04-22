import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Subscription } from './subscription.entity';

@Entity('subscription_tiers')
export class SubscriptionTier {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column()
  displayName!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: string;

  @Column({ type: 'int' })
  videosPerMonth!: number;

  @Column({ type: 'int', default: 0 })
  textsPerMonth!: number;

  @Column({ type: 'int', default: 0 })
  tokenAllocation!: number;

  @Column({ default: false })
  hasAllTemplates!: boolean;

  @Column({ default: false })
  hasCustomPrompts!: boolean;

  @Column({ default: false })
  hasPriorityProcessing!: boolean;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', nullable: true })
  freemiusPlanId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  freemiusPricingId!: string | null;

  @Column({ type: 'int' })
  sortOrder!: number;

  @OneToMany(() => Subscription, (subscription: Subscription) => subscription.tier)
  subscriptions!: Subscription[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
