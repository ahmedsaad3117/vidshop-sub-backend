import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { PromptCategory, PromptTier } from '../../entities';

export class CreateTemplateDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsString()
  promptText!: string;

  @IsEnum(PromptCategory)
  category!: PromptCategory;

  @IsEnum(PromptTier)
  tier!: PromptTier;

  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @IsOptional()
  @IsUrl()
  exampleVideoUrl?: string;

  @IsOptional()
  sortOrder?: number;
}
