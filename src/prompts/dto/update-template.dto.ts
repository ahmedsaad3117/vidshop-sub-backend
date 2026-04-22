import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { PromptCategory, PromptTier } from '../../entities';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  promptText?: string;

  @IsOptional()
  @IsEnum(PromptCategory)
  category?: PromptCategory;

  @IsOptional()
  @IsEnum(PromptTier)
  tier?: PromptTier;

  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @IsOptional()
  @IsUrl()
  exampleVideoUrl?: string;

  @IsOptional()
  sortOrder?: number;
}
