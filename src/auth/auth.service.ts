import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import {
  Subscription,
  SubscriptionStatus,
  SubscriptionTier,
  UsageRecord,
  User,
} from '../entities';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(SubscriptionTier)
    private readonly tiersRepository: Repository<SubscriptionTier>,
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(UsageRecord)
    private readonly usageRecordsRepository: Repository<UsageRecord>,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResponseDto> {
    const existingUser = await this.usersRepository.findOne({ where: { email: dto.email } });
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const password = await bcrypt.hash(dto.password, 12);

    // Normalize website URL - add https:// if missing protocol
    let normalizedUrl = dto.websiteUrl;
    if (normalizedUrl && !normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const user = this.usersRepository.create({
      email: dto.email,
      password,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
      companyName: dto.companyName ?? null,
      websiteUrl: normalizedUrl,
      ipAddress: dto.ipAddress ?? null,
      deviceInfo: dto.deviceInfo ?? null,
      tokenBalance: 0,
      isActive: true,
    });

    const savedUser = await this.usersRepository.save(user);

    const freeTier = await this.tiersRepository.findOne({ where: { name: 'free', isActive: true } });
    if (!freeTier) {
      throw new NotFoundException('Free tier is not configured');
    }

    // Initialize user's token balance with tier allocation
    savedUser.tokenBalance = freeTier.tokenAllocation || 2000; // Default 2000 tokens for free tier
    await this.usersRepository.save(savedUser);

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 30);

    const subscription = this.subscriptionsRepository.create({
      userId: savedUser.id,
      tierId: freeTier.id,
      pendingTierId: null,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      freemiusInstallId: null,
      freemiusUserId: null,
      freemiusLicenseId: null,
      freemiusPlanId: null,
      licenseKey: null,
      cancelledAt: null,
    });
    await this.subscriptionsRepository.save(subscription);

    const usageRecord = this.usageRecordsRepository.create({
      userId: savedUser.id,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      videosGenerated: 0,
      videosLimit: freeTier.videosPerMonth,
    });
    await this.usageRecordsRepository.save(usageRecord);

    return this.buildAuthResponse(savedUser);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersRepository.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(dto.password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    return this.buildAuthResponse(user);
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['subscriptions', 'subscriptions.tier'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private buildAuthResponse(user: User): AuthResponseDto {
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        companyName: user.companyName,
      },
    };
  }
}
