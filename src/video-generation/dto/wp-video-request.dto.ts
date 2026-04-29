import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class WpVideoRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsUrl()
  image?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category!: string;
}
