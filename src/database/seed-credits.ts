import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { CreditPackage } from '../entities/credit-package.entity';

// Load environment variables
dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'vidshop_db',
  entities: [CreditPackage],
  synchronize: false,
});

async function seedCreditPackages() {
  try {
    await AppDataSource.initialize();
    console.log('🔗 Database connected');

    const creditPackageRepo = AppDataSource.getRepository(CreditPackage);

    // Define credit packages (add-ons for one-time purchase)
    const packages = [
      {
        name: 'starter',
        displayName: 'Starter Pack',
        description: 'Perfect for trying out VidShop',
        price: '9.99',
        credits: 10,
        bonusCredits: 0,
        sortOrder: 1,
        badge: null,
        freemiusAddonId: process.env.FREEMIUS_STARTER_ADDON_ID || null,
        freemiusPricingId: process.env.FREEMIUS_STARTER_PRICING_ID || null,
      },
      {
        name: 'basic',
        displayName: 'Basic Pack',
        description: 'Great for small businesses',
        price: '29.99',
        credits: 35,
        bonusCredits: 5, // Buy 30, get 5 free (total 35)
        sortOrder: 2,
        badge: null,
        freemiusAddonId: process.env.FREEMIUS_BASIC_ADDON_ID || null,
        freemiusPricingId: process.env.FREEMIUS_BASIC_PRICING_ID || null,
      },
      {
        name: 'pro',
        displayName: 'Pro Pack',
        description: 'Most popular choice for growing businesses',
        price: '79.99',
        credits: 100,
        bonusCredits: 20, // Buy 80, get 20 free (total 100)
        sortOrder: 3,
        badge: 'Most Popular',
        freemiusAddonId: process.env.FREEMIUS_PRO_ADDON_ID || null,
        freemiusPricingId: process.env.FREEMIUS_PRO_PRICING_ID || null,
      },
      {
        name: 'business',
        displayName: 'Business Pack',
        description: 'For high-volume video generation',
        price: '199.99',
        credits: 300,
        bonusCredits: 50, // Buy 250, get 50 free (total 300)
        sortOrder: 4,
        badge: 'Best Value',
        freemiusAddonId: process.env.FREEMIUS_BUSINESS_ADDON_ID || null,
        freemiusPricingId: process.env.FREEMIUS_BUSINESS_PRICING_ID || null,
      },
      {
        name: 'enterprise',
        displayName: 'Enterprise Pack',
        description: 'Maximum value for agencies and enterprises',
        price: '499.99',
        credits: 1000,
        bonusCredits: 200, // Buy 800, get 200 free (total 1000)
        sortOrder: 5,
        badge: 'Best Deal',
        freemiusAddonId: process.env.FREEMIUS_ENTERPRISE_ADDON_ID || null,
        freemiusPricingId: process.env.FREEMIUS_ENTERPRISE_PRICING_ID || null,
      },
    ];

    console.log('📦 Seeding credit packages...');

    for (const pkgData of packages) {
      const existing = await creditPackageRepo.findOne({
        where: { name: pkgData.name },
      });

      if (existing) {
        // Update existing package
        const updateData: any = { ...pkgData };
        // Remove null badge to avoid TypeORM issues
        if (updateData.badge === null) {
          delete updateData.badge;
        }
        await creditPackageRepo.update(existing.id, updateData);
        console.log(`✅ Updated credit package: ${pkgData.displayName}`);
      } else {
        // Create new package
        const createData: any = { ...pkgData };
        // Remove null badge to avoid TypeORM issues
        if (createData.badge === null) {
          delete createData.badge;
        }
        const pkg = creditPackageRepo.create(createData);
        await creditPackageRepo.save(pkg);
        console.log(`✅ Created credit package: ${pkgData.displayName}`);
      }
    }

    console.log('\n🎉 Credit packages seeded successfully!\n');
    console.log('📊 Packages summary:');
    const allPackages = await creditPackageRepo.find({
      order: { sortOrder: 'ASC' },
    });
    allPackages.forEach((pkg) => {
      const totalCredits = pkg.credits + pkg.bonusCredits;
      const pricePerCredit = (parseFloat(pkg.price) / totalCredits).toFixed(2);
      console.log(
        `   ${pkg.displayName}: $${pkg.price} → ${totalCredits} credits ($${pricePerCredit}/credit)`,
      );
    });

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seedCreditPackages();
