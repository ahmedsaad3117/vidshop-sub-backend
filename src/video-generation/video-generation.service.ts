import {
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PromptTier,
  Subscription,
  SubscriptionStatus,
  UsageRecord,
  VideoGeneration,
  VideoStatus,
} from '../entities';
import { PromptsService } from '../prompts/prompts.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { GenerateVideoDto } from './dto/generate-video.dto';
import { VideoListQueryDto } from './dto/video-list-query.dto';
import { WpVideoRequestDto } from './dto/wp-video-request.dto';
import { TokenService } from './token.service';
import { VideoProviderService } from './video-provider.service';

@Injectable()
export class VideoGenerationService {
  private readonly logger = new Logger(VideoGenerationService.name);
  private readonly tokenCostFallback: number;

  constructor(
    @InjectRepository(VideoGeneration)
    private readonly videoRepository: Repository<VideoGeneration>,
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(UsageRecord)
    private readonly usageRepository: Repository<UsageRecord>,
    private readonly configService: ConfigService,
    private readonly promptsService: PromptsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly videoProviderService: VideoProviderService,
    private readonly tokenService: TokenService,
  ) {
    this.tokenCostFallback = Number(
      this.configService.get<string>('VIDEO_TOKEN_COST_FALLBACK', '1000'),
    );

    if (!Number.isFinite(this.tokenCostFallback) || this.tokenCostFallback <= 0) {
      throw new InternalServerErrorException('VIDEO_TOKEN_COST_FALLBACK must be a positive number');
    }
  }

