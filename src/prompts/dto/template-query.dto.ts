import { IsEnum, IsOptional } from 'class-validator';
import { PromptCategory } from '../../entities';

export class TemplateQueryDto {
  @IsOptional()
  @IsEnum(PromptCategory)
  category?: PromptCategory;
}
