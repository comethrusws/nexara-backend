export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  database: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5434', 10),
    username: process.env.DATABASE_USER ?? 'nexara',
    password: process.env.DATABASE_PASSWORD ?? 'nexara',
    name: process.env.DATABASE_NAME ?? 'nexara',
    synchronize: process.env.DATABASE_SYNC === 'true',
    ssl: process.env.DATABASE_SSL === 'true',
  },
  fineract: {
    baseUrl:
      process.env.FINERACT_BASE_URL ??
      'https://localhost:8443/fineract-provider/api/v1',
    tenantId: process.env.FINERACT_TENANT_ID ?? 'default',
    username: process.env.FINERACT_USERNAME ?? 'nexara-api',
    password: process.env.FINERACT_PASSWORD ?? '',
    tlsInsecure: process.env.FINERACT_TLS_INSECURE !== 'false',
    officeId: parseInt(process.env.FINERACT_OFFICE_ID ?? '1', 10),
    savingsProductId: parseInt(
      process.env.FINERACT_SAVINGS_PRODUCT_ID ?? '3',
      10,
    ),
    clientTypeId: parseInt(process.env.FINERACT_CLIENT_TYPE_ID ?? '23', 10),
    legalFormId: parseInt(process.env.FINERACT_LEGAL_FORM_ID ?? '2', 10),
    paymentTypes: {
      walletFunding: parseInt(process.env.FINERACT_PT_WALLET_FUNDING ?? '4', 10),
      payout: parseInt(process.env.FINERACT_PT_PAYOUT ?? '5', 10),
      payoutFee: parseInt(process.env.FINERACT_PT_PAYOUT_FEE ?? '6', 10),
      gst: parseInt(process.env.FINERACT_PT_GST ?? '7', 10),
      reversal: parseInt(process.env.FINERACT_PT_REVERSAL ?? '8', 10),
      manualAdjustment: parseInt(
        process.env.FINERACT_PT_MANUAL_ADJUSTMENT ?? '9',
        10,
      ),
    },
  },
  kyc: {
    provider: (process.env.KYC_PROVIDER ?? 'mock').toLowerCase(),
    digilocker: {
      baseUrl: process.env.DIGILOCKER_BASE_URL ?? '',
      clientId: process.env.DIGILOCKER_CLIENT_ID ?? '',
      clientSecret: process.env.DIGILOCKER_CLIENT_SECRET ?? '',
    },
  },
  bank: {
    provider: (process.env.BANK_PROVIDER ?? 'mock').toLowerCase(),
    yesbank: {
      baseUrl: process.env.YESBANK_BASE_URL ?? '',
      clientId: process.env.YESBANK_CLIENT_ID ?? '',
      clientSecret: process.env.YESBANK_CLIENT_SECRET ?? '',
    },
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? 'local').toLowerCase(),
    s3: {
      region: process.env.AWS_REGION ?? process.env.S3_REGION ?? 'ap-south-1',
      bucket: process.env.S3_BUCKET ?? '',
      accessKeyId:
        process.env.AWS_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey:
        process.env.AWS_SECRET_ACCESS_KEY ??
        process.env.S3_SECRET_ACCESS_KEY ??
        '',
      endpoint: process.env.S3_ENDPOINT ?? '',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? '',
    },
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? 'nexara-dev-jwt-secret',
    adminEmail: process.env.AUTH_ADMIN_EMAIL ?? 'admin@nexara.com',
    opsEmail: process.env.AUTH_OPS_EMAIL ?? 'ops@nexara.com',
    adminPassword: process.env.AUTH_ADMIN_PASSWORD ?? 'NexaraAdmin#2026',
    merchantDefaultPassword:
      process.env.AUTH_MERCHANT_DEFAULT_PASSWORD ?? 'ChangeMe#2026',
    otpCode: process.env.AUTH_OTP_CODE ?? '123456',
  },
  ifsc: {
    lookupUrl: process.env.BANK_IFSC_LOOKUP_URL ?? 'https://ifsc.razorpay.com',
  },
});
