import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import {
  PromptCategory,
  PromptTemplate,
  PromptTier,
  Subscription,
  SubscriptionStatus,
  SubscriptionTier,
  UsageRecord,
  User,
  VideoGeneration,
  VideoStatus,
} from '../entities';

// Load environment variables
dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'vidshop_db',
  entities: [User, SubscriptionTier, Subscription, PromptTemplate, VideoGeneration, UsageRecord],
  synchronize: true,
});

type DemoUserSeed = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tierName: 'free' | 'starter' | 'pro' | 'enterprise';
  usage: number;
  isAdmin?: boolean;
};

const demoUsers: DemoUserSeed[] = [
  {
    email: 'free@demo.com',
    password: 'Demo1234!',
    firstName: 'Free',
    lastName: 'User',
    tierName: 'free',
    usage: 1,
  },
  {
    email: 'starter@demo.com',
    password: 'Demo1234!',
    firstName: 'Starter',
    lastName: 'User',
    tierName: 'starter',
    usage: 5,
  },
  {
    email: 'pro@demo.com',
    password: 'Demo1234!',
    firstName: 'Pro',
    lastName: 'User',
    tierName: 'pro',
    usage: 12,
  },
  {
    email: 'enterprise@demo.com',
    password: 'Demo1234!',
    firstName: 'Enterprise',
    lastName: 'User',
    tierName: 'enterprise',
    usage: 28,
  },
  {
    email: 'admin@demo.com',
    password: 'Admin1234!',
    firstName: 'Admin',
    lastName: 'User',
    tierName: 'free',
    usage: 0,
    isAdmin: true,
  },
];

const tierDefaults: Array<Partial<SubscriptionTier>> = [
  {
    name: 'free',
    displayName: 'Free',
    description: 'Starter access for trying video generation features.',
    price: '0.00',
    videosPerMonth: 3,
    textsPerMonth: 10,
    tokenAllocation: 2000,
    hasAllTemplates: false,
    hasCustomPrompts: false,
    hasPriorityProcessing: false,
    isActive: true,
    sortOrder: 1,
    freemiusPlanId: process.env.FREEMIUS_FREE_PLAN_ID || null,
    freemiusPricingId: null,
  },
  {
    name: 'starter',
    displayName: 'Starter',
    description: 'For small stores needing regular product videos.',
    price: '19.00',
    videosPerMonth: 20,
    textsPerMonth: 100,
    tokenAllocation: 20000,
    hasAllTemplates: true,
    hasCustomPrompts: false,
    hasPriorityProcessing: false,
    isActive: true,
    sortOrder: 2,
    freemiusPlanId: process.env.FREEMIUS_STARTER_PLAN_ID || null,
    freemiusPricingId: process.env.FREEMIUS_STARTER_PRICING_ID || null,
  },
  {
    name: 'pro',
    displayName: 'Pro',
    description: 'For growing brands that need custom prompt control.',
    price: '49.00',
    videosPerMonth: 100,
    textsPerMonth: 500,
    tokenAllocation: 100000,
    hasAllTemplates: true,
    hasCustomPrompts: true,
    hasPriorityProcessing: false,
    isActive: true,
    sortOrder: 3,
    freemiusPlanId: process.env.FREEMIUS_PRO_PLAN_ID || null,
    freemiusPricingId: process.env.FREEMIUS_PRO_PRICING_ID || null,
  },
  {
    name: 'enterprise',
    displayName: 'Enterprise',
    description: 'Unlimited generation with priority processing.',
    price: '149.00',
    videosPerMonth: -1,
    textsPerMonth: -1,
    tokenAllocation: -1,
    hasAllTemplates: true,
    hasCustomPrompts: true,
    hasPriorityProcessing: true,
    isActive: true,
    sortOrder: 4,
    freemiusPlanId: process.env.FREEMIUS_ENTERPRISE_PLAN_ID || null,
    freemiusPricingId: process.env.FREEMIUS_ENTERPRISE_PRICING_ID || null,
  },
];

