import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreditsService } from './credits.service';

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  /**
   * GET /credits/packages
   * Get all available credit packages
   */
  @Get('packages')
  async getPackages() {
    return this.creditsService.getPackages();
  }

  /**
   * GET /credits/packages/:id
   * Get specific credit package details
   */
  @Get('packages/:id')
  async getPackage(@Param('id') id: string) {
    return this.creditsService.getPackageById(id);
  }

  /**
   * GET /credits/balance
   * Get current user's credit balance
   */
  @Get('balance')
  async getBalance(@Request() req: any) {
    return {
      balance: await this.creditsService.getUserBalance(req.user.userId),
    };
  }

  /**
   * GET /credits/transactions
   * Get transaction history for current user
   */
  @Get('transactions')
  async getTransactions(@Request() req: any) {
    return this.creditsService.getTransactionHistory(req.user.userId);
  }

  /**
   * GET /credits/analytics
   * Get analytics for current user
   */
  @Get('analytics')
  async getAnalytics(@Request() req: any) {
    return this.creditsService.getUserAnalytics(req.user.userId);
  }

  /**
   * POST /credits/bonus
   * Admin endpoint to add bonus credits
   * TODO: Add admin guard
   */
  @Post('bonus')
  async addBonus(
    @Body() body: { userId: string; amount: number; notes: string },
  ) {
    return this.creditsService.addBonusCredits(
      body.userId,
      body.amount,
      body.notes,
    );
  }
}
