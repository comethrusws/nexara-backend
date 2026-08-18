import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'node:https';
import { FineractAdapter } from './fineract.adapter';
import { FineractClient } from './fineract.client';
import { FINERACT_PORT } from './fineract.types';

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const tlsInsecure = config.get<boolean>('fineract.tlsInsecure') === true;
        return {
          baseURL: config.get<string>('fineract.baseUrl'),
          timeout: 20000,
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
    {
      provide: FINERACT_PORT,
      useExisting: FineractAdapter,
    },
  ],
  exports: [FINERACT_PORT, FineractAdapter],
})
export class FineractModule {}
