export type PaymentMode = 'IMPS' | 'NEFT' | 'RTGS' | 'UPI';

export type BankPayoutStatus =
  | 'ACCEPTED'
  | 'SUCCESS'
  | 'FAILED'
  | 'UNKNOWN';

export interface Beneficiary {
  name: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  vpa?: string;
  paymentMode: PaymentMode;
}

export interface InitiatePayoutInput {
  nexaraPayoutId: string;
  merchantReference: string;
  amount: string;
  beneficiary: Beneficiary;
}

export interface BankPayoutResult {
  bankReference: string;
  status: BankPayoutStatus;
  failureReason?: string;
  provider: string;
}

export interface BankPort {
  validateBeneficiary(beneficiary: Beneficiary): Promise<void>;
  initiatePayout(input: InitiatePayoutInput): Promise<BankPayoutResult>;
  getPayoutStatus(bankReference: string): Promise<BankPayoutResult>;
}

export const BANK_PORT = Symbol('BANK_PORT');
