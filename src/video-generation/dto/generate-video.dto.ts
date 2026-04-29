import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class GenerateVideoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  productTitle!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  productDescription!: string;

  @IsOptional()
  @IsUrl()
  productImageUrl?: string;

  @ValidateIf((obj: GenerateVideoDto) => !obj.customPrompt)
  @IsUUID()
  @IsOptional()
  templateId?: string;

  @ValidateIf((obj: GenerateVideoDto) => !obj.templateId)
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  customPrompt?: string;
}
