import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsString, Min } from 'class-validator';

export class CreateTierDto {
  @IsString()
  name!: string;

  @IsString()
  displayName!: string;

  @IsString()
  description!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsInt()
  videosPerMonth!: number;

  @IsBoolean()
  hasAllTemplates!: boolean;

  @IsBoolean()
  hasCustomPrompts!: boolean;

  @IsBoolean()
  hasPriorityProcessing!: boolean;

  @Type(() => Number)
  @IsInt()
  sortOrder!: number;
}
