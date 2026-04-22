import { VideoGeneration } from '../../entities';

export class VideoGenerationResponseDto {
  data!: VideoGeneration[];
  total!: number;
}
