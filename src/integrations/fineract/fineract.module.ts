import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'node:https';
import { FineractAdapter } from './fineract.adapter';
import { FineractClient } from './fineract.client';
import { MockFineractAdapter } from './fineract.mock';
import { FINERACT_PORT } from './fineract.types';

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const tlsInsecure = process.env.FINERACT_TLS_INSECURE !== 'false';
        return {
          baseURL: config.get<string>('fineract.baseUrl'),
          timeout: 20000,
          proxy: false,
          httpsAgent: tlsInsecure
            ? new https.Agent({ rejectUnauthorized: false })
            : undefined,
          auth: {
            username: config.get<string>('fineract.username') ?? '',
            password: config.get<string>('fineract.password') ?? '',
          },
          headers: {
            'Fineract-Platform-TenantId':
              config.get<string>('fineract.tenantId') ?? 'default',
            'Content-Type': 'application/json',
          },
        };
      },
    }),
  ],
  providers: [
    FineractClient,
    FineractAdapter,
    MockFineractAdapter,
    {
      provide: FINERACT_PORT,
      useFactory: (config: ConfigService, real: FineractAdapter, mock: MockFineractAdapter) => {
        const provider = config.get<string>('fineract.provider') || process.env.FINERACT_PROVIDER || 'mock';
        if (provider === 'mock') {
          return mock;
        }
        return real;
      },
      inject: [ConfigService, FineractAdapter, MockFineractAdapter],
    },
  ],
  exports: [FINERACT_PORT, FineractAdapter, MockFineractAdapter],
})
export class FineractModule {}

