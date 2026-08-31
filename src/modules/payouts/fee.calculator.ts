import { addAmounts, fromCents, toCents } from '../../common/money/money';
import { FeeType } from '../merchants/merchant.enums';

export interface PayoutCharges {
  payoutAmount: string;
  fee: string;
  gst: string;
  reserved: string;
}

export function calculatePayoutCharges(input: {
  payoutAmount: string;
  feeType: FeeType;
  feeValue: string;
  gstPercent: string;
  feeTiersJson?: string | null;
}): PayoutCharges {
  const payoutCents = toCents(input.payoutAmount);
  let feeCents: number;

  if (input.feeType === FeeType.PERCENTAGE) {
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
  };
}

function resolveTieredFeeCents(
  feeTiersJson: string | null | undefined,
  fallbackFeeValue: string,
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
