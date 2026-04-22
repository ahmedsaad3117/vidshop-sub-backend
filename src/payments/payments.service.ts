import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import {
  Subscription,
  SubscriptionStatus,
  SubscriptionTier,
  UsageRecord,
  User,
} from '../entities';
import { CreditPackage } from '../entities/credit-package.entity';
import { CreditsService } from '../credits/credits.service';
import { ActivatePurchaseDto } from './dto/activate-purchase.dto';
import { CheckoutConfigDto } from './dto/checkout-config.dto';
import { VerifyLicenseDto } from './dto/verify-license.dto';
import { FreemiusService } from './freemius.service';
import { FreemiusWebhookEvent } from './types/freemius.types';
import { console } from 'inspector';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(SubscriptionTier)
    private readonly tiersRepository: Repository<SubscriptionTier>,
    @InjectRepository(UsageRecord)
    private readonly usageRepository: Repository<UsageRecord>,
    @InjectRepository(CreditPackage)
    private readonly creditPackagesRepository: Repository<CreditPackage>,
    private readonly freemiusService: FreemiusService,
    private readonly creditsService: CreditsService,
  ) {}

  async getCheckoutConfig(userId: string, tierId: string): Promise<CheckoutConfigDto> {
    const [user, tier] = await Promise.all([
      this.usersRepository.findOne({ where: { id: userId } }),
      this.tiersRepository.findOne({ where: { id: tierId, isActive: true } }),
    ]);

    if (!user || !tier) {
      throw new NotFoundException('User or tier not found');
    }

    if (!tier.freemiusPlanId || !tier.freemiusPricingId) {
      throw new NotFoundException('Freemius mapping missing for selected tier');
    }

    const config = this.freemiusService.getCheckoutConfig();

    // Construct user name with fallback logic:
    // 1. Use firstName + lastName if available
    // 2. Extract name from email (part before @)
    // 3. Fall back to "User"
    let userName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    
    if (!userName) {
      // Extract username from email (e.g., "john.doe@example.com" -> "john.doe")
      const emailUsername = user.email.split('@')[0];
      // Replace dots/underscores with spaces and capitalize
      userName = emailUsername
        .replace(/[._-]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ') || 'User';
    }

    this.logger.log(`Checkout config for user ${userId}: email=${user.email}, name=${userName}`);

    return {
      pluginId: config.pluginId,
      publicKey: config.publicKey,
      planId: tier.freemiusPlanId,
      pricingId: tier.freemiusPricingId,
      userEmail: user.email,
      userName: userName,
    };
  }

  async verifyAndActivateLicense(userId: string, dto: VerifyLicenseDto): Promise<Subscription> {
    this.logger.log(`Verifying license for user ${userId}`);
    const license = await this.freemiusService.verifyLicense(dto.licenseKey);
    const tier = await this.freemiusService.mapFreemiusPlanToTier(license.plan_id);

    const start = new Date();
    const end = license.expiration === 'lifetime'
      ? new Date('2099-12-31T23:59:59.000Z')
      : new Date(license.expiration);

    let subscription = await this.subscriptionsRepository.findOne({
      where: { userId, currentPeriodEnd: MoreThan(new Date()) },
      relations: ['tier'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription) {
      subscription = this.subscriptionsRepository.create({
        userId,
        tierId: tier.id,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        status: SubscriptionStatus.ACTIVE,
      });
    }

    subscription.tierId = tier.id;
    subscription.tier = tier; // Update relation object, not just FK
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.currentPeriodStart = start;
    subscription.currentPeriodEnd = end;
    subscription.cancelledAt = null;
    subscription.pendingTierId = null;
    subscription.freemiusLicenseId = license.id;
    subscription.freemiusPlanId = license.plan_id;
    subscription.freemiusUserId = license.user_id;
    subscription.freemiusInstallId = license.install_id || subscription.freemiusInstallId || null;
    subscription.licenseKey = dto.licenseKey;

    const saved = await this.subscriptionsRepository.save(subscription);
    await this.resetUsageForPeriod(userId, start, end, tier.videosPerMonth);
    this.logger.log(`License activated for user ${userId} on tier ${tier.name}`);

    return this.subscriptionsRepository.findOneOrFail({
      where: { id: saved.id },
      relations: ['tier'],
    });
  }

  /**
   * Activate subscription from Freemius checkout purchase data.
   * Called by frontend after purchaseCompleted callback fires.
   * 
   * The Freemius checkout SDK only returns license_id (not the license key),
   * so we fetch the full license from Freemius API using the license_id.
   */
  async activatePurchaseFromCheckout(userId: string, dto: ActivatePurchaseDto): Promise<Subscription> {
    try{
    this.logger.log(`Activating purchase for user ${userId} - license_id=${dto.licenseId}, plan_id=${dto.planId}`);

    // 1. Fetch the full license from Freemius API using license_id
    const license = await this.freemiusService.getLicenseById(dto.licenseId);
    
    // 2. Look up the internal tier by Freemius plan ID
    const tier = await this.freemiusService.mapFreemiusPlanToTier(license.plan_id);

    // 3. Set expiration date based on license data
    const expirationDate = license.expiration === 'lifetime'
      ? new Date('2099-12-31T23:59:59.000Z')
      : new Date(license.expiration);
    
    this.logger.log(`License ${dto.licenseId} expires at: ${expirationDate.toISOString()}`);

    const start = new Date();

    // 3. Find or create subscription
    let subscription = await this.subscriptionsRepository.findOne({
      where: { userId },
      relations: ['tier'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription) {
      subscription = this.subscriptionsRepository.create({
        userId,
        tierId: tier.id,
        currentPeriodStart: start,
        currentPeriodEnd: expirationDate,
        status: SubscriptionStatus.ACTIVE,
      });
    }

    // 4. Update subscription with Freemius data
    // CRITICAL: Must set both tierId AND tier relation for TypeORM to persist correctly
    subscription.tierId = tier.id;
    subscription.tier = tier; // TypeORM prioritizes loaded relation over FK
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.currentPeriodStart = start;
    subscription.currentPeriodEnd = expirationDate;
    subscription.cancelledAt = null;
    subscription.pendingTierId = null;
    subscription.freemiusLicenseId = license.id;
    subscription.freemiusPlanId = license.plan_id;
    subscription.freemiusUserId = license.user_id;
    subscription.freemiusInstallId = license.install_id || subscription.freemiusInstallId || null;
    subscription.licenseKey = dto.licenseKey || null;

    const saved = await this.subscriptionsRepository.save(subscription);
    await this.resetUsageForPeriod(userId, start, expirationDate, tier.videosPerMonth);
    this.logger.log(`Purchase activated for user ${userId} on tier ${tier.name} (license_id=${license.id})`);

    return this.subscriptionsRepository.findOneOrFail({
      where: { id: saved.id },
      relations: ['tier'],
    });
  } catch (error) {
    console.log('Error activating purchase:', error);
    throw error;
  }
  }

  async syncSubscriptionFromFreemius(userId: string): Promise<Subscription> {
    this.logger.log(`Syncing subscription from Freemius for user ${userId}`);
    const subscription = await this.subscriptionsRepository.findOne({
      where: { userId },
      relations: ['tier'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription || !subscription.freemiusInstallId) {
      throw new NotFoundException('No Freemius install linked to this user');
    }

    const remoteSub = await this.freemiusService.getSubscription(subscription.freemiusInstallId);
    const tier = await this.freemiusService.mapFreemiusPlanToTier(remoteSub.plan_id);

    subscription.tierId = tier.id;
    subscription.tier = tier; // Update relation object
    subscription.freemiusPlanId = remoteSub.plan_id;
    subscription.freemiusLicenseId = remoteSub.license_id;
    subscription.freemiusUserId = remoteSub.user_id;
    subscription.freemiusInstallId = remoteSub.install_id;
    subscription.currentPeriodEnd = new Date(remoteSub.next_payment);
    subscription.status = remoteSub.is_active
      ? SubscriptionStatus.ACTIVE
      : SubscriptionStatus.PAST_DUE;

    const saved = await this.subscriptionsRepository.save(subscription);

    return this.subscriptionsRepository.findOneOrFail({
      where: { id: saved.id },
      relations: ['tier'],
    });
  }

  async handleWebhookEvent(event: FreemiusWebhookEvent): Promise<void> {
    this.logger.log(`Handling Freemius webhook event: ${event.type} (user_id=${event.user_id}, license_id=${event.license_id}, install_id=${event.install_id})`);
    let subscription = null as Subscription | null;

    // Try to find matching subscription by install_id first
    if (event.install_id) {
      subscription = await this.subscriptionsRepository.findOne({
        where: { freemiusInstallId: event.install_id },
        relations: ['tier'],
      });
    }

    // Try by Freemius user_id
    if (!subscription && event.user_id) {
      subscription = await this.subscriptionsRepository.findOne({
        where: { freemiusUserId: event.user_id },
        relations: ['tier'],
      });
    }

    // Try by license_id
    if (!subscription && event.license_id) {
      subscription = await this.subscriptionsRepository.findOne({
        where: { freemiusLicenseId: event.license_id },
        relations: ['tier'],
      });
    }

    if (!subscription) {
      this.logger.warn(`No subscription found for webhook event ${event.type} (user_id=${event.user_id}, license_id=${event.license_id})`);
      return;
    }

    if (event.plan_id) {
      const tier = await this.freemiusService.mapFreemiusPlanToTier(event.plan_id);
      subscription.tierId = tier.id;
      subscription.tier = tier; // Update relation, not just FK
    }

    if (event.license_id) {
      subscription.freemiusLicenseId = event.license_id;
    }

    if (event.user_id) {
      subscription.freemiusUserId = event.user_id;
    }

    if (event.install_id) {
      subscription.freemiusInstallId = event.install_id;
    }

    switch (event.type) {
      case 'license.cancelled':
      case 'subscription.cancelled':
        subscription.status = SubscriptionStatus.CANCELLED;
        subscription.cancelledAt = new Date();
        break;
      case 'license.expired':
        subscription.status = SubscriptionStatus.EXPIRED;
        break;
      case 'payment.failed':
        subscription.status = SubscriptionStatus.PAST_DUE;
        break;
      case 'payment.completed':
      case 'install.installed':
      case 'install.upgraded':
      case 'install.downgraded':
      case 'license.created':
      default:
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.cancelledAt = null;
        break;
    }

    await this.subscriptionsRepository.save(subscription);
    this.logger.log(`Webhook ${event.type} applied to subscription ${subscription.id}`);
  }

  async getPaymentStatus(userId: string): Promise<Subscription | null> {
    return this.subscriptionsRepository.findOne({
      where: { userId, currentPeriodEnd: MoreThan(new Date()) },
      relations: ['tier'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Create or update usage for a new billing period.
   * IMPORTANT: This method accumulates remaining quota from the previous period.
   * If user had 5 videos remaining and buys a 20-video plan, they get 25 total.
   */
  private async resetUsageForPeriod(
    userId: string,
    start: Date,
    end: Date,
    videosLimit: number,
  ): Promise<void> {
    // Get the current/previous usage record to check for remaining quota
    const now = new Date();
    const previousUsage = await this.usageRepository
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
          `User ${userId} had ${videosRemaining} videos remaining from previous plan. ` +
          `Adding to new quota of ${videosLimit} for total of ${videosLimit + bonusVideos}`
        );
      }
    }

    // Create new usage record with accumulated quota
    // New limit = base plan limit + remaining videos from previous plan
    const totalVideosLimit = videosLimit === -1 ? -1 : videosLimit + bonusVideos;

    const usage = this.usageRepository.create({
      userId,
      billingPeriodStart: start,
      billingPeriodEnd: end,
      videosGenerated: 0,
      videosLimit: totalVideosLimit,
    });

    await this.usageRepository.save(usage);
    
    if (bonusVideos > 0) {
      this.logger.log(
        `✨ Bonus applied! User ${userId} now has ${totalVideosLimit} total videos ` +
        `(${videosLimit} from new plan + ${bonusVideos} carried over)`
      );
    }
  }

  /**
   * Get Freemius checkout configuration for credit package purchase
   */
  async getCreditCheckoutConfig(userId: string, packageId: string): Promise<CheckoutConfigDto> {
    const [user, pkg] = await Promise.all([
      this.usersRepository.findOne({ where: { id: userId } }),
      this.creditPackagesRepository.findOne({ where: { id: packageId, isActive: true } }),
    ]);

    if (!user || !pkg) {
      throw new NotFoundException('User or credit package not found');
    }

    if (!pkg.freemiusAddonId || !pkg.freemiusPricingId) {
      throw new NotFoundException('Freemius mapping missing for selected credit package');
    }

    const config = this.freemiusService.getCheckoutConfig();
    const result: any = {
      ...config,
      planId: pkg.freemiusAddonId,
      pricingId: pkg.freemiusPricingId,
      userEmail: user.email,
      userName: user.email.split('@')[0],
      successUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?purchase=success`,
      cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?purchase=cancelled`,
    };
    return result;
  }

  /**
   * Complete credit purchase after successful payment
   */
  async completeCreditPurchase(
    userId: string,
    packageId: string,
    paymentId: string,
    paidAmount: string,
  ) {
    const pkg = await this.creditPackagesRepository.findOne({
      where: { id: packageId, isActive: true },
    });

    if (!pkg) {
      throw new NotFoundException('Credit package not found');
    }

    // Use CreditsService to add credits and create transaction
    const transaction = await this.creditsService.purchaseCredits(userId, packageId, {
      paymentGateway: 'freemius',
      paymentId,
      paidAmount,
    });

    this.logger.log(
      `Credit purchase completed for user ${userId}: ${pkg.totalCredits} credits for $${paidAmount}`,
    );

    return {
      success: true,
      creditsAdded: pkg.totalCredits,
      transaction,
    };
  }

  /**
   * Get Freemius sandbox parameters for testing checkout
   * IMPORTANT: Only use in development/sandbox mode
   */
  async getFreemiusSandboxParams(): Promise<any> {
    return this.freemiusService.getSandboxParams();
  }
}

