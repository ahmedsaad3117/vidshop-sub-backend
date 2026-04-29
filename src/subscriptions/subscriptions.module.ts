import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditsModule } from '../credits/credits.module';
import {
  Subscription,
  SubscriptionTier,
  UsageRecord,
  User,
} from '../entities';
import { TiersController } from './tiers.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { TiersService } from './tiers.service';

@Module({
  imports: [CreditsModule, TypeOrmModule.forFeature([SubscriptionTier, Subscription, UsageRecord, User])],
  controllers: [TiersController, SubscriptionsController],
  providers: [TiersService, SubscriptionsService],
  exports: [TiersService, SubscriptionsService],
})
export class SubscriptionsModule {}
