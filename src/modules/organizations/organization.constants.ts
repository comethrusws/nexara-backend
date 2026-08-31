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

export const BANK_RAIL_METADATA: Record<
  string,
  {
    railId: string;
    provider: string;
    priority: number;
    supportedModes: string[];
    avgClearingTime: string;
    uptimePercent: number;
    successRate: number;
    dailyCapacity: string;
  }
> = {
  MOCK: {
    railId: 'YES_BANK_NODAL',
    provider: 'Mock Bank (dev)',
    priority: 1,
    supportedModes: ['IMPS', 'NEFT', 'RTGS', 'UPI'],
    avgClearingTime: '< 2s',
    uptimePercent: 99.99,
    successRate: 99.98,
    dailyCapacity: '₹500,000,000',
  },
  YESBANK: {
    railId: 'YES_BANK_NODAL',
    provider: 'YES Bank',
    priority: 1,
    supportedModes: ['IMPS', 'NEFT', 'RTGS', 'UPI'],
    avgClearingTime: '< 2.4s',
    uptimePercent: 99.95,
    successRate: 99.9,
    dailyCapacity: '₹500,000,000',
  },
  ICICI: {
    railId: 'ICICI_CORPORATE',
    provider: 'ICICI Bank',
    priority: 2,
    supportedModes: ['IMPS', 'NEFT', 'RTGS'],
    avgClearingTime: '< 3s',
    uptimePercent: 99.9,
    successRate: 99.5,
    dailyCapacity: '₹300,000,000',
  },
  HDFC: {
    railId: 'HDFC_SMARTHUB',
    provider: 'HDFC Bank',
    priority: 3,
    supportedModes: ['IMPS', 'NEFT', 'RTGS', 'UPI'],
    avgClearingTime: '< 3.5s',
    uptimePercent: 99.85,
    successRate: 99.4,
    dailyCapacity: '₹250,000,000',
  },
  KOTAK: {
    railId: 'AXIS_DIRECT',
    provider: 'Kotak Mahindra Bank',
    priority: 4,
    supportedModes: ['IMPS', 'NEFT', 'RTGS'],
    avgClearingTime: '< 4s',
    uptimePercent: 99.8,
    successRate: 99.2,
    dailyCapacity: '₹200,000,000',
  },
};
