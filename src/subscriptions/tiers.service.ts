import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionTier } from '../entities';
import { CreateTierDto } from './dto/create-tier.dto';
import { UpdateTierDto } from './dto/update-tier.dto';

@Injectable()
export class TiersService implements OnModuleInit {
  constructor(
    @InjectRepository(SubscriptionTier)
    private readonly tiersRepository: Repository<SubscriptionTier>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultTiers();
  }

  async getAllTiers(): Promise<SubscriptionTier[]> {
    return this.tiersRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }

  async getTierById(id: string): Promise<SubscriptionTier> {
    const tier = await this.tiersRepository.findOne({ where: { id } });
    if (!tier) {
      throw new NotFoundException('Tier not found');
    }
    return tier;
  }

  async createTier(dto: CreateTierDto): Promise<SubscriptionTier> {
    const tier = this.tiersRepository.create({
      ...dto,
      price: dto.price.toFixed(2),
      isActive: true,
    });
    return this.tiersRepository.save(tier);
  }

  async updateTier(id: string, dto: UpdateTierDto): Promise<SubscriptionTier> {
    const tier = await this.getTierById(id);

    Object.assign(tier, {
      ...dto,
      price: typeof dto.price === 'number' ? dto.price.toFixed(2) : tier.price,
    });

    return this.tiersRepository.save(tier);
  }

  async seedDefaultTiers(): Promise<void> {
    const count = await this.tiersRepository.count();
    if (count > 0) {
      return;
    }

    const defaults: Array<Partial<SubscriptionTier>> = [
      {
        name: 'free',
        displayName: 'Free',
        description: 'Starter access for trying video generation features.',
        price: '0.00',
        videosPerMonth: 3,
        hasAllTemplates: false,
        hasCustomPrompts: true,
        hasPriorityProcessing: false,
        isActive: true,
        freemiusPlanId: this.configService.get<string>('FREEMIUS_FREE_PLAN_ID') || null,
        freemiusPricingId: null,
        sortOrder: 1,
      },
      {
        name: 'starter',
        displayName: 'Starter',
        description: 'For small stores needing regular product videos.',
        price: '19.00',
        videosPerMonth: 20,
        hasAllTemplates: true,
        hasCustomPrompts: true,
        hasPriorityProcessing: false,
        isActive: true,
        freemiusPlanId: this.configService.get<string>('FREEMIUS_STARTER_PLAN_ID') || null,
        freemiusPricingId:
          this.configService.get<string>('FREEMIUS_STARTER_PRICING_ID') || null,
        sortOrder: 2,
      },
      {
        name: 'pro',
        displayName: 'Pro',
        description: 'For growing brands that need custom prompt control.',
        price: '49.00',
        videosPerMonth: 100,
        hasAllTemplates: true,
        hasCustomPrompts: true,
        hasPriorityProcessing: false,
        isActive: true,
        freemiusPlanId: this.configService.get<string>('FREEMIUS_PRO_PLAN_ID') || null,
        freemiusPricingId: this.configService.get<string>('FREEMIUS_PRO_PRICING_ID') || null,
        sortOrder: 3,
      },
      {
        name: 'enterprise',
        displayName: 'Enterprise',
        description: 'Unlimited generation with priority processing.',
        price: '149.00',
        videosPerMonth: -1,
        hasAllTemplates: true,
        hasCustomPrompts: true,
        hasPriorityProcessing: true,
        isActive: true,
        freemiusPlanId:
          this.configService.get<string>('FREEMIUS_ENTERPRISE_PLAN_ID') || null,
        freemiusPricingId:
          this.configService.get<string>('FREEMIUS_ENTERPRISE_PRICING_ID') || null,
        sortOrder: 4,
      },
    ];

    await this.tiersRepository.save(
      defaults.map((tier) => this.tiersRepository.create(tier)),
    );
  }
}
