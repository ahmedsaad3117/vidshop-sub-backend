import { IsIn, IsOptional } from 'class-validator';

export class AdminUsageQueryDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month', 'all'])
  period?: 'day' | 'week' | 'month' | 'all' = 'month';
}
