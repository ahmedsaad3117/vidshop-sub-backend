import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ExternalVideoApiService {
  private readonly logger = new Logger(ExternalVideoApiService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiUrl = this.configService.get<string>('VIDEO_API_URL', '');
    this.apiKey = this.configService.get<string>('VIDEO_API_KEY', '');
  }

  async generateVideo(
    prompt: string,
    lora: string,
  ): Promise<{ videoUrl: string; usedTokens: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.apiUrl,
          {
            prompt,
            lora,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
            },
          },
        ),
      );

      const videoUrl = response.data?.video_url;
      const usedTokens = response.data?.used_tokens;

      if (!videoUrl) {
        throw new InternalServerErrorException('Video API returned no video_url');
      }

      if (typeof usedTokens !== 'number') {
        throw new InternalServerErrorException('Video API returned invalid used_tokens');
      }

      return { videoUrl, usedTokens };
    } catch (error) {
      this.logger.error('External video API request failed', error as Error);
      throw new InternalServerErrorException('Failed to generate video');
    }
  }
}
