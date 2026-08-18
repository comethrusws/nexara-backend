import { FeeType } from '../merchants/merchant.enums';
import { calculatePayoutCharges } from './fee.calculator';

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
});
