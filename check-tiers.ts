import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import {
  User,
  SubscriptionTier,
  Subscription,
  PromptTemplate,
  VideoGeneration,
  UsageRecord,
} from './src/entities';

dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'vidshop_db',
  entities: [User, SubscriptionTier, Subscription, PromptTemplate, VideoGeneration, UsageRecord],
  synchronize: false,
});

async function checkTiers() {
  await dataSource.initialize();
  const tierRepo = dataSource.getRepository(SubscriptionTier);
  
  const tiers = await tierRepo.find({ order: { sortOrder: 'ASC' } });
  
  console.log('\n=== Current Tier Configuration in Database ===\n');
  
  for (const tier of tiers) {
    console.log(`${tier.displayName} (${tier.name}):`);
    console.log(`  Price: $${tier.price}`);
    console.log(`  Freemius Plan ID: ${tier.freemiusPlanId || '❌ NOT SET'}`);
    console.log(`  Freemius Pricing ID: ${tier.freemiusPricingId || '❌ NOT SET'}`);
    console.log('');
  }
  
  console.log('=== Environment Variables ===\n');
  console.log(`FREEMIUS_PLUGIN_ID: ${process.env.FREEMIUS_PLUGIN_ID || '❌ NOT SET'}`);
  console.log(`FREEMIUS_PUBLIC_KEY: ${process.env.FREEMIUS_PUBLIC_KEY ? '✓ SET' : '❌ NOT SET'}`);
  console.log(`FREEMIUS_SECRET_KEY: ${process.env.FREEMIUS_SECRET_KEY ? '✓ SET' : '❌ NOT SET'}`);
  console.log('');
  console.log(`FREEMIUS_FREE_PLAN_ID: ${process.env.FREEMIUS_FREE_PLAN_ID || '❌ NOT SET'}`);
  console.log(`FREEMIUS_STARTER_PLAN_ID: ${process.env.FREEMIUS_STARTER_PLAN_ID || '❌ NOT SET'}`);
  console.log(`FREEMIUS_PRO_PLAN_ID: ${process.env.FREEMIUS_PRO_PLAN_ID || '❌ NOT SET'}`);
  console.log(`FREEMIUS_ENTERPRISE_PLAN_ID: ${process.env.FREEMIUS_ENTERPRISE_PLAN_ID || '❌ NOT SET'}`);
  console.log('');
  console.log(`FREEMIUS_STARTER_PRICING_ID: ${process.env.FREEMIUS_STARTER_PRICING_ID || '❌ NOT SET'}`);
  console.log(`FREEMIUS_PRO_PRICING_ID: ${process.env.FREEMIUS_PRO_PRICING_ID || '❌ NOT SET'}`);
  console.log(`FREEMIUS_ENTERPRISE_PRICING_ID: ${process.env.FREEMIUS_ENTERPRISE_PRICING_ID || '❌ NOT SET'}`);
  
  await dataSource.destroy();
}

checkTiers().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
