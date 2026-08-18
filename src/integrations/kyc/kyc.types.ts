export type KycStatus = 'PENDING' | 'VERIFIED' | 'FAILED';

export interface KycVerificationResult {
  status: 'VERIFIED' | 'FAILED';
  provider: 'mock' | 'digilocker';
  providerReference: string;
  name?: string;
  maskedValue: string;
  failureReason?: string;
}

export interface VerifyAadhaarInput {
  aadhaarNumber: string;
  merchantId: string;
}

export interface VerifyPanInput {
  pan: string;
  merchantId: string;
  name?: string;
}

export interface KycPort {
  verifyAadhaar(input: VerifyAadhaarInput): Promise<KycVerificationResult>;
  verifyPan(input: VerifyPanInput): Promise<KycVerificationResult>;
}

export const KYC_PORT = Symbol('KYC_PORT');
