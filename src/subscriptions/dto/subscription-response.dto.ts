import { Subscription, SubscriptionTier, UsageRecord } from '../../entities';

export class SubscriptionResponseDto {
  subscription!: Subscription;
  tier!: SubscriptionTier;
  usage!: UsageRecord | null;
}
