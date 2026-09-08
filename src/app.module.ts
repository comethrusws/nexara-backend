import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './common/config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { BbpsModule } from './modules/bbps/bbps.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FeeEngineModule } from './modules/fee-engine/fee-engine.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { FineractModule } from './integrations/fineract/fineract.module';
import { HealthModule } from './modules/health/health.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { PortalModule } from './modules/portal/portal.module';
import { BeneficiariesModule } from './modules/beneficiaries/beneficiaries.module';
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
      useFactory: async (config: ConfigService) => {
        const ssl =
          config.get<boolean>('database.ssl') === true
            ? { rejectUnauthorized: false }
            : false;

        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { Client } = require('pg');
          const client = new Client({
            host: config.get<string>('database.host'),
            port: config.get<number>('database.port'),
            user: config.get<string>('database.username'),
            password: config.get<string>('database.password'),
            database: config.get<string>('database.name'),
            ssl,
          });
          await client.connect();
          try {
            await client.query(`
              DO $$
              BEGIN
                IF EXISTS (
                  SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'app_user' AND column_name = 'role'
                ) THEN
                  UPDATE "app_user" SET "role" = 'MERCHANT' WHERE "role" IS NULL;
                  ALTER TABLE "app_user" ALTER COLUMN "role" TYPE character varying(32);
                  ALTER TABLE "app_user" ALTER COLUMN "role" SET DEFAULT 'MERCHANT';
                END IF;
              END $$;
            `);
          } finally {
            await client.end().catch(() => {});
          }
        } catch (err: any) {
          console.warn('[TypeORM Pre-Sync] Note:', err?.message || err);
        }

        return {
          type: 'postgres',
          host: config.get<string>('database.host'),
          port: config.get<number>('database.port'),
          username: config.get<string>('database.username'),
          password: config.get<string>('database.password'),
          database: config.get<string>('database.name'),
          ssl,
          autoLoadEntities: true,
          synchronize: config.get<boolean>('database.synchronize') === true,
          logging: ['error'],
        };
      },
    }),
    FineractModule,
    AuthModule,
    HealthModule,
    OrganizationsModule,
    WalletModule,
    MerchantsModule,
    PayoutsModule,
    FeeEngineModule,
    DashboardModule,
    ReconciliationModule,
    BbpsModule,
    BeneficiariesModule,
    NotificationsModule,
    WebhooksModule,
    AuditModule,
    PortalModule,
  ],
})
export class AppModule {}
