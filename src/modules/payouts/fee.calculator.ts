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
}): PayoutCharges {
  const payoutCents = toCents(input.payoutAmount);
  const feeCents =
    input.feeType === FeeType.PERCENTAGE
      ? Math.round((payoutCents * toCents(input.feeValue)) / 10000)
      : toCents(input.feeValue);
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
