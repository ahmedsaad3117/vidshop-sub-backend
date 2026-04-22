import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Subscription,
  SubscriptionStatus,
  SubscriptionTier,
  UsageRecord,
  VideoGeneration,
  VideoStatus,
} from '../entities';
import { AdminUsageQueryDto } from './dto/admin-usage-query.dto';
import { UsageStatsDto } from './dto/usage-stats.dto';

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @InjectRepository(UsageRecord)
    private readonly usageRepository: Repository<UsageRecord>,
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(SubscriptionTier)
    private readonly tiersRepository: Repository<SubscriptionTier>,
    @InjectRepository(VideoGeneration)
    private readonly videoRepository: Repository<VideoGeneration>,
  ) {}

  async getUserUsageStats(userId: string): Promise<UsageStatsDto> {
    const subscription = await this.getActiveSubscription(userId);
    const usage = await this.getOrCreateCurrentUsageRecord(userId);

    const videosRemaining =
      usage.videosLimit === -1 ? -1 : Math.max(usage.videosLimit - usage.videosGenerated, 0);

    const textsRemaining =
      usage.textsLimit === -1 ? -1 : Math.max(usage.textsLimit - usage.textsGenerated, 0);

    const videosPercentUsed =
      usage.videosLimit === -1 || usage.videosLimit === 0
        ? 0
        : Math.min(100, Math.round((usage.videosGenerated / usage.videosLimit) * 100));

    const textsPercentUsed =
      usage.textsLimit === -1 || usage.textsLimit === 0
        ? 0
        : Math.min(100, Math.round((usage.textsGenerated / usage.textsLimit) * 100));

    const now = new Date();
    const daysRemaining = Math.max(
      0,
      Math.ceil((usage.billingPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );

    const [totalVideosAllTime, totalTextsAllTime, totalSuccessful, totalFailed] = await Promise.all([
      this.videoRepository.count({ where: { userId } }),
      // TODO: Add TextGeneration repository when implemented
      Promise.resolve(0),
      this.videoRepository.count({ where: { userId, status: VideoStatus.COMPLETED } }),
      this.videoRepository.count({ where: { userId, status: VideoStatus.FAILED } }),
    ]);

    return {
      currentPeriod: {
        videosGenerated: usage.videosGenerated,
        videosLimit: usage.videosLimit,
        videosRemaining,
        videosPercentUsed,
        textsGenerated: usage.textsGenerated,
        textsLimit: usage.textsLimit,
        textsRemaining,
        textsPercentUsed,
        periodStart: usage.billingPeriodStart,
        periodEnd: usage.billingPeriodEnd,
        daysRemaining,
      },
      subscription: {
        tierName: subscription.tier.name,
        tierDisplayName: subscription.tier.displayName,
        status: subscription.status,
      },
      history: {
        totalVideosAllTime,
        totalTextsAllTime,
        totalSuccessful,
        totalFailed,
      },
    };
  }

  async getOrCreateCurrentUsageRecord(userId: string): Promise<UsageRecord> {
    const subscription = await this.getActiveSubscription(userId);

    const now = new Date();
    let usage = await this.usageRepository
      .createQueryBuilder('usage')
      .where('usage.userId = :userId', { userId })
      .andWhere(':now BETWEEN usage.billingPeriodStart AND usage.billingPeriodEnd', { now })
      .orderBy('usage.createdAt', 'DESC')
      .getOne();

    if (!usage) {
      usage = this.usageRepository.create({
        userId,
        billingPeriodStart: subscription.currentPeriodStart,
        billingPeriodEnd: subscription.currentPeriodEnd,
        videosGenerated: 0,
        videosLimit: subscription.tier.videosPerMonth,
        textsGenerated: 0,
        textsLimit: subscription.tier.textsPerMonth,
      });
      usage = await this.usageRepository.save(usage);
    }

    return usage;
  }

  async incrementVideoUsage(userId: string): Promise<UsageRecord> {
    const usage = await this.getOrCreateCurrentUsageRecord(userId);
    usage.videosGenerated += 1;
    return this.usageRepository.save(usage);
  }

  async incrementTextUsage(userId: string, count = 1): Promise<UsageRecord> {
    const usage = await this.getOrCreateCurrentUsageRecord(userId);
    usage.textsGenerated += count;
    return this.usageRepository.save(usage);
  }

  // Legacy method - redirects to incrementVideoUsage
  async incrementUsage(userId: string): Promise<UsageRecord> {
    return this.incrementVideoUsage(userId);
  }

  async canGenerateVideo(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const subscription = await this.getActiveSubscription(userId);

    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      return { allowed: false, reason: 'Subscription is not active' };
    }

    const usage = await this.getOrCreateCurrentUsageRecord(userId);

    if (usage.videosLimit !== -1 && usage.videosGenerated >= usage.videosLimit) {
      return { allowed: false, reason: 'Monthly video generation limit reached' };
    }

    return { allowed: true };
  }

  async canGenerateText(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const subscription = await this.getActiveSubscription(userId);

    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      return { allowed: false, reason: 'Subscription is not active' };
    }

    const usage = await this.getOrCreateCurrentUsageRecord(userId);

    if (usage.textsLimit !== -1 && usage.textsGenerated >= usage.textsLimit) {
      return { allowed: false, reason: 'Monthly text generation limit reached' };
    }

    return { allowed: true };
  }

  async getAdminUsageOverview(query: AdminUsageQueryDto) {
    const period = query.period ?? 'month';
    const now = new Date();
    const start = new Date(now);

    if (period === 'day') {
      start.setDate(now.getDate() - 1);
    } else if (period === 'week') {
      start.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      start.setMonth(now.getMonth() - 1);
    } else {
      start.setFullYear(1970, 0, 1);
    }

    const [totalActiveUsers, totalVideosAllTime, totalVideosInPeriod, videosByTierRaw] =
      await Promise.all([
        this.subscriptionsRepository
          .createQueryBuilder('subscription')
          .select('COUNT(DISTINCT subscription.userId)', 'count')
          .where('subscription.status = :status', { status: SubscriptionStatus.ACTIVE })
          .getRawOne(),
        this.videoRepository.count(),
        this.videoRepository
          .createQueryBuilder('video')
          .where('video.createdAt >= :start', { start })
          .getCount(),
        this.subscriptionsRepository
          .createQueryBuilder('subscription')
          .leftJoin('subscription.tier', 'tier')
          .select('tier.name', 'tierName')
          .addSelect('COUNT(*)', 'count')
          .where('subscription.status = :status', { status: SubscriptionStatus.ACTIVE })
          .groupBy('tier.name')
          .getRawMany(),
      ]);

    return {
      period,
      totalActiveUsers: Number(totalActiveUsers?.count || 0),
      totalVideosGeneratedAllTime: totalVideosAllTime,
      totalVideosGeneratedInPeriod: totalVideosInPeriod,
      videosByTier: videosByTierRaw.map((row) => ({
        tierName: row.tierName,
        count: Number(row.count),
      })),
    };
  }

  @Cron('0 0 * * *')
  async handleBillingCycleResets(): Promise<void> {
    const now = new Date();
    const expiredSubscriptions = await this.subscriptionsRepository.find({
      where: [
        { status: SubscriptionStatus.ACTIVE },
        { status: SubscriptionStatus.CANCELLED },
      ],
      relations: ['tier'],
    });

    const freeTier = await this.tiersRepository.findOne({ where: { name: 'free' } });

    for (const subscription of expiredSubscriptions) {
      if (subscription.currentPeriodEnd >= now) {
        continue;
      }

      if (subscription.status === SubscriptionStatus.CANCELLED) {
        if (freeTier) {
          subscription.tierId = freeTier.id;
          subscription.pendingTierId = null;
          subscription.status = SubscriptionStatus.EXPIRED;
          subscription.cancelledAt = now;

          await this.subscriptionsRepository.save(subscription);
          this.logger.log(`Cancelled subscription expired and downgraded: ${subscription.id}`);
        }
        continue;
      }

      if (subscription.pendingTierId) {
        subscription.tierId = subscription.pendingTierId;
        subscription.pendingTierId = null;
      }

      const start = new Date(now);
      const end = new Date(now);
      end.setDate(end.getDate() + 30);

      subscription.currentPeriodStart = start;
      subscription.currentPeriodEnd = end;

      await this.subscriptionsRepository.save(subscription);

      const refreshed = await this.subscriptionsRepository.findOne({
        where: { id: subscription.id },
        relations: ['tier'],
      });

      if (refreshed) {
        await this.usageRepository.save(
          this.usageRepository.create({
            userId: refreshed.userId,
            billingPeriodStart: start,
            billingPeriodEnd: end,
            videosGenerated: 0,
            videosLimit: refreshed.tier.videosPerMonth,
          }),
        );
      }

      this.logger.log(`Reset billing cycle for subscription: ${subscription.id}`);
    }
  }

  private async getActiveSubscription(userId: string): Promise<Subscription> {
    const subscription = await this.subscriptionsRepository.findOne({
      where: { userId },
      relations: ['tier'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.status === SubscriptionStatus.EXPIRED) {
      throw new ForbiddenException('Subscription has expired');
    }

    return subscription;
  }
}
