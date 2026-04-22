import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Subscription,
  SubscriptionTier,
  UsageRecord,
  User,
} from '../entities';
import { CreditPackage } from '../entities/credit-package.entity';
import { CreditsModule } from '../credits/credits.module';
import { FreemiusWebhookController } from './freemius-webhook.controller';
import { FreemiusService } from './freemius.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([User, Subscription, SubscriptionTier, UsageRecord, CreditPackage]),
    CreditsModule,
  ],
  controllers: [PaymentsController, FreemiusWebhookController],
  providers: [PaymentsService, FreemiusService],
  exports: [PaymentsService, FreemiusService],
})
export class PaymentsModule {}
