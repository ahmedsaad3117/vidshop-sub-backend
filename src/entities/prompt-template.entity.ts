import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PromptCategory } from './enums/prompt-category.enum';
import { PromptTier } from './enums/prompt-tier.enum';
import { VideoGeneration } from './video-generation.entity';

@Entity('prompt_templates')
export class PromptTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text' })
  promptText!: string;

  @Column({
    type: 'enum',
    enum: PromptCategory,
  })
  category!: PromptCategory;

  @Column({
    type: 'enum',
    enum: PromptTier,
    default: PromptTier.BASIC,
  })
  tier!: PromptTier;

  @Column({ type: 'varchar', nullable: true })
  thumbnailUrl!: string | null;

  @Column({ type: 'varchar', nullable: true })
  exampleVideoUrl!: string | null;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'int' })
  sortOrder!: number;

  @OneToMany(() => VideoGeneration, (videoGeneration: VideoGeneration) => videoGeneration.template)
  videoGenerations!: VideoGeneration[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
