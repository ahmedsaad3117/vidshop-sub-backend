import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User } from '../entities';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChangeSubscriptionDto } from './dto/change-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('me')
  async getMySubscription(@CurrentUser() user: User) {
    return this.subscriptionsService.getUserSubscription(user.id);
  }

  @Post('change')
  async changeSubscription(
    @CurrentUser() user: User,
    @Body() dto: ChangeSubscriptionDto,
  ) {
    return this.subscriptionsService.changeSubscription(user.id, dto);
  }

  @Post('cancel')
  async cancelSubscription(@CurrentUser() user: User) {
    return this.subscriptionsService.cancelSubscription(user.id);
  }

  @Post('reactivate')
  async reactivateSubscription(@CurrentUser() user: User) {
    return this.subscriptionsService.reactivateSubscription(user.id);
  }
}
