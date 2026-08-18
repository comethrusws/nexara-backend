export const OrganizationType = {
  ADMIN: 'ADMIN',
  SUPER_DISTRIBUTOR: 'SUPER_DISTRIBUTOR',
  DISTRIBUTOR: 'DISTRIBUTOR',
  MERCHANT: 'MERCHANT',
} as const;

export type OrganizationType =
  (typeof OrganizationType)[keyof typeof OrganizationType];

export const OrganizationStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

export type OrganizationStatus =
  (typeof OrganizationStatus)[keyof typeof OrganizationStatus];

export const Features = {
  WALLET: 'WALLET',
  STATEMENT: 'STATEMENT',
  PAYOUT: 'PAYOUT',
  PAYOUT_IMPS: 'PAYOUT_IMPS',
  PAYOUT_NEFT: 'PAYOUT_NEFT',
  PAYOUT_RTGS: 'PAYOUT_RTGS',
  PAYOUT_UPI: 'PAYOUT_UPI',
} as const;

export type FeatureCode = (typeof Features)[keyof typeof Features];

export const FEATURE_CATALOG: Array<{ code: FeatureCode; name: string }> = [
  { code: Features.WALLET, name: 'Merchant wallet' },
  { code: Features.STATEMENT, name: 'Wallet statement' },
  { code: Features.PAYOUT, name: 'Payouts' },
  { code: Features.PAYOUT_IMPS, name: 'IMPS payouts' },
  { code: Features.PAYOUT_NEFT, name: 'NEFT payouts' },
  { code: Features.PAYOUT_RTGS, name: 'RTGS payouts' },
  { code: Features.PAYOUT_UPI, name: 'UPI payouts' },
];

export const BankCodes = {
  MOCK: 'MOCK',
  YESBANK: 'YESBANK',
  HDFC: 'HDFC',
  KOTAK: 'KOTAK',
  ICICI: 'ICICI',
} as const;

export type BankCode = (typeof BankCodes)[keyof typeof BankCodes];

export const BANK_CATALOG: Array<{ code: BankCode; name: string }> = [
  { code: BankCodes.MOCK, name: 'Mock bank (local/dev)' },
  { code: BankCodes.YESBANK, name: 'YES Bank' },
  { code: BankCodes.HDFC, name: 'HDFC Bank' },
  { code: BankCodes.KOTAK, name: 'Kotak Mahindra Bank' },
  { code: BankCodes.ICICI, name: 'ICICI Bank' },
];

export const ALLOWED_CHILDREN: Record<OrganizationType, OrganizationType[]> = {
  ADMIN: ['SUPER_DISTRIBUTOR', 'DISTRIBUTOR', 'MERCHANT'],
  SUPER_DISTRIBUTOR: ['DISTRIBUTOR', 'MERCHANT'],
  DISTRIBUTOR: ['MERCHANT'],
  MERCHANT: [],
};

export function railFeature(paymentMode: string): FeatureCode {
  switch (paymentMode) {
    case 'IMPS':
      return Features.PAYOUT_IMPS;
    case 'NEFT':
      return Features.PAYOUT_NEFT;
    case 'RTGS':
      return Features.PAYOUT_RTGS;
    case 'UPI':
      return Features.PAYOUT_UPI;
    default:
      return Features.PAYOUT;
  }
}
