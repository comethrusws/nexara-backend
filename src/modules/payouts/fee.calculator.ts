import { addAmounts, fromCents, toCents } from '../../common/money/money';
import { FeeType, MerchantChannel } from '../merchants/merchant.enums';

export interface FeeSlabRule {
  minAmount: number;
  maxAmount: number;
  flatFee?: number | string;
  percentFee?: number | string;
  type?: 'FIXED' | 'PERCENTAGE';
}

export interface PayoutCharges {
  payoutAmount: string;
  fee: string;
  gst: string;
  reserved: string;
  appliedSlab?: string;
}

export interface MultiLayerCommission {
  transactionAmount: string;
  layer1DistributorCommission: string;
  layer2SuperDistributorCommission: string;
  layer3MasterCommission: string;
  totalCommission: string;
}

export function calculatePayoutCharges(input: {
  payoutAmount: string;
  feeType: FeeType;
  feeValue: string;
  gstPercent: string;
  feeTiersJson?: string | null;
  feeSlabsJson?: string | null;
  channel?: MerchantChannel;
  preferPercentageForSlab?: boolean;
}): PayoutCharges {
  const payoutCents = toCents(input.payoutAmount);
  const amountRupees = payoutCents / 100;
  let feeCents: number;
  let appliedSlab: string | undefined;

  if (input.feeType === FeeType.SLAB) {
    const slabResult = resolveSlabFeeCents(
      input.feeSlabsJson,
      amountRupees,
      payoutCents,
      input.preferPercentageForSlab ?? false
    );
    feeCents = slabResult.feeCents;
    appliedSlab = slabResult.slabDescription;
  } else if (input.feeType === FeeType.API_SLAB || input.channel === MerchantChannel.API) {
    const apiSlabResult = resolveApiSlabFeeCents(
      amountRupees,
      payoutCents,
      input.preferPercentageForSlab ?? false,
      input.feeSlabsJson,
    );
    feeCents = apiSlabResult.feeCents;
    appliedSlab = apiSlabResult.slabDescription;
  } else if (input.feeType === FeeType.PERCENTAGE) {
    feeCents = Math.round((payoutCents * toCents(input.feeValue)) / 10000);
  } else if (input.feeType === FeeType.TIERED) {
    feeCents = resolveTieredFeeCents(input.feeTiersJson, input.feeValue);
  } else {
    feeCents = toCents(input.feeValue);
  }

  const gstCents = Math.round((feeCents * toCents(input.gstPercent)) / 10000);
  const fee = fromCents(feeCents);
  const gst = fromCents(gstCents);

  return {
    payoutAmount: fromCents(payoutCents),
    fee,
    gst,
    reserved: addAmounts(fromCents(payoutCents), fee, gst),
    appliedSlab,
  };
}

function matchCustomSlab(
  feeSlabsJson: string | null | undefined,
  amountRupees: number,
  payoutCents: number,
  preferPercentage: boolean,
  labelPrefix: string,
): { feeCents: number; slabDescription: string } | null {
  let customSlabs: FeeSlabRule[] = [];
  if (feeSlabsJson) {
    try {
      const parsed = JSON.parse(feeSlabsJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        customSlabs = parsed;
      }
    } catch {
      // fallback to default slabs below
    }
  }
  if (customSlabs.length === 0) {
    return null;
  }
  const matched = customSlabs.find(
    (s) =>
      amountRupees >= s.minAmount &&
      (s.maxAmount === 0 || amountRupees <= s.maxAmount),
  );
  if (!matched) {
    return null;
  }
  const range = `${matched.minAmount}-${matched.maxAmount || '∞'}`;
  if (
    (preferPercentage || matched.type === 'PERCENTAGE') &&
    matched.percentFee != null
  ) {
    const pctCents = toCents(String(matched.percentFee));
    return {
      feeCents: Math.round((payoutCents * pctCents) / 10000),
      slabDescription: `${labelPrefix}${range}: ${matched.percentFee}%`,
    };
  }
  if (matched.flatFee != null) {
    return {
      feeCents: toCents(String(matched.flatFee)),
      slabDescription: `${labelPrefix}${range}: ₹${matched.flatFee}`,
    };
  }
  return null;
}

