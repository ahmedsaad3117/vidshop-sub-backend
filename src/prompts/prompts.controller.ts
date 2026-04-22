import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User } from '../entities';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CreateTemplateDto } from './dto/create-template.dto';
import { TemplateQueryDto } from './dto/template-query.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { PromptsService } from './prompts.service';

@ApiTags('templates')
@Controller('templates')
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async getAllTemplates(
    @Query() query: TemplateQueryDto,
    @CurrentUser() user: User | null,
  ) {
    return this.promptsService.getAllTemplates(query, user?.id);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async getTemplateById(@Param('id') id: string, @CurrentUser() user: User | null) {
    return this.promptsService.getTemplateById(id, user?.id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createTemplate(@Body() dto: CreateTemplateDto) {
    return this.promptsService.createTemplate(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.promptsService.updateTemplate(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deleteTemplate(@Param('id') id: string) {
    await this.promptsService.deleteTemplate(id);
    return { success: true };
  }
}
