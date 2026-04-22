import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ActivatePurchaseDto {
  @IsString()
  @IsNotEmpty()
  licenseId!: string;

  @IsString()
  @IsNotEmpty()
  planId!: string;

  @IsString()
  @IsNotEmpty()
  pricingId!: string;

  @IsString()
  @IsNotEmpty()
  purchaseId!: string;

  @IsString()
  @IsNotEmpty()
  freemiusUserId!: string;

  @IsOptional()
  @IsString()
  licenseKey?: string;
}
