import { Module } from '@nestjs/common';
import { RunwayVideoService } from './runway-video.service';

@Module({
  providers: [RunwayVideoService],
  exports: [RunwayVideoService],
})
export class RunwayVideoModule {}
