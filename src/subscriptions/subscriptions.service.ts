import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, MoreThan, Repository } from 'typeorm';
import {
  Subscription,
  SubscriptionStatus,
  SubscriptionTier,
  UsageRecord,
} from '../entities';
import { ChangeSubscriptionDto } from './dto/change-subscription.dto';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(SubscriptionTier)
    private readonly tiersRepository: Repository<SubscriptionTier>,
    @InjectRepository(UsageRecord)
    private readonly usageRecordsRepository: Repository<UsageRecord>,
  ) {}

  async getUserSubscription(userId: string): Promise<{
    subscription: Subscription;
    tier: SubscriptionTier;
    usage: UsageRecord | null;
  } | null> {
    const subscription = await this.findCurrentSubscription(userId);
    if (!subscription) {
      return null;
    }

    const usage = await this.getCurrentUsage(userId);
    return {
      subscription,
      tier: subscription.tier,
      usage,
    };
  }

  async changeSubscription(
    userId: string,
    dto: ChangeSubscriptionDto,
  ): Promise<Subscription> {
    const subscription = await this.findCurrentSubscription(userId);
    if (!subscription) {
      throw new NotFoundException('Active subscription not found');
    }

    const targetTier = await this.tiersRepository.findOne({
      where: { id: dto.tierId, isActive: true },
    });

    if (!targetTier) {
      throw new NotFoundException('Target tier not found');
    }

    if (subscription.tierId === targetTier.id) {
      throw new BadRequestException('You are already on this tier');
    }

    const currentPrice = Number(subscription.tier.price);
    const targetPrice = Number(targetTier.price);

    if (targetPrice > currentPrice) {
      const start = new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + 30);

      subscription.tierId = targetTier.id;
      subscription.pendingTierId = null;
      subscription.currentPeriodStart = start;
      subscription.currentPeriodEnd = end;
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.cancelledAt = null;

      await this.subscriptionsRepository.save(subscription);

      await this.resetUsageForPeriod(userId, start, end, targetTier.videosPerMonth);

      return this.findCurrentSubscriptionOrFail(userId);
    }

    subscription.pendingTierId = targetTier.id;
    await this.subscriptionsRepository.save(subscription);

    return this.findCurrentSubscriptionOrFail(userId);
  }

  async cancelSubscription(userId: string): Promise<Subscription> {
    const subscription = await this.findCurrentSubscriptionOrFail(userId);

    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.cancelledAt = new Date();

    await this.subscriptionsRepository.save(subscription);
    return this.findCurrentSubscriptionOrFail(userId);
  }

  async reactivateSubscription(userId: string): Promise<Subscription> {
    const subscription = await this.findCurrentSubscriptionOrFail(userId);

    if (
      subscription.status !== SubscriptionStatus.CANCELLED ||
      subscription.currentPeriodEnd <= new Date()
    ) {
      throw new BadRequestException('Subscription cannot be reactivated');
    }

    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.cancelledAt = null;

    await this.subscriptionsRepository.save(subscription);
    return this.findCurrentSubscriptionOrFail(userId);
  }

  async checkAndResetBillingCycle(userId: string): Promise<UsageRecord> {
    const subscription = await this.findCurrentSubscriptionOrFail(userId);

    const now = new Date();
    if (now > subscription.currentPeriodEnd) {
      if (subscription.pendingTierId) {
        subscription.tierId = subscription.pendingTierId;
        subscription.pendingTierId = null;
      }

      const start = new Date(now);
      const end = new Date(now);
      end.setDate(end.getDate() + 30);

      subscription.currentPeriodStart = start;
      subscription.currentPeriodEnd = end;

      if (subscription.status === SubscriptionStatus.CANCELLED) {
        subscription.status = SubscriptionStatus.EXPIRED;
      }

      await this.subscriptionsRepository.save(subscription);

      const freshSubscription = await this.findCurrentSubscriptionOrFail(userId);
      return this.resetUsageForPeriod(
        userId,
        start,
        end,
        freshSubscription.tier.videosPerMonth,
      );
    }

    const currentUsage = await this.getCurrentUsage(userId);
    if (currentUsage) {
      return currentUsage;
    }

    return this.resetUsageForPeriod(
      userId,
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
      subscription.tier.videosPerMonth,
    );
  }

  private async findCurrentSubscription(
    userId: string,
  ): Promise<Subscription | null> {
    return this.subscriptionsRepository.findOne({
      where: {
        userId,
        currentPeriodEnd: MoreThan(new Date()),
      } as FindOptionsWhere<Subscription>,
      relations: ['tier'],
      order: { createdAt: 'DESC' },
    });
  }

  private async findCurrentSubscriptionOrFail(userId: string): Promise<Subscription> {
    const subscription = await this.findCurrentSubscription(userId);
    if (!subscription) {
      throw new NotFoundException('Active subscription not found');
    }
    return subscription;
  }

  private async getCurrentUsage(userId: string): Promise<UsageRecord | null> {
    const now = new Date();
    return this.usageRecordsRepository
      .createQueryBuilder('usage')
      .where('usage.userId = :userId', { userId })
      .andWhere(':now BETWEEN usage.billingPeriodStart AND usage.billingPeriodEnd', { now })
      .orderBy('usage.createdAt', 'DESC')
      .getOne();
  }

  /**
   * Create or update usage for a new billing period.
   * IMPORTANT: This method accumulates remaining quota from the previous period.
   * If user had 5 videos remaining and upgrades to a 20-video plan, they get 25 total.
   */
  private async resetUsageForPeriod(
    userId: string,
    billingPeriodStart: Date,
    billingPeriodEnd: Date,
    videosLimit: number,
  ): Promise<UsageRecord> {
    // Get the current/previous usage record to check for remaining quota
    const now = new Date();
    const previousUsage = await this.usageRecordsRepository
      .createQueryBuilder('usage')
      .where('usage.userId = :userId', { userId })
      .andWhere('usage.billingPeriodEnd >= :now', { now })
      .orderBy('usage.createdAt', 'DESC')
      .getOne();

    let bonusVideos = 0;

    // Calculate remaining videos from previous plan (if any)
    if (previousUsage && previousUsage.videosLimit !== -1) {
      const videosRemaining = Math.max(
        0,
        previousUsage.videosLimit - previousUsage.videosGenerated
      );
      
      if (videosRemaining > 0) {
        bonusVideos = videosRemaining;
        this.logger.log(
          `User ${userId} had ${videosRemaining} videos remaining. ` +
          `Adding to new quota of ${videosLimit} for total of ${videosLimit + bonusVideos}`
        );
      }
    }

    // Create new usage record with accumulated quota
    // New limit = base plan limit + remaining videos from previous plan
    const totalVideosLimit = videosLimit === -1 ? -1 : videosLimit + bonusVideos;

    const usage = this.usageRecordsRepository.create({
      userId,
      billingPeriodStart,
      billingPeriodEnd,
      videosGenerated: 0,
      videosLimit: totalVideosLimit,
    });

    const saved = await this.usageRecordsRepository.save(usage);
    
    if (bonusVideos > 0) {
      this.logger.log(
        `✨ Bonus applied! User ${userId} now has ${totalVideosLimit} total videos ` +
        `(${videosLimit} from new plan + ${bonusVideos} carried over)`
      );
    }

    return saved;
  }
}
