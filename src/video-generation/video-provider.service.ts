import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RunwayVideoService } from '../runway-video/runway-video.service';
import { LegacyVideoApiService } from './legacy-video-api.service';

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

export interface VideoProviderDebugInfo {
  activeProvider: VideoProvider;
  runway: {
    apiKeyConfigured: boolean;
    apiKeyPrefixValid: boolean;
    model: string;
    ratio: string;
    duration: number;
    timeoutMs: number;
  };
  legacy: {
    apiUrlConfigured: boolean;
    apiKeyConfigured: boolean;
  };
  tokenCostFallback: number;
}

type VideoProvider = 'runway' | 'legacy';

@Injectable()
export class VideoProviderService {
  private readonly logger = new Logger(VideoProviderService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly runwayVideoService: RunwayVideoService,
    private readonly legacyVideoApiService: LegacyVideoApiService,
  ) {}

  /**
   * Create video task asynchronously (non-blocking)
   */
  async createVideoTask(input: GenerateVideoInput): Promise<CreateTaskOutput> {
    const provider = this.getProvider();

    this.logger.log(`Creating video task with provider: ${provider}`);

    if (provider === 'legacy') {
      // Legacy provider doesn't support async, fallback to sync
      throw new InternalServerErrorException(
        'Async video generation not supported with legacy provider',
      );
    }

    return this.runwayVideoService.createVideoTask(input);
  }

  /**
   * Legacy synchronous method
   * @deprecated Use createVideoTask instead
   */
  async generateVideo(input: GenerateVideoInput): Promise<GenerateVideoOutput> {
    const provider = this.getProvider();

    this.logger.log(`Using video provider: ${provider}`);

    if (provider === 'legacy') {
      return this.legacyVideoApiService.generateVideo(input.promptText);
    }

    return this.runwayVideoService.generateVideo(input);
  }

  getProviderDebugInfo(): VideoProviderDebugInfo {
    const activeProvider = this.getProvider();
    const runwayApiKey =
      this.configService.get<string>('RUNWAY_API_KEY') ??
      this.configService.get<string>('RUNWAYML_API_SECRET') ??
      '';
    const legacyApiUrl = this.configService.get<string>('VIDEO_API_URL', '');
    const legacyApiKey = this.configService.get<string>('VIDEO_API_KEY', '');

    return {
      activeProvider,
      runway: {
        apiKeyConfigured: runwayApiKey.length > 0,
        apiKeyPrefixValid: runwayApiKey.startsWith('key_'),
        model: this.configService.get<string>('RUNWAY_MODEL', 'gen4.5'),
        ratio: this.configService.get<string>('RUNWAY_RATIO', '1280:720'),
        duration: Number(this.configService.get<string>('RUNWAY_DURATION', '5')),
        timeoutMs: Number(this.configService.get<string>('RUNWAY_POLL_TIMEOUT_MS', '180000')),
      },
      legacy: {
        apiUrlConfigured: legacyApiUrl.length > 0,
        apiKeyConfigured: legacyApiKey.length > 0,
      },
      tokenCostFallback: Number(
        this.configService.get<string>('VIDEO_TOKEN_COST_FALLBACK', '1000'),
      ),
    };
  }

  private getProvider(): VideoProvider {
    const configuredProvider = this.configService.get<string>('VIDEO_PROVIDER', 'runway');

    if (configuredProvider === 'legacy' || configuredProvider === 'runway') {
      return configuredProvider;
    }

    throw new InternalServerErrorException(
      `Unsupported VIDEO_PROVIDER '${configuredProvider}'. Use 'runway' or 'legacy'.`,
    );
  }
}
