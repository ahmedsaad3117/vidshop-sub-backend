import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { Freemius } from '@freemius/sdk';
import { SubscriptionTier } from '../entities';
import {
  FreemiusLicenseResponse,
  FreemiusPlanResponse,
  FreemiusSubscriptionResponse,
  FreemiusUserResponse,
} from './types/freemius.types';

@Injectable()
export class FreemiusService {
  private readonly logger = new Logger(FreemiusService.name);
  private readonly pluginId: string;
  private readonly secretKey: string;
  private readonly apiKey: string;
  private readonly publicKey: string;
  private readonly webhookSecret: string;
  private readonly apiBase = 'https://api.freemius.com/v1';
  private readonly freemiusSDK: Freemius | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectRepository(SubscriptionTier)
    private readonly tiersRepository: Repository<SubscriptionTier>,
  ) {
    this.pluginId = this.configService.get<string>('FREEMIUS_PLUGIN_ID', '');
    this.secretKey = this.configService.get<string>('FREEMIUS_SECRET_KEY', '');
    this.apiKey = this.configService.get<string>('FREEMIUS_API_KEY', '');
    this.publicKey = this.configService.get<string>('FREEMIUS_PUBLIC_KEY', '');
    this.webhookSecret = this.configService.get<string>('FREEMIUS_WEBHOOK_SECRET', '');

    if (!this.pluginId || !this.secretKey || !this.publicKey || !this.apiKey) {
      this.logger.warn('☁️ Freemius not configured - missing credentials');
    } else {
      // Initialize Freemius SDK
      try {
        this.freemiusSDK = new Freemius({
          productId: this.pluginId,
          apiKey: this.apiKey,
          secretKey: this.secretKey,
          publicKey: this.publicKey,
        });
        this.logger.log('✅ Freemius SDK initialized successfully');
      } catch (error) {
        this.logger.error('❌ Failed to initialize Freemius SDK:', error);
      }
      this.logger.log('✅ Freemius service initialized successfully');
    }
  }

  private getAuthHeaders(method: string, path: string): Record<string, string> {
    const timestamp = Date.now().toString();
    const payload = `${method.toUpperCase()}|${path}|${timestamp}`;
    const signature = createHmac('sha256', this.secretKey || 'missing-secret')
      .update(payload)
      .digest('hex');

    return {
      Authorization: `Bearer ${this.apiKey}`,
      'X-Freemius-Timestamp': timestamp,
      'X-Freemius-Signature': signature,
    };
  }

  private ensureConfigured(): void {
    if (!this.pluginId || !this.secretKey || !this.publicKey || !this.apiKey) {
      throw new ServiceUnavailableException('Freemius is not configured');
    }
  }

  /**
   * Get checkout configuration for frontend
   */
  getCheckoutConfig(): { pluginId: string; publicKey: string } {
    this.ensureConfigured();
    return { pluginId: this.pluginId, publicKey: this.publicKey };
  }

  /**
   * Verify license key
   */
  async verifyLicense(licenseKey: string): Promise<FreemiusLicenseResponse> {
    this.ensureConfigured();

    const path = `/plugins/${this.pluginId}/licenses.json`;
    const response = await firstValueFrom(
      this.httpService.get<{ license: FreemiusLicenseResponse }>(`${this.apiBase}${path}`, {
        headers: this.getAuthHeaders('GET', path),
        params: { key: licenseKey },
      }),
    );

    const license = response.data?.license;
    if (!license) {
      throw new BadRequestException('Invalid license key');
    }

    return license;
  }

  /**
   * Get license by Freemius license ID using the official SDK
   * Used when checkout only returns license_id (no key)
   * 
   * This follows the official Freemius SDK integration pattern:
   * const purchase = await freemius.purchase.retrievePurchase(licenseId);
   */
  async getLicenseById(licenseId: string): Promise<FreemiusLicenseResponse> {
    this.ensureConfigured();

    if (!this.freemiusSDK) {
      throw new ServiceUnavailableException('Freemius SDK not initialized');
    }

    this.logger.log(`Fetching purchase by license ID: ${licenseId}`);

    try {
      // Use the official SDK method to retrieve purchase
      const purchase = await this.freemiusSDK.purchase.retrievePurchase(licenseId);

      if (!purchase) {
        throw new BadRequestException(`Purchase not found for license: ${licenseId}`);
      }

      // Map SDK PurchaseInfo to our FreemiusLicenseResponse format
      const license: FreemiusLicenseResponse = {
        id: purchase.licenseId,
        plugin_id: this.pluginId,
        user_id: purchase.userId,
        plan_id: purchase.planId,
        pricing_id: purchase.pricingId,
        quota: purchase.quota,
        activated: 0, // Not provided by SDK
        activated_local: 0, // Not provided by SDK
        expiration: purchase.expiration ? purchase.expiration.toISOString() : 'lifetime',
        is_cancelled: purchase.canceled,
        is_active: purchase.isActive,
        secret_key: '', // Not exposed by SDK for security
        install_id: undefined, // Not directly available in PurchaseInfo
      };

      this.logger.log(
        `✅ Purchase retrieved successfully - ` +
        `license_id=${license.id}, plan_id=${license.plan_id}, ` +
        `expiration=${license.expiration}, active=${license.is_active}`
      );

      return license;
    } catch (error) {
      this.logger.error(`❌ Failed to retrieve purchase for license ${licenseId}:`, error);
      throw new BadRequestException(
        `Failed to retrieve purchase: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(installId: string): Promise<FreemiusSubscriptionResponse> {
    this.ensureConfigured();

    const path = `/plugins/${this.pluginId}/installs/${installId}/subscriptions/latest.json`;
    const response = await firstValueFrom(
      this.httpService.get<{ subscription: FreemiusSubscriptionResponse }>(`${this.apiBase}${path}`, {
        headers: this.getAuthHeaders('GET', path),
      }),
    );

    if (!response.data?.subscription) {
      throw new NotFoundException('Freemius subscription not found');
    }

    return response.data.subscription;
  }

  /**
   * Get plan details
   */
  async getPlan(planId: string): Promise<FreemiusPlanResponse> {
    this.ensureConfigured();

    const path = `/plugins/${this.pluginId}/plans/${planId}.json`;
    const response = await firstValueFrom(
      this.httpService.get<{ plan: FreemiusPlanResponse }>(`${this.apiBase}${path}`, {
        headers: this.getAuthHeaders('GET', path),
      }),
    );

    if (!response.data?.plan) {
      throw new NotFoundException('Freemius plan not found');
    }

    return response.data.plan;
  }

  /**
   * Get user details
   */
  async getUser(userId: string): Promise<FreemiusUserResponse> {
    this.ensureConfigured();

    const path = `/users/${userId}.json`;
    const response = await firstValueFrom(
      this.httpService.get<{ user: FreemiusUserResponse }>(`${this.apiBase}${path}`, {
        headers: this.getAuthHeaders('GET', path),
      }),
    );

    if (!response.data?.user) {
      throw new NotFoundException('Freemius user not found');
    }

    return response.data.user;
  }

  /**
   * Verify webhook signature using HMAC
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret || !signature) {
      return false;
    }

    const expected = createHmac('sha256', this.webhookSecret).update(payload).digest('hex');
    return expected === signature;
  }

  /**
   * Map Freemius plan ID to internal subscription tier
   */
  async mapFreemiusPlanToTier(freemiusPlanId: string): Promise<SubscriptionTier> {
    const tier = await this.tiersRepository.findOne({
      where: { freemiusPlanId, isActive: true },
    });

    if (!tier) {
      throw new NotFoundException('No matching internal tier for Freemius plan');
    }

    return tier;
  }

  /**
   * Get sandbox parameters for Freemius checkout (for testing)
   * IMPORTANT: Only use in development/sandbox mode
   */
  async getSandboxParams(): Promise<any> {
    if (!this.freemiusSDK) {
      this.logger.warn('Freemius SDK not initialized, returning null for sandbox params');
      return null;
    }

    try {
      // Get sandbox parameters from Freemius SDK
      const sandboxParams = await this.freemiusSDK.checkout.getSandboxParams();
      
      this.logger.log('🧪 Sandbox params generated for testing mode');
      // sandboxParams is already the options object { ctx, token }
      return sandboxParams;
    } catch (error) {
      this.logger.error('Failed to get sandbox params:', error);
      // In production or if sandbox fails, return null (checkout will work normally)
      return null;
    }
  }
}
