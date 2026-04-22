import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Subscription } from './subscription.entity';
import { UsageRecord } from './usage-record.entity';
import { VideoGeneration } from './video-generation.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Exclude()
  @Column()
  password!: string;

  @Column({ type: 'varchar', nullable: true })
  firstName!: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastName!: string | null;

  @Column({ type: 'varchar', nullable: true })
  companyName!: string | null;

  @Column({ type: 'varchar' })
  websiteUrl!: string;

  @Column({ type: 'int', default: 0 })
  tokenBalance!: number;

  @Column({ type: 'varchar', nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  deviceInfo!: Record<string, any> | null;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ default: false })
  isAdmin!: boolean;

  @OneToMany(() => Subscription, (subscription: Subscription) => subscription.user)
  subscriptions!: Subscription[];

  @OneToMany(() => VideoGeneration, (video: VideoGeneration) => video.user)
  videoGenerations!: VideoGeneration[];

  @OneToMany(() => UsageRecord, (usageRecord: UsageRecord) => usageRecord.user)
  usageRecords!: UsageRecord[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
