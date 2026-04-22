import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../entities';
import { GenerateVideoDto } from './dto/generate-video.dto';
import { VideoListQueryDto } from './dto/video-list-query.dto';
import { WpVideoRequestDto } from './dto/wp-video-request.dto';
import { VideoGenerationService } from './video-generation.service';

@ApiTags('videos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('videos')
export class VideoGenerationController {
  constructor(private readonly videoGenerationService: VideoGenerationService) {}

  @Post('generate')
  async generateVideo(@CurrentUser() user: User, @Body() dto: GenerateVideoDto) {
    return this.videoGenerationService.generateVideo(user.id, dto);
  }

  @Post('generate/wp-plugin')
  async generateFromWpPlugin(@CurrentUser() user: User, @Body() dto: WpVideoRequestDto) {
    return this.videoGenerationService.generateFromWpPlugin(user.id, dto);
  }

  @Get()
  async getMyVideos(@CurrentUser() user: User, @Query() query: VideoListQueryDto) {
    return this.videoGenerationService.getUserVideos(user.id, query);
  }

  @Get(':id')
  async getVideoById(@CurrentUser() user: User, @Param('id') id: string) {
    return this.videoGenerationService.getVideoById(user.id, id);
  }
}
