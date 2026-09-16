import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { maskAadhaar, maskPan } from './kyc.masking';
import {
  KycPort,
  KycVerificationResult,
  VerifyAadhaarInput,
  VerifyPanInput,
} from './kyc.types';

const AADHAAR_PATTERN = /^\d{12}$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export { maskAadhaar, maskPan } from './kyc.masking';

@Injectable()
export class MockKycAdapter implements KycPort {
  async verifyAadhaar(
    input: VerifyAadhaarInput,
  ): Promise<KycVerificationResult> {
    if (!AADHAAR_PATTERN.test(input.aadhaarNumber)) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Aadhaar number must be 12 digits',
      );
    }

    if (input.aadhaarNumber === '999999999999') {
      return {
        status: 'FAILED',
        provider: 'mock',
        providerReference: `mock-aadhaar-${randomUUID()}`,
        maskedValue: maskAadhaar(input.aadhaarNumber),
        failureReason: 'Mock DigiLocker rejected this Aadhaar',
      };
    }

    return {
      status: 'VERIFIED',
      provider: 'mock',
      providerReference: `mock-aadhaar-${randomUUID()}`,
      name: 'Authorised Person',
      maskedValue: maskAadhaar(input.aadhaarNumber),
    };
  }

  async verifyPan(input: VerifyPanInput): Promise<KycVerificationResult> {
    const pan = input.pan.toUpperCase();
    if (!PAN_PATTERN.test(pan)) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'PAN must match format ABCDE1234F',
      );
    }

    if (pan === 'AAAAA9999A') {
      return {
        status: 'FAILED',
        provider: 'mock',
        providerReference: `mock-pan-${randomUUID()}`,
        maskedValue: maskPan(pan),
        failureReason: 'Mock DigiLocker rejected this PAN',
      };
    }

    return {
      status: 'VERIFIED',
      provider: 'mock',
      providerReference: `mock-pan-${randomUUID()}`,
      name: input.name,
      maskedValue: maskPan(pan),
    };
  }
}
