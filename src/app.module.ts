import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './common/config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { BeneficiariesModule } from './modules/beneficiaries/beneficiaries.module';
import { FineractModule } from './integrations/fineract/fineract.module';
import { HealthModule } from './modules/health/health.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { PortalModule } from './modules/portal/portal.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        ssl:
          config.get<boolean>('database.ssl') === true
            ? { rejectUnauthorized: false }
            : false,
        autoLoadEntities: true,
        synchronize: config.get<boolean>('database.synchronize') === true,
        logging: ['error'],
      }),
    }),
    FineractModule,
    AuthModule,
    HealthModule,
    OrganizationsModule,
    WalletModule,
    MerchantsModule,
    PayoutsModule,
    BeneficiariesModule,
    NotificationsModule,
    WebhooksModule,
    AuditModule,
    PortalModule,
  ],
})
export class AppModule {}
