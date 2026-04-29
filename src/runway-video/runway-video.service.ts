import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import RunwayML, {
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  TaskFailedError,
} from '@runwayml/sdk';

interface GenerateVideoInput {
  promptText: string;
  promptImage: string;
}

interface GenerateVideoOutput {
  videoUrl: string;
  usedTokens: number;
  providerTaskId: string;
}

interface CreateTaskOutput {
  taskId: string;
}

interface TaskStatusOutput {
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  videoUrl?: string;
  errorMessage?: string;
}

type SupportedRunwayModel = 'gen4.5' | 'gen4_turbo';

@Injectable()
export class RunwayVideoService {
  private readonly logger = new Logger(RunwayVideoService.name);
  private readonly runwayApiKey: string;
  private client: RunwayML | null = null;
  private readonly model: SupportedRunwayModel;
  private readonly ratio: '1280:720' | '720:1280' | '1104:832' | '960:960' | '832:1104' | '1584:672';
  private readonly duration: number;
  private readonly timeoutMs: number;
  private readonly tokenCostFallback: number;

  constructor(private readonly configService: ConfigService) {
    this.runwayApiKey =
      this.configService.get<string>('RUNWAY_API_KEY') ??
      this.configService.get<string>('RUNWAYML_API_SECRET') ??
      '';

    const configuredModel = this.configService.get<string>('RUNWAY_MODEL', 'gen4.5');
    this.model = configuredModel === 'gen4_turbo' ? 'gen4_turbo' : 'gen4.5';

    const configuredRatio = this.configService.get<string>('RUNWAY_RATIO', '720:1280');
    const allowedRatios: Array<
      '1280:720' | '720:1280' | '1104:832' | '960:960' | '832:1104' | '1584:672'
    > = ['1280:720', '720:1280', '1104:832', '960:960', '832:1104', '1584:672'];
    this.ratio = allowedRatios.includes(configuredRatio as (typeof allowedRatios)[number])
      ? (configuredRatio as (typeof allowedRatios)[number])
      : '720:1280';

    this.duration = Number(this.configService.get<string>('RUNWAY_DURATION', '5'));
    this.timeoutMs = Number(this.configService.get<string>('RUNWAY_POLL_TIMEOUT_MS', '180000'));
    this.tokenCostFallback = Number(
      this.configService.get<string>('VIDEO_TOKEN_COST_FALLBACK', '1000'),
    );
  }

  /**
   * Create video generation task asynchronously (returns immediately)
   */
  async createVideoTask(input: GenerateVideoInput): Promise<CreateTaskOutput> {
    try {
      const client = this.getClient();

      const createRequest = this.model === 'gen4.5'
        ? {
            model: 'gen4.5' as const,
            promptText: input.promptText,
            promptImage: input.promptImage,
            ratio: this.ratio,
            duration: this.duration,
          }
        : {
            model: 'gen4_turbo' as const,
            promptText: input.promptText,
            promptImage: input.promptImage,
            ratio: this.ratio,
            duration: this.duration,
          };

      const createdTask = await client.imageToVideo.create(createRequest);
      this.logger.log(`Created Runway task: ${createdTask.id}`);

      return {
        taskId: createdTask.id,
      };
    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
        this.logger.error(`Runway auth/permission error: ${error.message}`);
        throw new InternalServerErrorException('Runway authentication failed');
      }

      if (error instanceof RateLimitError) {
        this.logger.error(`Runway rate limit error: ${error.message}`);
        throw new InternalServerErrorException('Runway rate limit exceeded, try again shortly');
      }

      this.logger.error('Runway API request failed', error as Error);
      throw new InternalServerErrorException('Failed to create video task with Runway');
    }
  }

  /**
   * Check the status of a video generation task
   */
  async checkTaskStatus(taskId: string): Promise<TaskStatusOutput> {
    try {
      const client = this.getClient();
      const task = await client.tasks.retrieve(taskId);

      this.logger.debug(`Task ${taskId} status: ${task.status}`);

      if (task.status === 'SUCCEEDED') {
        const videoUrl = task.output?.[0];
        if (!videoUrl) {
          return {
            status: 'failed',
            errorMessage: 'No video URL returned from Runway',
          };
        }

        return {
          status: 'succeeded',
          videoUrl,
        };
      }

      if (task.status === 'FAILED') {
        const failureMessage = typeof task.failure === 'string' 
          ? task.failure 
          : (task.failure as any)?.message || 'Task failed without error message';
        
        return {
          status: 'failed',
          errorMessage: failureMessage,
        };
      }

      if (task.status === 'RUNNING') {
        return { status: 'running' };
      }

      // PENDING or THROTTLED
      return { status: 'pending' };
    } catch (error) {
      this.logger.error(`Failed to check task status for ${taskId}`, error as Error);
      throw new InternalServerErrorException('Failed to check task status');
    }
  }

  /**
   * Legacy synchronous method (kept for backward compatibility)
   * @deprecated Use createVideoTask + checkTaskStatus instead
   */
  async generateVideo(input: GenerateVideoInput): Promise<GenerateVideoOutput> {
    try {
      const client = this.getClient();

      const createRequest = this.model === 'gen4.5'
        ? {
            model: 'gen4.5' as const,
            promptText: input.promptText,
            promptImage: input.promptImage,
            ratio: this.ratio,
            duration: this.duration,
          }
        : {
            model: 'gen4_turbo' as const,
            promptText: input.promptText,
            promptImage: input.promptImage,
            ratio: this.ratio,
            duration: this.duration,
          };

      const createdTask = await client.imageToVideo.create(createRequest);
      const task = await client.tasks
        .retrieve(createdTask.id)
        .waitForTaskOutput({ timeout: this.timeoutMs });

      const videoUrl = task.output?.[0];
      if (!videoUrl) {
        throw new InternalServerErrorException('Runway returned no output URL');
      }

      return {
        videoUrl,
        usedTokens: this.tokenCostFallback,
        providerTaskId: task.id,
      };
    } catch (error) {
      if (error instanceof TaskFailedError) {
        this.logger.error(`Runway task failed: ${error.message}`);
        throw new InternalServerErrorException('Runway task failed to generate video');
      }

      if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
        this.logger.error(`Runway auth/permission error: ${error.message}`);
        throw new InternalServerErrorException('Runway authentication failed');
      }

      if (error instanceof RateLimitError) {
        this.logger.error(`Runway rate limit error: ${error.message}`);
        throw new InternalServerErrorException('Runway rate limit exceeded, try again shortly');
      }

      this.logger.error('Runway API request failed', error as Error);
      throw new InternalServerErrorException('Failed to generate video with Runway');
    }
  }

  private getClient(): RunwayML {
    if (!this.runwayApiKey) {
      throw new InternalServerErrorException(
        'RUNWAY_API_KEY (or RUNWAYML_API_SECRET) is required for Runway video generation',
      );
    }

    if (!this.runwayApiKey.startsWith('key_')) {
      throw new InternalServerErrorException(
        'RUNWAY_API_KEY must start with key_ for Runway API authentication',
      );
    }

    if (this.client) {
      return this.client;
    }

    this.client = new RunwayML({ apiKey: this.runwayApiKey });
    return this.client;
  }
}
