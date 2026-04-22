import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';
import { CreditPackage } from './credit-package.entity';

export enum TransactionType {
  PURCHASE = 'purchase', // User bought credits
  DEDUCTION = 'deduction', // Credits used for video generation
  BONUS = 'bonus', // Promotional/bonus credits
  REFUND = 'refund', // Credits refunded
  ADJUSTMENT = 'adjustment', // Manual adjustment by admin
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Entity('credit_transactions')
export class CreditTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'enum', enum: TransactionType })
  type!: TransactionType;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING })
  status!: TransactionStatus;

  @Column({ type: 'int' })
  amount!: number; // Number of credits (positive for purchase/bonus, negative for deduction)

  @Column({ type: 'int' })
  balanceBefore!: number; // Token balance before transaction

  @Column({ type: 'int' })
  balanceAfter!: number; // Token balance after transaction

  // For purchases
  @Column({ type: 'uuid', nullable: true })
  packageId?: string | null;

  @ManyToOne(() => CreditPackage, { nullable: true })
  @JoinColumn({ name: 'packageId' })
  package?: CreditPackage;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  paidAmount?: string | null; // Amount paid in USD

  // Payment gateway info
  @Column({ type: 'varchar', nullable: true })
  paymentGateway?: string | null; // 'freemius', 'stripe', etc.

  @Column({ type: 'varchar', nullable: true })
  paymentId?: string | null; // External payment ID (Freemius payment ID, etc.)

  @Column({ type: 'varchar', nullable: true })
  freemiusInstallId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  freemiusUserId?: string | null;

  // For deductions (video generation)
  @Column({ type: 'uuid', nullable: true })
  videoId?: string | null; // Reference to video generation request

  // For adjustments/refunds
  @Column({ type: 'text', nullable: true })
  notes?: string | null; // Admin notes or reason

  @Column({ type: 'text', nullable: true })
  metadata?: string | null; // JSON metadata for additional info

  @CreateDateColumn()
  createdAt!: Date;

  // Helper to parse metadata
  get metadataObject(): any {
    try {
      return this.metadata ? JSON.parse(this.metadata) : {};
    } catch {
      return {};
    }
  }
}
