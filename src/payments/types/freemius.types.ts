export interface FreemiusLicenseResponse {
  id: string;
  plugin_id: string;
  user_id: string;
  plan_id: string;
  pricing_id: string;
  quota: number | null;
  activated: number;
  activated_local: number;
  expiration: string;
  is_cancelled: boolean;
  is_active: boolean;
  secret_key: string;
  install_id?: string;
}

export interface FreemiusSubscriptionResponse {
  id: string;
  user_id: string;
  install_id: string;
  plan_id: string;
  pricing_id: string;
  license_id: string;
  billing_cycle: number;
  currency: string;
  initial_amount: number;
  renewal_amount: number;
  next_payment: string;
  created: string;
  is_active: boolean;
}

export interface FreemiusPlanResponse {
  id: string;
  name: string;
  title: string;
  is_free: boolean;
  features: Record<string, unknown>;
}

export interface FreemiusUserResponse {
  id: string;
  email: string;
  first: string;
  last: string;
  is_verified: boolean;
}

export interface FreemiusWebhookEvent {
  id: string;
  type: string;
  plugin_id: string;
  install_id?: string;
  user_id?: string;
  license_id?: string;
  plan_id?: string;
  data: Record<string, unknown>;
  created: string;
}
