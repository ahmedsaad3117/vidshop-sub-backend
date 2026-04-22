import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../entities';
import { CreditsService } from '../credits/credits.service';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly creditsService: CreditsService,
  ) {}

  async checkBalance(userId: string, requiredTokens: number): Promise<boolean> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      return false;
    }
    return user.tokenBalance >= requiredTokens;
  }

  async getBalance(userId: string): Promise<number> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new ForbiddenException('User not found');
    }
    return user.tokenBalance;
  }

  async deductTokens(userId: string, tokensUsed: number, videoId?: string): Promise<void> {
    // Use CreditsService to deduct credits with transaction tracking
    try {
      await this.creditsService.deductCredits(userId, tokensUsed, videoId ?? null);
      this.logger.log(
        `Deducted ${tokensUsed} credits from user ${userId} for video ${videoId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to deduct credits for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async addTokens(userId: string, tokensToAdd: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new ForbiddenException('User not found');
      }

      user.tokenBalance += tokensToAdd;
      await manager.save(User, user);

      this.logger.log(
        `Added ${tokensToAdd} tokens to user ${userId}. New balance: ${user.tokenBalance}`,
      );
    });
  }

  async resetMonthlyTokens(userId: string, tokenAllocation: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new ForbiddenException('User not found');
      }

      user.tokenBalance = tokenAllocation;
      await manager.save(User, user);

      this.logger.log(
        `Reset tokens for user ${userId} to ${tokenAllocation}`,
      );
    });
  }
}
