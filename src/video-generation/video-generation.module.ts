import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Subscription, UsageRecord, User, VideoGeneration } from '../entities';
import { PromptsModule } from '../prompts/prompts.module';
import { RunwayVideoModule } from '../runway-video/runway-video.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CreditsModule } from '../credits/credits.module';
import { ImageStorageService } from './image-storage.service';
import { LegacyVideoApiService } from './legacy-video-api.service';
import { TokenService } from './token.service';
import { VideoGenerationController } from './video-generation.controller';
import { VideoProviderService } from './video-provider.service';
import { VideoGenerationService } from './video-generation.service';
import { VideoPollingService } from './video-polling.service';
import { VideoNotificationsGateway } from './video-notifications.gateway';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([VideoGeneration, Subscription, UsageRecord, User]),
    PromptsModule,
    SubscriptionsModule,
    CreditsModule,
    RunwayVideoModule,
  ],
  controllers: [VideoGenerationController],
  providers: [
    VideoGenerationService,
    VideoProviderService,
    LegacyVideoApiService,
    AdminGuard,
    TokenService,
    ImageStorageService,
    VideoPollingService,
    VideoNotificationsGateway,
  ],
  exports: [VideoGenerationService, TokenService],
})
export class VideoGenerationModule {}
