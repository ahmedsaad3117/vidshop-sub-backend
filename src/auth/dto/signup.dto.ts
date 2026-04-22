import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email!: string;

  @MinLength(8)
  @MaxLength(64)
  password!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsNotEmpty({ message: 'Website URL is required' })
  @IsString()
  websiteUrl!: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  deviceInfo?: Record<string, any>;
}
