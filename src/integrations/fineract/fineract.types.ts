export interface WalletBalances {
  total: string;
  blocked: string;
  available: string;
}

export interface OpenedWallet {
  fineractClientId: number;
  fineractSavingsAccountId: number;
  fineractExternalId: string;
}

export interface OpenMerchantWalletInput {
  merchantId: string;
  businessName: string;
  mobileNo?: string;
}

export interface CreditWalletInput {
  savingsAccountId: number;
  amount: string;
  receiptNumber: string;
  note?: string;
}

export interface BlockFundsInput {
  savingsAccountId: number;
  amount: string;
  reason: string;
}

export interface ReleaseFundsInput {
  savingsAccountId: number;
  holdTransactionId: number;
}

export interface DebitWalletInput {
  savingsAccountId: number;
  amount: string;
  receiptNumber: string;
  note?: string;
}

export interface FinalizeSuccessfulPayoutInput {
  savingsAccountId: number;
  holdTransactionId: number;
  payoutAmount: string;
  feeAmount: string;
  gstAmount: string;
  receiptNumber: string;
  payoutNote?: string;
}

export interface LedgerPosting {
  fineractTransactionId: number;
}

export interface StatementLine {
  transactionId: number;
  date: string;
  amount: string;
  type: 'CREDIT' | 'DEBIT' | 'HOLD' | 'RELEASE' | 'OTHER';
  reversed: boolean;
  receiptNumber?: string;
  note?: string;
  runningBalance?: string;
}

export interface FineractPort {
  ping(): Promise<void>;
  openMerchantWallet(input: OpenMerchantWalletInput): Promise<OpenedWallet>;
  getBalances(savingsAccountId: number): Promise<WalletBalances>;
  creditWallet(input: CreditWalletInput): Promise<LedgerPosting>;
  blockFunds(input: BlockFundsInput): Promise<LedgerPosting>;
  releaseFunds(input: ReleaseFundsInput): Promise<LedgerPosting>;
  debitPayout(input: DebitWalletInput): Promise<LedgerPosting>;
  chargeFee(input: DebitWalletInput): Promise<LedgerPosting>;
  chargeGst(input: DebitWalletInput): Promise<LedgerPosting>;
  finalizeSuccessfulPayout(
    input: FinalizeSuccessfulPayoutInput,
  ): Promise<void>;
  getStatement(savingsAccountId: number): Promise<StatementLine[]>;
}

export const FINERACT_PORT = Symbol('FINERACT_PORT');
