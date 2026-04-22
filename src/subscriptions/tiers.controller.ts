import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { SubscriptionTier } from '../entities';
import { CreateTierDto } from './dto/create-tier.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { TiersService } from './tiers.service';

@ApiTags('tiers')
@Controller('tiers')
export class TiersController {
  constructor(private readonly tiersService: TiersService) {}

  @Get()
  async getAllTiers(): Promise<SubscriptionTier[]> {
    return this.tiersService.getAllTiers();
  }

  @Get(':id')
  async getTierById(@Param('id') id: string): Promise<SubscriptionTier> {
    return this.tiersService.getTierById(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createTier(@Body() dto: CreateTierDto): Promise<SubscriptionTier> {
    return this.tiersService.createTier(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateTier(
    @Param('id') id: string,
    @Body() dto: UpdateTierDto,
  ): Promise<SubscriptionTier> {
    return this.tiersService.updateTier(id, dto);
  }
}
