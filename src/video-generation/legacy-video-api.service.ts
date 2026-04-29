import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface LegacyGenerateResult {
  videoUrl: string;
  usedTokens: number;
  providerTaskId: string;
}

@Injectable()
export class LegacyVideoApiService {
  private readonly logger = new Logger(LegacyVideoApiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async generateVideo(promptText: string): Promise<LegacyGenerateResult> {
    const apiUrl = this.configService.get<string>('VIDEO_API_URL', '');
    const apiKey = this.configService.get<string>('VIDEO_API_KEY', '');
    const tokenFallback = Number(
      this.configService.get<string>('VIDEO_TOKEN_COST_FALLBACK', '1000'),
    );

    if (!apiUrl || !apiKey) {
      throw new InternalServerErrorException(
        'VIDEO_API_URL and VIDEO_API_KEY are required for legacy video provider',
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          apiUrl,
          {
            prompt: promptText,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
        ),
      );

      const videoUrl = response.data?.video_url;
      const usedTokens =
        typeof response.data?.used_tokens === 'number'
          ? response.data.used_tokens
          : tokenFallback;

      if (!videoUrl) {
        throw new InternalServerErrorException('Legacy video API returned no video_url');
      }

      return {
        videoUrl,
        usedTokens,
        providerTaskId: response.data?.id ?? 'legacy-task',
      };
    } catch (error) {
      this.logger.error('Legacy video API request failed', error as Error);
      throw new InternalServerErrorException('Failed to generate video via legacy provider');
    }
  }
}