const templateDefaults: Array<Partial<PromptTemplate>> = [
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

async function seedTiers(): Promise<Record<string, SubscriptionTier>> {
  const tierRepo = dataSource.getRepository(SubscriptionTier);
  const byName: Record<string, SubscriptionTier> = {};

  for (const tierData of tierDefaults) {
    const existing = await tierRepo.findOne({ where: { name: tierData.name } });
    if (existing) {
      Object.assign(existing, tierData);
      byName[existing.name] = await tierRepo.save(existing);
    } else {
      const created = tierRepo.create(tierData);
      byName[created.name] = await tierRepo.save(created);
    }
  }

  return byName;
}

async function seedTemplates(): Promise<void> {
  const templateRepo = dataSource.getRepository(PromptTemplate);

  for (const templateData of templateDefaults) {
    const existing = await templateRepo.findOne({ where: { name: templateData.name } });
    if (existing) {
      Object.assign(existing, templateData);
      await templateRepo.save(existing);
    } else {
      await templateRepo.save(templateRepo.create(templateData));
    }
  }
}

async function seedDemoUsers(tiers: Record<string, SubscriptionTier>): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const subRepo = dataSource.getRepository(Subscription);
  const usageRepo = dataSource.getRepository(UsageRecord);
  const videoRepo = dataSource.getRepository(VideoGeneration);

  const now = new Date();
  const periodStart = new Date(now);
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  for (const seedUser of demoUsers) {
    const hashed = await bcrypt.hash(seedUser.password, 12);
    const tier = tiers[seedUser.tierName];

    let user = await userRepo.findOne({ where: { email: seedUser.email } });
    if (!user) {
      user = userRepo.create({
        email: seedUser.email,
        password: hashed,
        firstName: seedUser.firstName,
        lastName: seedUser.lastName,
        companyName: 'VidShop Demo',
        websiteUrl: 'https://demo.vidshop.local',
        isActive: true,
        isAdmin: Boolean(seedUser.isAdmin),
      });
    } else {
      user.password = hashed;
      user.firstName = seedUser.firstName;
      user.lastName = seedUser.lastName;
      user.isAdmin = Boolean(seedUser.isAdmin);
      user.isActive = true;
    }
    user = await userRepo.save(user);

    const existingSubs = await subRepo.find({ where: { userId: user.id } });
    if (existingSubs.length > 0) {
      await subRepo.delete({ userId: user.id });
    }

    await subRepo.save(
      subRepo.create({
        userId: user.id,
        tierId: tier.id,
        pendingTierId: null,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelledAt: null,
        freemiusInstallId: null,
        freemiusUserId: null,
        freemiusLicenseId: null,
        freemiusPlanId: tier.freemiusPlanId,
        licenseKey: null,
      }),
    );

    await usageRepo.delete({ userId: user.id });
    await usageRepo.save(
      usageRepo.create({
        userId: user.id,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        videosGenerated: seedUser.usage,
        videosLimit: tier.videosPerMonth,
      }),
    );

    const existingVideos = await videoRepo.find({ where: { userId: user.id } });
    if (existingVideos.length > 0) {
      await videoRepo.delete({ userId: user.id });
    }

    const completedAt = new Date(now.getTime() - 10 * 60 * 1000);
    const processingStart = new Date(now.getTime() - 12 * 60 * 1000);

    await videoRepo.save([
      videoRepo.create({
        userId: user.id,
        templateId: null,
        productTitle: `${seedUser.firstName} Product Spotlight`,
        productDescription: 'High quality demonstration product for completed generation.',
        productImageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30',
        promptUsed: 'Demo prompt for completed video.',
        customPrompt: null,
        status: VideoStatus.COMPLETED,
        videoUrl: 'https://cdn.example.com/demo/completed.mp4',
        errorMessage: null,
        processingStartedAt: processingStart,
        completedAt,
      }),
      videoRepo.create({
        userId: user.id,
        templateId: null,
        productTitle: `${seedUser.firstName} Product In Progress`,
        productDescription: 'Video generation still processing.',
        productImageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff',
        promptUsed: 'Demo prompt for processing video.',
        customPrompt: null,
        status: VideoStatus.PROCESSING,
        videoUrl: null,
        errorMessage: null,
        processingStartedAt: new Date(now.getTime() - 2 * 60 * 1000),
        completedAt: null,
      }),
      videoRepo.create({
        userId: user.id,
        templateId: null,
        productTitle: `${seedUser.firstName} Product Failed Attempt`,
        productDescription: 'Generation failed due to temporary provider issue.',
        productImageUrl: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796',
        promptUsed: 'Demo prompt for failed video.',
        customPrompt: null,
        status: VideoStatus.FAILED,
        videoUrl: null,
        errorMessage: 'Provider timeout while rendering',
        processingStartedAt: new Date(now.getTime() - 30 * 60 * 1000),
        completedAt: new Date(now.getTime() - 25 * 60 * 1000),
      }),
    ]);
  }
}

async function run(): Promise<void> {
  await dataSource.initialize();

  try {
    const tiers = await seedTiers();
    await seedTemplates();
    await seedDemoUsers(tiers);
    // eslint-disable-next-line no-console
    console.log('Seed completed successfully.');
  } finally {
    await dataSource.destroy();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', error);
  process.exit(1);
});
