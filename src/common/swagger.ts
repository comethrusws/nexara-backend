import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { BeneficiaryDto } from '../modules/payouts/dto/payout.dto';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Nexara API')
    .setDescription(
      [
        'Payment orchestration API. Nest owns merchants, KYC, hierarchy, payout orders, and bank routing.',
        'Apache Fineract is the wallet ledger (balances and statement).',
        '',
        'Use **Authorize** with the `accessToken` from `POST /v1/auth/login`.',
        'Staff: `admin@nexara.com` / `NexaraAdmin#2026`.',
        '',
        'Written guide: `docs/END-TO-END.md`.',
      ].join('\n\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [BeneficiaryDto],
  });
  SwaggerModule.setup('docs', app, document);
}
