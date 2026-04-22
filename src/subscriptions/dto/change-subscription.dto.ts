import { IsUUID } from 'class-validator';

export class ChangeSubscriptionDto {
  @IsUUID()
  tierId!: string;
}
