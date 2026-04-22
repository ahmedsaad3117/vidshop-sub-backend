import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../entities';
import { AdminUsageQueryDto } from './dto/admin-usage-query.dto';
import { UsageService } from './usage.service';

@ApiTags('usage')
@Controller('usage')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get('stats')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getMyUsageStats(@CurrentUser() user: User) {
    return this.usageService.getUserUsageStats(user.id);
  }

  @Get('can-generate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async canGenerate(@CurrentUser() user: User) {
    return this.usageService.canGenerateVideo(user.id);
  }

  @Get('can-generate-video')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async canGenerateVideo(@CurrentUser() user: User) {
    return this.usageService.canGenerateVideo(user.id);
  }

  @Get('can-generate-text')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async canGenerateText(@CurrentUser() user: User) {
    return this.usageService.canGenerateText(user.id);
  }

  @Get('admin/overview')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAdminOverview(@Query() query: AdminUsageQueryDto) {
    return this.usageService.getAdminUsageOverview(query);
  }
}
