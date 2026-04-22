import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VideoStatus } from './enums/video-status.enum';
import { PromptTemplate } from './prompt-template.entity';
import { User } from './user.entity';

@Entity('video_generations')
export class VideoGeneration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true })
  templateId!: string | null;

  @Column()
  productTitle!: string;

  @Column({ type: 'text' })
  productDescription!: string;

  @Column()
  productImageUrl!: string;

  @Column({ type: 'varchar', nullable: true })
  category!: string | null;

  @Column({ type: 'text' })
  promptUsed!: string;

  @Column({ type: 'text', nullable: true })
  customPrompt!: string | null;

  @Column({
    type: 'enum',
    enum: VideoStatus,
    default: VideoStatus.PENDING,
  })
  status!: VideoStatus;

  @Column({ type: 'varchar', nullable: true })
  videoUrl!: string | null;

  @Column({ type: 'int', nullable: true })
  tokensUsed!: number | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  processingStartedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @ManyToOne(() => User, (user: User) => user.videoGenerations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @ManyToOne(() => PromptTemplate, (template: PromptTemplate) => template.videoGenerations, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'templateId' })
  template!: PromptTemplate | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
