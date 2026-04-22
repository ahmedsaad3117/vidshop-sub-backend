export class CheckoutConfigDto {
  pluginId!: string;
  publicKey!: string;
  planId!: string;
  pricingId!: string;
  userEmail!: string;
  userName!: string;
  successUrl?: string;
  cancelUrl?: string;
}
