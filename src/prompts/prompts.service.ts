import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PromptCategory,
  PromptTemplate,
  PromptTier,
  Subscription,
  User,
} from '../entities';
import { CreateTemplateDto } from './dto/create-template.dto';
import { TemplateQueryDto } from './dto/template-query.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class PromptsService implements OnModuleInit {
  constructor(
    @InjectRepository(PromptTemplate)
    private readonly templatesRepository: Repository<PromptTemplate>,
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultTemplates();
  }

  async getAllTemplates(
    query: TemplateQueryDto,
    userId?: string,
  ): Promise<PromptTemplate[]> {
    const canAccessPremium = await this.canAccessPremiumTemplates(userId);

    const qb = this.templatesRepository
      .createQueryBuilder('template')
      .where('template.isActive = :active', { active: true });

    if (query.category) {
      qb.andWhere('template.category = :category', { category: query.category });
    }

    if (!canAccessPremium) {
      qb.andWhere('template.tier = :tier', { tier: PromptTier.BASIC });
    }

    return qb.orderBy('template.sortOrder', 'ASC').getMany();
  }

  async getTemplateById(id: string, userId?: string): Promise<PromptTemplate> {
    const template = await this.templatesRepository.findOne({
      where: { id, isActive: true },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.tier === PromptTier.PREMIUM) {
      const canAccessPremium = await this.canAccessPremiumTemplates(userId);
      if (!canAccessPremium) {
        throw new ForbiddenException('Premium template access required');
      }
    }

    return template;
  }

  async resolvePrompt(
    templateId: string | null,
    customPrompt: string | null,
    productTitle: string,
    productDescription: string,
  ): Promise<string> {
    if (templateId) {
      const template = await this.templatesRepository.findOne({
        where: { id: templateId, isActive: true },
      });

      if (!template) {
        throw new NotFoundException('Template not found');
      }

      return template.promptText
        .replace(/\{\{PRODUCT_TITLE\}\}/g, productTitle)
        .replace(/\{\{PRODUCT_DESCRIPTION\}\}/g, productDescription);
    }

    if (customPrompt) {
      return customPrompt;
    }

    throw new BadRequestException('Either templateId or customPrompt is required');
  }

  async createTemplate(dto: CreateTemplateDto): Promise<PromptTemplate> {
    if (!dto.promptText.includes('{{PRODUCT_TITLE}}')) {
      throw new BadRequestException('promptText must contain {{PRODUCT_TITLE}} placeholder');
    }

    const template = this.templatesRepository.create({
      ...dto,
      sortOrder: dto.sortOrder ?? 999,
      isActive: true,
      thumbnailUrl: dto.thumbnailUrl ?? null,
      exampleVideoUrl: dto.exampleVideoUrl ?? null,
    });

    return this.templatesRepository.save(template);
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto): Promise<PromptTemplate> {
    const template = await this.templatesRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    Object.assign(template, dto);
    return this.templatesRepository.save(template);
  }

  async deleteTemplate(id: string): Promise<void> {
    const template = await this.templatesRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    template.isActive = false;
    await this.templatesRepository.save(template);
  }

  async seedDefaultTemplates(): Promise<void> {
    const count = await this.templatesRepository.count();
    if (count > 0) {
      return;
    }

    const defaults: Array<Partial<PromptTemplate>> = [
      {
        name: 'Professional Product Showcase',
        description: 'Clean, professional product showcase video.',
        promptText:
          'Create a professional 15-second product showcase video for {{PRODUCT_TITLE}}. The product is: {{PRODUCT_DESCRIPTION}}. Use smooth camera movements, clean white background, and elegant transitions. Highlight the product from multiple angles with soft lighting.',
        category: PromptCategory.PRODUCT_SHOWCASE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 1,
      },
      {
        name: 'Lifestyle in Action',
        description: 'Lifestyle scene showing real-world product use.',
        promptText:
          'Create a lifestyle video showing {{PRODUCT_TITLE}} being used in a real-world setting. Product details: {{PRODUCT_DESCRIPTION}}. Show the product in a cozy, well-lit environment with natural movements. Make it feel authentic and relatable.',
        category: PromptCategory.LIFESTYLE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 2,
      },
      {
        name: 'Dynamic Unboxing Experience',
        description: 'High-energy unboxing format with visual flair.',
        promptText:
          'Create an exciting unboxing video for {{PRODUCT_TITLE}}. Product: {{PRODUCT_DESCRIPTION}}. Start with a beautifully wrapped package, build anticipation with close-ups, then reveal the product with dramatic lighting and celebration effects. Add subtle particle effects.',
        category: PromptCategory.UNBOXING,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 3,
      },
      {
        name: 'Step-by-Step Tutorial',
        description: 'Instructional walkthrough with clear guidance.',
        promptText:
          'Create an instructional tutorial video for {{PRODUCT_TITLE}}. Product: {{PRODUCT_DESCRIPTION}}. Show step-by-step usage with clear visual indicators, text overlays for each step, and smooth transitions between steps. Keep it informative and visually engaging.',
        category: PromptCategory.TUTORIAL,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 4,
      },
      {
        name: 'Before & After Transformation',
        description: 'Dramatic comparison format for impact.',
        promptText:
          "Create a dramatic before-and-after comparison video featuring {{PRODUCT_TITLE}}. Product: {{PRODUCT_DESCRIPTION}}. Show the 'before' state, then a satisfying transition/transformation reveal to the 'after' state with the product. Use split-screen or wipe transitions.",
        category: PromptCategory.COMPARISON,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 5,
      },
      {
        name: 'Customer Testimonial Style',
        description: 'Trust-building testimonial-inspired format.',
        promptText:
          'Create a testimonial-style video for {{PRODUCT_TITLE}}. Product: {{PRODUCT_DESCRIPTION}}. Design it as if a happy customer is sharing their experience - show the product in daily use, add warm color grading, include subtle text overlays with key benefits, and end with a strong call-to-action moment.',
        category: PromptCategory.TESTIMONIAL,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 6,
      },
    ];

    await this.templatesRepository.save(
      defaults.map((template) => this.templatesRepository.create(template)),
    );
  }

  private async canAccessPremiumTemplates(userId?: string): Promise<boolean> {
    if (!userId) {
      return false;
    }

    const subscription = await this.subscriptionsRepository.findOne({
      where: { userId },
      relations: ['tier'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription || !subscription.tier) {
      return false;
    }

    return subscription.tier.name !== 'free';
  }
}
