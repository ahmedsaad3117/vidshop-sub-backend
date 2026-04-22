import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
import { ExternalVideoApiService } from './external-video-api.service';
import { TokenService } from './token.service';

@Injectable()
export class VideoGenerationService {
  private readonly logger = new Logger(VideoGenerationService.name);

  constructor(
    @InjectRepository(VideoGeneration)
    private readonly videoRepository: Repository<VideoGeneration>,
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(UsageRecord)
    private readonly usageRepository: Repository<UsageRecord>,
    private readonly promptsService: PromptsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly externalVideoApiService: ExternalVideoApiService,
    private readonly tokenService: TokenService,
  ) {}

  async generateVideo(userId: string, dto: GenerateVideoDto): Promise<VideoGeneration> {
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

    if (dto.customPrompt && !subscription.tier.hasCustomPrompts) {
      throw new ForbiddenException('Custom prompts are not available on your current plan');
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
    const estimatedTokens = 1000; // Estimated tokens per video (adjust based on your system)
    if (currentBalance < estimatedTokens) {
      throw new ForbiddenException(
        `Insufficient tokens. Required: ~${estimatedTokens}, Available: ${currentBalance}`,
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
      tokensUsed: null,
      errorMessage: null,
      processingStartedAt: null,
      completedAt: null,
    });

    record = await this.videoRepository.save(record);

    record.status = VideoStatus.PROCESSING;
    record.processingStartedAt = new Date();
    record = await this.videoRepository.save(record);

    try {
      // Generate lora string from product image URL (or use default)
      const lora = this.extractLoraFromImage(dto.productImageUrl);

      const result = await this.externalVideoApiService.generateVideo(
        resolvedPrompt,
        lora,
      );

      // Deduct tokens from user balance
      await this.tokenService.deductTokens(userId, result.usedTokens, record.id);

      record.status = VideoStatus.COMPLETED;
      record.videoUrl = result.videoUrl;
      record.tokensUsed = result.usedTokens;
      record.completedAt = new Date();
      record.errorMessage = null;
      record = await this.videoRepository.save(record);

      usageRecord.videosGenerated += 1;
      await this.usageRepository.save(usageRecord);

      this.logger.log(`Video generated successfully: ${record.id}`);
      return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown generation error';
      this.logger.error(`Video generation failed for ${record.id}: ${message}`);

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
   * and transforms to n8n format {prompt, lora}
   */
  async generateFromWpPlugin(userId: string, dto: WpVideoRequestDto): Promise<VideoGeneration> {
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
    const estimatedTokens = 1000; // Estimated tokens per 8-second video
    if (currentBalance < estimatedTokens) {
      throw new ForbiddenException(
        `Insufficient tokens. Required: ~${estimatedTokens}, Available: ${currentBalance}`,
      );
    }

    // Generate prompt internally from WP plugin data
    const generatedPrompt = this.generatePromptFromWpData(
      dto.title,
      dto.description,
      dto.category,
    );

    const lora = this.extractLoraFromImage(dto.image);

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
      tokensUsed: null,
      errorMessage: null,
      processingStartedAt: null,
      completedAt: null,
    });

    record = await this.videoRepository.save(record);

    record.status = VideoStatus.PROCESSING;
    record.processingStartedAt = new Date();
    record = await this.videoRepository.save(record);

    try {
      const result = await this.externalVideoApiService.generateVideo(
        generatedPrompt,
        lora,
      );

      // Deduct tokens from user balance
      await this.tokenService.deductTokens(userId, result.usedTokens, record.id);

      record.status = VideoStatus.COMPLETED;
      record.videoUrl = result.videoUrl;
      record.tokensUsed = result.usedTokens;
      record.completedAt = new Date();
      record.errorMessage = null;
      record = await this.videoRepository.save(record);

      usageRecord.videosGenerated += 1;
      await this.usageRepository.save(usageRecord);

      this.logger.log(
        `WP plugin video generated successfully: ${record.id}, tokens used: ${result.usedTokens}`,
      );
      return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown generation error';
      this.logger.error(`WP plugin video generation failed for ${record.id}: ${message}`);

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

  /**
   * Extract lora identifier from image URL or use default
   */
  private extractLoraFromImage(imageUrl: string): string {
    // Logic to extract lora from image URL or metadata
    // For now, return default lora string
    // Can be enhanced to analyze image URL patterns or fetch image metadata
    return 'default_lora_v1';
  }
}
