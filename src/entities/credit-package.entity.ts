import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('credit_packages')
export class CreditPackage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column()
  displayName!: string;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: string; // Price in USD

  @Column({ type: 'int' })
  credits!: number; // Number of video generation credits

  @Column({ type: 'int', default: 0 })
  bonusCredits!: number; // Bonus credits (e.g., buy 100 get 20 free)

  @Column({ default: true })
  isActive!: boolean;

  @Column({ default: 0 })
  sortOrder!: number;

  // Badge/tag for marketing (e.g., "Most Popular", "Best Value")
  @Column({ type: 'varchar', nullable: true })
  badge?: string | null;

  // Freemius integration
  @Column({ type: 'varchar', nullable: true })
  freemiusAddonId?: string | null; // Freemius add-on ID

  @Column({ type: 'varchar', nullable: true })
  freemiusPricingId?: string | null; // Freemius pricing ID

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Computed total credits (credits + bonusCredits)
  get totalCredits(): number {
    return this.credits + this.bonusCredits;
  }

  // Price per credit (for comparison)
  get pricePerCredit(): number {
    return parseFloat(this.price) / this.totalCredits;
  }
}
