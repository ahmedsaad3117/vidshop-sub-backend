import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Subscription,
  SubscriptionTier,
  UsageRecord,
  User,
  VideoGeneration,
} from '../entities';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UsageRecord,
      Subscription,
      SubscriptionTier,
      User,
      VideoGeneration,
    ]),
  ],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
