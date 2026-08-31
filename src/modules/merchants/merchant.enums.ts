export enum MerchantStatus {
  CREATED = 'CREATED',
  KYC_PENDING = 'KYC_PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  REJECTED = 'REJECTED',
}

export enum MerchantTier {
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  DIAMOND = 'DIAMOND',
}

export enum FeeType {
  FIXED = 'FIXED',
  PERCENTAGE = 'PERCENTAGE',
  TIERED = 'TIERED',
}