  async generateVideo(
    userId: string,
    dto: GenerateVideoDto,
    promptImageOverride?: string,
  ): Promise<VideoGeneration> {
    this.logger.log(`Starting video generation for user ${userId} and product '${dto.productTitle}'`);

    if (!dto.templateId && !dto.customPrompt) {
      throw new BadRequestException('Either templateId or customPrompt is required');
    }

    if (dto.templateId && dto.customPrompt) {
      throw new BadRequestException('templateId and customPrompt cannot be used together');
    }

    const subscription = await this.subscriptionsRepository.findOne({
      where: { userId },
      relations: ['tier'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription || subscription.status === SubscriptionStatus.EXPIRED) {
      throw new ForbiddenException('No active subscription found');
    }

    const usageRecord = await this.subscriptionsService.checkAndResetBillingCycle(userId);

    if (usageRecord.videosLimit !== -1 && usageRecord.videosGenerated >= usageRecord.videosLimit) {
      throw new ForbiddenException('Monthly video generation limit reached');
    }

    if (dto.templateId) {
      const template = await this.promptsService.getTemplateById(dto.templateId, userId);
      if (template.tier === PromptTier.PREMIUM && subscription.tier.name === 'free') {
        throw new ForbiddenException('Premium template access required');
      }
    }

    const resolvedPrompt = await this.promptsService.resolvePrompt(
      dto.templateId ?? null,
      dto.customPrompt ?? null,
      dto.productTitle,
      dto.productDescription,
    );

    // Check token balance before proceeding
    const currentBalance = await this.tokenService.getBalance(userId);
    if (currentBalance !== -1 && currentBalance < this.tokenCostFallback) {
      throw new ForbiddenException(
        `Insufficient tokens. Required: ~${this.tokenCostFallback}, Available: ${currentBalance}`,
      );
    }

    let record = this.videoRepository.create({
      userId,
      templateId: dto.templateId ?? null,
      productTitle: dto.productTitle,
      productDescription: dto.productDescription,
      productImageUrl: dto.productImageUrl,
      category: null,
      promptUsed: resolvedPrompt,
      customPrompt: dto.customPrompt ?? null,
      status: VideoStatus.PENDING,
      videoUrl: null,
      providerTaskId: null,
      tokensUsed: null,
      errorMessage: null,
      processingStartedAt: null,
      completedAt: null,
    });

    record = await this.videoRepository.save(record);

    // Create video task asynchronously (non-blocking)
    try {
      const taskResult = await this.videoProviderService.createVideoTask({
        promptText: resolvedPrompt,
        promptImage: promptImageOverride ?? dto.productImageUrl!,
      });

      // Update record with task ID and processing status
      record.status = VideoStatus.PROCESSING;
      record.providerTaskId = taskResult.taskId;
      record.processingStartedAt = new Date();
      record = await this.videoRepository.save(record);

      this.logger.log(`Video task created: ${record.id}, Runway task: ${taskResult.taskId}`);
      
      // Return immediately - polling service will update when complete
      return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create video task';
      this.logger.error(`Video task creation failed for ${record.id}: ${message}`);

      record.status = VideoStatus.FAILED;
      record.errorMessage = message;
      record.completedAt = new Date();
      return this.videoRepository.save(record);
    }
  }

  async getUserVideos(
    userId: string,
    query: VideoListQueryDto,
  ): Promise<{ data: VideoGeneration[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.videoRepository
      .createQueryBuilder('video')
      .leftJoinAndSelect('video.template', 'template')
      .where('video.userId = :userId', { userId });

    if (query.status) {
      qb.andWhere('video.status = :status', { status: query.status });
    }

    const [data, total] = await qb
      .orderBy('video.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async getVideoById(userId: string, videoId: string): Promise<VideoGeneration> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
      relations: ['template'],
    });

    if (!video) {
      throw new NotFoundException('Video generation record not found');
    }

    if (video.userId !== userId) {
      throw new ForbiddenException('Access denied for this video record');
    }

    return video;
  }

  /**
   * Generate video from WordPress plugin request
   * Handles WP plugin format {title, description, image, category}
    * and transforms it into the internal provider generation payload
   */
  async generateFromWpPlugin(
    userId: string,
    dto: WpVideoRequestDto,
    promptImageOverride?: string,
  ): Promise<VideoGeneration> {
    this.logger.log(
      `Starting WP plugin video generation for user ${userId} and title '${dto.title}'`,
    );

    const subscription = await this.subscriptionsRepository.findOne({
      where: { userId },
      relations: ['tier'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription || subscription.status === SubscriptionStatus.EXPIRED) {
      throw new ForbiddenException('No active subscription found');
    }

    const usageRecord = await this.subscriptionsService.checkAndResetBillingCycle(userId);

    if (usageRecord.videosLimit !== -1 && usageRecord.videosGenerated >= usageRecord.videosLimit) {
      throw new ForbiddenException('Monthly video generation limit reached');
    }

    // Check token balance
    const currentBalance = await this.tokenService.getBalance(userId);
    if (currentBalance !== -1 && currentBalance < this.tokenCostFallback) {
      throw new ForbiddenException(
        `Insufficient tokens. Required: ~${this.tokenCostFallback}, Available: ${currentBalance}`,
      );
    }

    // Generate prompt internally from WP plugin data
    const generatedPrompt = this.generatePromptFromWpData(
      dto.title,
      dto.description,
      dto.category,
    );

    let record = this.videoRepository.create({
      userId,
      templateId: null,
      productTitle: dto.title,
      productDescription: dto.description,
      productImageUrl: dto.image,
      category: dto.category,
      promptUsed: generatedPrompt,
      customPrompt: null,
      status: VideoStatus.PENDING,
      videoUrl: null,
      providerTaskId: null,
      tokensUsed: null,
      errorMessage: null,
      processingStartedAt: null,
      completedAt: null,
    });

    record = await this.videoRepository.save(record);

    // Create video task asynchronously (non-blocking)
    try {
      const taskResult = await this.videoProviderService.createVideoTask({
        promptText: generatedPrompt,
        promptImage: promptImageOverride ?? dto.image!,
      });

      // Update record with task ID and processing status
      record.status = VideoStatus.PROCESSING;
      record.providerTaskId = taskResult.taskId;
      record.processingStartedAt = new Date();
      record = await this.videoRepository.save(record);

      this.logger.log(
        `WP plugin video task created: ${record.id}, Runway task: ${taskResult.taskId}`,
      );

      // Return immediately - polling service will update when complete
      return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create video task';
      this.logger.error(`WP plugin video task creation failed for ${record.id}: ${message}`);

      record.status = VideoStatus.FAILED;
      record.errorMessage = message;
      record.completedAt = new Date();
      return this.videoRepository.save(record);
    }
  }

  /**
   * Generate prompt from WordPress plugin data
   * Transforms {title, description, category} into optimized prompt for n8n
   */
  private generatePromptFromWpData(
    title: string,
    description: string,
    category: string,
  ): string {
    // Generate prompt based on category and content
    const categoryPrompts: Record<string, string> = {
      product: `Create an engaging product showcase video for "${title}". ${description}. Focus on highlighting key features and benefits with dynamic transitions.`,
      marketing: `Generate a promotional marketing video for "${title}". ${description}. Use attention-grabbing visuals and compelling messaging.`,
      explainer: `Produce an explainer video about "${title}". ${description}. Make it clear, concise, and easy to understand.`,
      demo: `Create a product demonstration video for "${title}". ${description}. Show practical usage and real-world applications.`,
      testimonial: `Generate a testimonial-style video for "${title}". ${description}. Build trust and credibility.`,
    };

    const categoryLower = category.toLowerCase();
    return (
      categoryPrompts[categoryLower] ||
      `Create a professional video about "${title}". ${description}. Make it engaging and visually appealing.`
    );
  }
}
