import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreditPackage } from '../entities/credit-package.entity';
import { CreditTransaction, TransactionStatus, TransactionType } from '../entities/credit-transaction.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class CreditsService {
  constructor(
    @InjectRepository(CreditPackage)
    private creditPackagesRepo: Repository<CreditPackage>,
    @InjectRepository(CreditTransaction)
    private transactionsRepo: Repository<CreditTransaction>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private dataSource: DataSource,
  ) {}

  /**
   * Get all active credit packages
   */
  async getPackages(): Promise<CreditPackage[]> {
    return this.creditPackagesRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', price: 'ASC' },
    });
  }

  /**
   * Get a specific package by ID
   */
  async getPackageById(packageId: string): Promise<CreditPackage> {
    const pkg = await this.creditPackagesRepo.findOne({
      where: { id: packageId, isActive: true },
    });

    if (!pkg) {
      throw new NotFoundException('Credit package not found');
    }

    return pkg;
  }

  /**
   * Purchase credits (called after successful payment)
   */
  async purchaseCredits(
    userId: string,
    packageId: string,
    paymentDetails: {
      paymentGateway: string;
      paymentId: string;
      paidAmount: string;
      freemiusInstallId?: string;
      freemiusUserId?: string;
    },
  ): Promise<CreditTransaction> {
    return this.dataSource.transaction(async (manager) => {
      // Get user
      const user = await manager.findOne(User, { where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Get package
      const pkg = await manager.findOne(CreditPackage, {
        where: { id: packageId, isActive: true },
      });
      if (!pkg) {
        throw new NotFoundException('Credit package not found');
      }

      const balanceBefore = user.tokenBalance;
      const creditsToAdd = pkg.totalCredits;
      const balanceAfter = balanceBefore + creditsToAdd;

      // Update user balance
      user.tokenBalance = balanceAfter;
      await manager.save(user);

      // Create transaction record
      const transaction = manager.create(CreditTransaction, {
        userId,
        type: TransactionType.PURCHASE,
        status: TransactionStatus.COMPLETED,
        amount: creditsToAdd,
        balanceBefore,
        balanceAfter,
        packageId,
        paidAmount: paymentDetails.paidAmount,
        paymentGateway: paymentDetails.paymentGateway,
        paymentId: paymentDetails.paymentId,
        freemiusInstallId: paymentDetails.freemiusInstallId,
        freemiusUserId: paymentDetails.freemiusUserId,
      });

      return manager.save(transaction);
    });
  }

  /**
   * Deduct credits for video generation
   */
  async deductCredits(
    userId: string,
    amount: number,
    videoId?: string | null,
  ): Promise<CreditTransaction> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (user.tokenBalance < amount) {
        throw new BadRequestException('Insufficient credits');
      }

      const balanceBefore = user.tokenBalance;
      const balanceAfter = balanceBefore - amount;

      user.tokenBalance = balanceAfter;
      await manager.save(user);

      const transaction = manager.create(CreditTransaction, {
        userId,
        type: TransactionType.DEDUCTION,
        status: TransactionStatus.COMPLETED,
        amount: -amount, // Negative for deduction
        balanceBefore,
        balanceAfter,
        videoId,
      });

      return manager.save(transaction);
    });
  }

  /**
   * Add bonus credits (promotional, referral, etc.)
   */
  async addBonusCredits(
    userId: string,
    amount: number,
    notes: string,
  ): Promise<CreditTransaction> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const balanceBefore = user.tokenBalance;
      const balanceAfter = balanceBefore + amount;

      user.tokenBalance = balanceAfter;
      await manager.save(user);

      const transaction = manager.create(CreditTransaction, {
        userId,
        type: TransactionType.BONUS,
        status: TransactionStatus.COMPLETED,
        amount,
        balanceBefore,
        balanceAfter,
        notes,
      });

      return manager.save(transaction);
    });
  }

  /**
   * Get transaction history for a user
   */
  async getTransactionHistory(
    userId: string,
    limit = 50,
  ): Promise<CreditTransaction[]> {
    return this.transactionsRepo.find({
      where: { userId },
      relations: ['package'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get user's current balance
   */
  async getUserBalance(userId: string): Promise<number> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.tokenBalance;
  }

  /**
   * Get analytics for a user (total purchased, total spent, etc.)
   */
  async getUserAnalytics(userId: string) {
    const transactions = await this.transactionsRepo.find({
      where: { userId },
      relations: ['package'],
    });

    const analytics = {
      currentBalance: 0,
      totalPurchased: 0,
      totalSpent: 0,
      totalBonusReceived: 0,
      totalMoneySpent: 0,
      purchaseCount: 0,
      videosGenerated: 0,
    };

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (user) {
      analytics.currentBalance = user.tokenBalance;
    }

    transactions.forEach((tx) => {
      if (tx.type === TransactionType.PURCHASE && tx.status === TransactionStatus.COMPLETED) {
        analytics.totalPurchased += tx.amount;
        analytics.totalMoneySpent += parseFloat(tx.paidAmount || '0');
        analytics.purchaseCount++;
      } else if (tx.type === TransactionType.DEDUCTION) {
        analytics.totalSpent += Math.abs(tx.amount);
        analytics.videosGenerated++;
      } else if (tx.type === TransactionType.BONUS) {
        analytics.totalBonusReceived += tx.amount;
      }
    });

    return analytics;
  }
}
