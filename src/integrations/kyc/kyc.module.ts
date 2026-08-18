import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DigilockerKycAdapter } from './digilocker/digilocker.adapter';
import { KYC_PORT } from './kyc.types';
import { MockKycAdapter } from './mock-kyc.adapter';

@Module({
  providers: [
    MockKycAdapter,
    DigilockerKycAdapter,
    {
      provide: KYC_PORT,
      inject: [ConfigService, MockKycAdapter, DigilockerKycAdapter],
      useFactory: (
        config: ConfigService,
        mock: MockKycAdapter,
        digilocker: DigilockerKycAdapter,
      ) => {
        return config.get<string>('kyc.provider') === 'digilocker'
          ? digilocker
          : mock;
      },
    },
  ],
  exports: [KYC_PORT],
})
export class KycModule {}
