import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoGeneration, VideoStatus, UsageRecord } from '../entities';
import { RunwayVideoService } from '../runway-video/runway-video.service';
import { TokenService } from './token.service';
import { ConfigService } from '@nestjs/config';
import { VideoNotificationsGateway } from './video-notifications.gateway';

@Injectable()
export class VideoPollingService {
  private readonly logger = new Logger(VideoPollingService.name);
  private readonly tokenCostFallback: number;
  private isPolling = false;

  constructor(
    @InjectRepository(VideoGeneration)
    private readonly videoRepository: Repository<VideoGeneration>,
    @InjectRepository(UsageRecord)
    private readonly usageRepository: Repository<UsageRecord>,
    private readonly runwayVideoService: RunwayVideoService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    private readonly notificationsGateway: VideoNotificationsGateway,
  ) {
    this.tokenCostFallback = Number(
      this.configService.get<string>('VIDEO_TOKEN_COST_FALLBACK', '1000'),
    );
  }

  /**
   * Poll for video status updates every 15 seconds
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async pollVideoStatus() {
    // Prevent overlapping cron jobs
    if (this.isPolling) {
      this.logger.debug('Polling already in progress, skipping...');
      return;
    }

    this.isPolling = true;

    try {
      // Find all videos that are currently processing and have a provider task ID
      const processingVideos = await this.videoRepository.find({
        where: {
          status: VideoStatus.PROCESSING,
        },
        relations: ['user'],
      });

      if (processingVideos.length === 0) {
        this.logger.debug('No videos currently processing');
        return;
      }

      this.logger.log(`Checking status for ${processingVideos.length} processing video(s)`);

      for (const video of processingVideos) {
        await this.checkAndUpdateVideo(video);
      }
    } catch (error) {
      this.logger.error('Error in polling service', error);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Check individual video status and update database
   */
  private async checkAndUpdateVideo(video: VideoGeneration): Promise<void> {
    if (!video.providerTaskId) {
      this.logger.warn(`Video ${video.id} has no providerTaskId, marking as failed`);
      video.status = VideoStatus.FAILED;
      video.errorMessage = 'No provider task ID found';
      video.completedAt = new Date();
      await this.videoRepository.save(video);
      return;
    }

    try {
      const taskStatus = await this.runwayVideoService.checkTaskStatus(video.providerTaskId);

      switch (taskStatus.status) {
        case 'succeeded':
          await this.handleSuccessfulVideo(video, taskStatus.videoUrl!);
          break;

        case 'failed':
          await this.handleFailedVideo(video, taskStatus.errorMessage || 'Unknown error');
          break;

        case 'running':
        case 'pending':
          // Still processing, no action needed
          this.logger.debug(`Video ${video.id} still processing (${taskStatus.status})`);
          break;
      }
    } catch (error) {
      this.logger.error(`Error checking video ${video.id}`, error);
      // Don't mark as failed yet, will retry on next poll
    }
  }

  /**
   * Handle successful video generation
   */
  private async handleSuccessfulVideo(video: VideoGeneration, videoUrl: string): Promise<void> {
    try {
      // Deduct tokens from user balance
      await this.tokenService.deductTokens(video.userId, this.tokenCostFallback, video.id);

      video.status = VideoStatus.COMPLETED;
      video.videoUrl = videoUrl;
      video.tokensUsed = this.tokenCostFallback;
      video.completedAt = new Date();
      video.errorMessage = null;
      await this.videoRepository.save(video);

      // Update usage record
      const usageRecord = await this.usageRepository.findOne({
        where: { userId: video.userId },
      });

      if (usageRecord) {
        usageRecord.videosGenerated += 1;
        await this.usageRepository.save(usageRecord);
      }

      this.logger.log(`✅ Video ${video.id} completed successfully`);
      
      // Send WebSocket notification to frontend
      this.notificationsGateway.notifyVideoCompleted(video);
    } catch (error) {
      this.logger.error(`Failed to finalize video ${video.id}`, error);
      video.status = VideoStatus.FAILED;
      video.errorMessage = error instanceof Error ? error.message : 'Failed to finalize video';
      video.completedAt = new Date();
      await this.videoRepository.save(video);
      
      // Send failure notification
      this.notificationsGateway.notifyVideoFailed(video);
    }
  }

  /**
   * Handle failed video generation
   */
  private async handleFailedVideo(video: VideoGeneration, errorMessage: string): Promise<void> {
    
    // Send failure notification to frontend
    this.notificationsGateway.notifyVideoFailed(video);
    video.status = VideoStatus.FAILED;
    video.errorMessage = errorMessage;
    video.completedAt = new Date();
    await this.videoRepository.save(video);

    this.logger.error(`❌ Video ${video.id} failed: ${errorMessage}`);
  }

  /**
   * Manual trigger for testing (can be called via endpoint)
   */
  async triggerPoll(): Promise<void> {
    this.logger.log('Manual poll triggered');
    await this.pollVideoStatus();
  }
}
