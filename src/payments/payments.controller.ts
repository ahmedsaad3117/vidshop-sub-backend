import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../entities';
import { ActivatePurchaseDto } from './dto/activate-purchase.dto';
import { VerifyLicenseDto } from './dto/verify-license.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('checkout-config/:tierId')
  getCheckoutConfig(@CurrentUser() user: User, @Param('tierId') tierId: string) {
    return this.paymentsService.getCheckoutConfig(user.id, tierId);
  }

  /**
   * POST /payments/activate-purchase
   * Activate subscription using purchase data from Freemius checkout.
   * Called by frontend after purchaseCompleted callback fires.
   */
  @Post('activate-purchase')
  activatePurchase(@CurrentUser() user: User, @Body() dto: ActivatePurchaseDto) {
    return this.paymentsService.activatePurchaseFromCheckout(user.id, dto);
  }

  @Post('verify-license')
  verifyLicense(@CurrentUser() user: User, @Body() dto: VerifyLicenseDto) {
    return this.paymentsService.verifyAndActivateLicense(user.id, dto);
  }

  @Post('sync')
  sync(@CurrentUser() user: User) {
    return this.paymentsService.syncSubscriptionFromFreemius(user.id);
  }

  @Get('status')
  getStatus(@CurrentUser() user: User) {
    return this.paymentsService.getPaymentStatus(user.id);
  }

  /**
   * GET /payments/credits/checkout-config/:packageId
   * Get Freemius checkout configuration for credit package purchase
   */
  @Get('credits/checkout-config/:packageId')
  getCreditCheckoutConfig(@CurrentUser() user: User, @Param('packageId') packageId: string) {
    return this.paymentsService.getCreditCheckoutConfig(user.id, packageId);
  }

  /**
   * POST /payments/credits/purchase
   * Complete credit purchase (called after successful payment)
   */
  @Post('credits/purchase')
  completeCreditPurchase(
    @CurrentUser() user: User,
    @Body() body: { packageId: string; paymentId: string; paidAmount: string },
  ) {
    return this.paymentsService.completeCreditPurchase(
      user.id,
      body.packageId,
      body.paymentId,
      body.paidAmount,
    );
  }

  /**
   * GET /payments/sandbox-params
   * Get Freemius sandbox parameters for testing checkout
   * IMPORTANT: Remove or disable in production!
   */
  @Get('sandbox-params')
  getSandboxParams() {
    return this.paymentsService.getFreemiusSandboxParams();
  }
}
