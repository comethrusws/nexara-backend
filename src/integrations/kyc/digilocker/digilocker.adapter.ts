import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCodes, NexaraError } from '../../../common/errors/nexara-error';
import {
  KycPort,
  KycVerificationResult,
  VerifyAadhaarInput,
  VerifyPanInput,
} from '../kyc.types';

@Injectable()
export class DigilockerKycAdapter implements KycPort {
  constructor(private readonly config: ConfigService) {}

  async verifyAadhaar(
    _input: VerifyAadhaarInput,
  ): Promise<KycVerificationResult> {
    this.ensureConfigured();
    throw this.notReady('Aadhaar');
  }

  async verifyPan(_input: VerifyPanInput): Promise<KycVerificationResult> {
    this.ensureConfigured();
    throw this.notReady('PAN');
  }

  private ensureConfigured(): void {
    const clientId = this.config.get<string>('kyc.digilocker.clientId') ?? '';
    const clientSecret =
      this.config.get<string>('kyc.digilocker.clientSecret') ?? '';
    if (!clientId || !clientSecret) {
      throw new NexaraError(
        ErrorCodes.KYC_NOT_CONFIGURED,
        'DigiLocker credentials are not configured',
        503,
      );
    }
  }

  private notReady(document: string): NexaraError {
    return new NexaraError(
      ErrorCodes.KYC_NOT_CONFIGURED,
      `DigiLocker ${document} verification will be enabled after API credentials are issued`,
      503,
    );
  }
}
