import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../entities';
import { GenerateVideoDto } from './dto/generate-video.dto';
import { ImageStorageService } from './image-storage.service';
import { VideoListQueryDto } from './dto/video-list-query.dto';
import {
  VideoProviderService,
  type VideoProviderDebugInfo,
} from './video-provider.service';
import { WpVideoRequestDto } from './dto/wp-video-request.dto';
import { VideoGenerationService } from './video-generation.service';

@ApiTags('videos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('videos')
export class VideoGenerationController {
  constructor(
    private readonly videoGenerationService: VideoGenerationService,
    private readonly videoProviderService: VideoProviderService,
    private readonly imageStorageService: ImageStorageService,
  ) {}

  @Post('generate')
  @UseInterceptors(FileInterceptor('image'))
  async generateVideo(
    @CurrentUser() user: User,
    @Body() dto: GenerateVideoDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let promptImage = dto.productImageUrl;

    if (file) {
      dto.productImageUrl = this.imageStorageService.saveUploadedFile(file);
      promptImage = this.imageStorageService.toDataUri(file);
    }

    if (!dto.productImageUrl || !this.imageStorageService.isValidUrl(dto.productImageUrl)) {
      throw new BadRequestException('Provide either a valid image URL or an uploaded image file');
    }

    if (!promptImage || !this.imageStorageService.isValidRunwayUrl(promptImage)) {
      throw new BadRequestException('Runway requires an uploaded image or an HTTPS image URL');
    }

    return this.videoGenerationService.generateVideo(
      user.id,
      dto as GenerateVideoDto & { productImageUrl: string },
      promptImage,
    );
  }

  @Post('generate/wp-plugin')
  @UseInterceptors(FileInterceptor('image'))
  async generateFromWpPlugin(
    @CurrentUser() user: User,
    @Body() dto: WpVideoRequestDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let promptImage = dto.image;

    if (file) {
      dto.image = this.imageStorageService.saveUploadedFile(file);
      promptImage = this.imageStorageService.toDataUri(file);
    }

    if (!dto.image || !this.imageStorageService.isValidUrl(dto.image)) {
      throw new BadRequestException('Provide either a valid image URL or an uploaded image file');
    }

    if (!promptImage || !this.imageStorageService.isValidRunwayUrl(promptImage)) {
      throw new BadRequestException('Runway requires an uploaded image or an HTTPS image URL');
    }

    return this.videoGenerationService.generateFromWpPlugin(
      user.id,
      dto as WpVideoRequestDto & { image: string },
      promptImage,
    );
  }

  @Get()
  async getMyVideos(@CurrentUser() user: User, @Query() query: VideoListQueryDto) {
    return this.videoGenerationService.getUserVideos(user.id, query);
  }

  @Get(':id')
  async getVideoById(@CurrentUser() user: User, @Param('id') id: string) {
    return this.videoGenerationService.getVideoById(user.id, id);
  }

  @Get('debug/provider-config')
  @UseGuards(AdminGuard)
  async getProviderConfigDebug(): Promise<VideoProviderDebugInfo> {
    return this.videoProviderService.getProviderDebugInfo();
  }
}
