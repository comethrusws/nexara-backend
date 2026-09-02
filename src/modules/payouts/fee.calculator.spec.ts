import { FeeType, MerchantChannel } from '../merchants/merchant.enums';
import { calculatePayoutCharges, calculateMultiLayerCommission } from './fee.calculator';

describe('calculatePayoutCharges', () => {
  it('applies a fixed fee and GST before blocking funds', () => {
    const charges = calculatePayoutCharges({
      payoutAmount: '20000.00',
      feeType: FeeType.FIXED,
      feeValue: '10.00',
      gstPercent: '18.00',
    });
    expect(charges).toEqual({
      payoutAmount: '20000.00',
      fee: '10.00',
      gst: '1.80',
      reserved: '20011.80',
      appliedSlab: undefined,
    });
  });

  it('applies a percentage fee', () => {
    const charges = calculatePayoutCharges({
      payoutAmount: '10000.00',
      feeType: FeeType.PERCENTAGE,
      feeValue: '1.00',
      gstPercent: '18.00',
    });
    expect(charges.fee).toBe('100.00');
    expect(charges.gst).toBe('18.00');
    expect(charges.reserved).toBe('10118.00');
  });

  it('calculates Merchant Slab fees (₹100-1000: ₹6 / 0.9%, ₹1k-2k: ₹10 / 1%)', () => {
    const slab1Fixed = calculatePayoutCharges({
      payoutAmount: '500.00',
      feeType: FeeType.SLAB,
      feeValue: '0',
      gstPercent: '18.00',
    });
    expect(slab1Fixed.fee).toBe('6.00');
    expect(slab1Fixed.gst).toBe('1.08');

    const slab1Pct = calculatePayoutCharges({
      payoutAmount: '500.00',
      feeType: FeeType.SLAB,
      feeValue: '0',
      gstPercent: '18.00',
      preferPercentageForSlab: true,
    });
    expect(slab1Pct.fee).toBe('4.50'); // 0.9% of 500 = 4.50

    const slab2Fixed = calculatePayoutCharges({
      payoutAmount: '1500.00',
      feeType: FeeType.SLAB,
      feeValue: '0',
      gstPercent: '18.00',
    });
    expect(slab2Fixed.fee).toBe('10.00');
    expect(slab2Fixed.gst).toBe('1.80');
  });

  it('calculates API Pricing Slabs (₹100-25k: ₹12 + 18%, >25k: ₹20 + 18%)', () => {
    const apiSlab1 = calculatePayoutCharges({
      payoutAmount: '10000.00',
      feeType: FeeType.API_SLAB,
      feeValue: '0',
      gstPercent: '18.00',
    });
    expect(apiSlab1.fee).toBe('12.00');
    expect(apiSlab1.gst).toBe('2.16'); // 18% of 12 = 2.16

    const apiSlab2 = calculatePayoutCharges({
      payoutAmount: '30000.00',
      feeType: FeeType.API_SLAB,
      feeValue: '0',
      gstPercent: '18.00',
    });
    expect(apiSlab2.fee).toBe('20.00');
    expect(apiSlab2.gst).toBe('3.60'); // 18% of 20 = 3.60
  });

  it('calculates 3-Layer Commission Distribution (Dist 0.2%, Super Dist 0.025%, Master 0.010%)', () => {
    const commission = calculateMultiLayerCommission({
      transactionAmount: '100000.00',
      distributorCommissionPercent: '0.20',
      superDistributorCommissionPercent: '0.025',
      masterDistributorCommissionPercent: '0.010',
    });
    expect(commission.layer1DistributorCommission).toBe('200.00');
    expect(commission.layer2SuperDistributorCommission).toBe('25.00');
    expect(commission.layer3MasterCommission).toBe('10.00');
    expect(commission.totalCommission).toBe('235.00');
  });
});
