import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import {
  PromptTemplate,
  Subscription,
  SubscriptionTier,
  UsageRecord,
  User,
  VideoGeneration,
} from './entities';
import { CreditPackage } from './entities/credit-package.entity';
import { CreditTransaction } from './entities/credit-transaction.entity';
import { HealthController } from './health/health.controller';
import { PaymentsModule } from './payments/payments.module';
import { PromptsModule } from './prompts/prompts.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { UsageModule } from './usage/usage.module';
import { VideoGenerationModule } from './video-generation/video-generation.module';
import { CreditsModule } from './credits/credits.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: seconds(60),
        limit: 100,
      },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: Number(configService.get<string>('DB_PORT', '5432')),
        username: configService.get<string>('DB_USERNAME', 'vidshop_user'),
        password: configService.get<string>('DB_PASSWORD', 'vidshop_pass'),
        database: configService.get<string>('DB_NAME', 'vidshop_db'),
        entities: [
          User,
          SubscriptionTier,
          Subscription,
          PromptTemplate,
          VideoGeneration,
          UsageRecord,
          CreditPackage,
          CreditTransaction,
        ],
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    AuthModule,
    SubscriptionsModule,
    PaymentsModule,
    PromptsModule,
    VideoGenerationModule,
    UsageModule,
    CreditsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
