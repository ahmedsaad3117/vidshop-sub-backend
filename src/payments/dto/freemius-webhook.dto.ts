import { IsObject, IsOptional, IsString } from 'class-validator';

export class FreemiusWebhookDto {
  @IsString()
  id!: string;

  @IsString()
  type!: string;

  @IsString()
  plugin_id!: string;

  @IsOptional()
  @IsString()
  install_id?: string;

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsString()
  license_id?: string;

  @IsOptional()
  @IsString()
  plan_id?: string;

  @IsObject()
  data!: Record<string, unknown>;

  @IsString()
  created!: string;
}