export function resolveSlabFeeCents(
  feeSlabsJson: string | null | undefined,
  amountRupees: number,
  payoutCents: number,
  preferPercentage: boolean
): { feeCents: number; slabDescription: string } {
  const custom = matchCustomSlab(
    feeSlabsJson,
    amountRupees,
    payoutCents,
    preferPercentage,
    'Slab ₹'
  );
  if (custom) {
    return custom;
  }

  // Default Standard Merchant Slabs:
  // ₹100 - ₹1,000: ₹6 OR 0.9%
  // ₹1,000 - ₹2,000: ₹10 OR 1.0%
  // > ₹2,000: ₹15 OR 1.2%
  if (amountRupees >= 100 && amountRupees <= 1000) {
    if (preferPercentage) {
      return {
        feeCents: Math.round((payoutCents * 90) / 10000), // 0.90%
        slabDescription: 'Slab ₹100-1000: 0.9%',
      };
    }
    return {
      feeCents: 600, // ₹6.00
      slabDescription: 'Slab ₹100-1000: ₹6.00',
    };
  } else if (amountRupees > 1000 && amountRupees <= 2000) {
    if (preferPercentage) {
      return {
        feeCents: Math.round((payoutCents * 100) / 10000), // 1.00%
        slabDescription: 'Slab ₹1k-2k: 1.0%',
      };
    }
    return {
      feeCents: 1000, // ₹10.00
      slabDescription: 'Slab ₹1k-2k: ₹10.00',
    };
  } else if (amountRupees > 2000) {
    if (preferPercentage) {
      return {
        feeCents: Math.round((payoutCents * 120) / 10000), // 1.20%
        slabDescription: 'Slab >₹2k: 1.2%',
      };
    }
    return {
      feeCents: 1500, // ₹15.00
      slabDescription: 'Slab >₹2k: ₹15.00',
    };
  }

  // Under ₹100 fallback
  return {
    feeCents: 300,
    slabDescription: 'Slab <₹100: ₹3.00',
  };
}

export function resolveApiSlabFeeCents(
  amountRupees: number,
  payoutCents: number,
  preferPercentage: boolean,
  feeSlabsJson?: string | null,
): { feeCents: number; slabDescription: string } {
  const custom = matchCustomSlab(
    feeSlabsJson,
    amountRupees,
    payoutCents,
    preferPercentage,
    'API Slab ₹'
  );
  if (custom) {
    return {
      feeCents: custom.feeCents,
      slabDescription: `${custom.slabDescription} + 18% GST`,
    };
  }
  // API Pricing Slabs:
  // Slab 1 (₹100 - ₹25,000): Amt + GST = ₹12 + 18% GST  OR  1.0% + 18% GST
  // Slab 2 (> ₹25,000): Amt + GST = ₹20 + 18% GST  OR  1.5% + 18% GST
  if (amountRupees <= 25000) {
    if (preferPercentage) {
      return {
        feeCents: Math.round((payoutCents * 100) / 10000), // 1.0%
        slabDescription: 'API Slab ₹100-25k: 1.0% + 18% GST',
      };
    }
    return {
      feeCents: 1200, // ₹12.00
      slabDescription: 'API Slab ₹100-25k: ₹12 + 18% GST',
    };
  } else {
    if (preferPercentage) {
      return {
        feeCents: Math.round((payoutCents * 150) / 10000), // 1.5%
        slabDescription: 'API Slab >₹25k: 1.5% + 18% GST',
      };
    }
    return {
      feeCents: 2000, // ₹20.00
      slabDescription: 'API Slab >₹25k: ₹20 + 18% GST',
    };
  }
}

export function calculateMultiLayerCommission(input: {
  transactionAmount: string;
  distributorCommissionPercent?: string;
  superDistributorCommissionPercent?: string;
  masterDistributorCommissionPercent?: string;
}): MultiLayerCommission {
  const txCents = toCents(input.transactionAmount);

  const distPct = parseFloat(input.distributorCommissionPercent || '0.20');
  const superPct = parseFloat(input.superDistributorCommissionPercent || '0.025');
  const masterPct = parseFloat(input.masterDistributorCommissionPercent || '0.010');

  const layer1Cents = Math.round((txCents * distPct) / 100);
  const layer2Cents = Math.round((txCents * superPct) / 100);
  const layer3Cents = Math.round((txCents * masterPct) / 100);

  const totalCents = layer1Cents + layer2Cents + layer3Cents;

  return {
    transactionAmount: fromCents(txCents),
    layer1DistributorCommission: fromCents(layer1Cents),
    layer2SuperDistributorCommission: fromCents(layer2Cents),
    layer3MasterCommission: fromCents(layer3Cents),
    totalCommission: fromCents(totalCents),
  };
}

function resolveTieredFeeCents(
  feeTiersJson: string | null | undefined,
  fallbackFeeValue: string
): number {
  if (feeTiersJson) {
    try {
      const tiers = JSON.parse(feeTiersJson) as Array<{ feePerTx?: number }>;
      if (Array.isArray(tiers) && tiers.length > 0 && tiers[0].feePerTx != null) {
        return toCents(String(tiers[0].feePerTx));
      }
    } catch {
      // fall through
    }
  }
  return toCents(fallbackFeeValue);
}
