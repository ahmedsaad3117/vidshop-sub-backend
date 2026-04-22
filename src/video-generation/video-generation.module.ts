import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription, UsageRecord, User, VideoGeneration } from '../entities';
import { PromptsModule } from '../prompts/prompts.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CreditsModule } from '../credits/credits.module';
import { ExternalVideoApiService } from './external-video-api.service';
import { TokenService } from './token.service';
import { VideoGenerationController } from './video-generation.controller';
import { VideoGenerationService } from './video-generation.service';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([VideoGeneration, Subscription, UsageRecord, User]),
    PromptsModule,
    SubscriptionsModule,
    CreditsModule,
  ],
  controllers: [VideoGenerationController],
  providers: [VideoGenerationService, ExternalVideoApiService, TokenService],
  exports: [VideoGenerationService, TokenService],
})
export class VideoGenerationModule {}
