import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ErrorCodes } from '../../common/errors/nexara-error';
import { KYC_PORT } from '../../integrations/kyc/kyc.types';
import { OBJECT_STORAGE } from '../../integrations/storage/storage.types';
import { UsersService } from '../auth/users.service';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { FeeEngineService } from '../fee-engine/fee-engine.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { WalletService } from '../wallet/wallet.service';
import { Payout } from '../payouts/entities/payout.entity';
import { Merchant } from './entities/merchant.entity';
import { MerchantKyc } from './entities/merchant-kyc.entity';
import { MerchantStatus } from './merchant.enums';
import { MerchantsService } from './merchants.service';
import { AgreementService } from './agreement/agreement.service';
import { getCurrentAgreement } from './agreement/agreement-text';

describe('MerchantsService', () => {
  const merchants = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const kycRecords = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const kyc = {
    verifyAadhaar: jest.fn(),
    verifyPan: jest.fn(),
  };
  const wallets = {
    openWallet: jest.fn(),
    findMappedMerchantIds: jest.fn().mockResolvedValue(new Set()),
  };
  const storage = {
    putObject: jest.fn(({ key }: { key: string }) => ({
      key,
      url: `s3://test/${key}`,
    })),
    getObject: jest.fn((key: string) => ({
      body: Buffer.from(key),
      contentType: 'image/jpeg',
    })),
  };
  const organizations = {
    ensureSeeded: jest.fn(),
    createMerchantOrganization: jest.fn(),
    get: jest.fn(),
    rawByIds: jest.fn().mockResolvedValue([]),
    list: jest.fn().mockResolvedValue([]),
    assertAncestorsActive: jest.fn(),
    assertFeature: jest.fn(),
    updateContactDetails: jest.fn(),
    getDescendantOrgIds: jest.fn().mockResolvedValue([]),
    isDescendant: jest.fn().mockResolvedValue(true),
    reassignParent: jest.fn(),
    children: jest.fn().mockResolvedValue([]),
  };

  let service: MerchantsService;
  const users = {
    createMerchantUser: jest.fn(),
    findByMobile: jest.fn(),
    updateMerchantProfile: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const agreement = {
    getCurrent: jest.fn(),
    renderSignedPdf: jest
      .fn()
      .mockResolvedValue(Buffer.from('%PDF-fake-signed')),
  };
  const merchant: Merchant = {
    id: 'm1',
    businessName: 'Acme',
    contactPerson: 'Ravi',
    mobile: '9876543210',
    email: 'ops@acme.test',
    address: 'Mumbai',
    status: MerchantStatus.KYC_PENDING,
    dailyPayoutLimit: '1000000.00',
    feeType: 'FIXED' as Merchant['feeType'],
    feeValue: '10.00',
    gstPercent: '18.00',
    perPayoutLimit: null,
    tier: 'SILVER' as Merchant['tier'],
    feeTiersJson: null,
    feeSlabsJson: null,
    distributorCommissionPercent: '0.20',
    superDistributorCommissionPercent: '0.025',
    masterDistributorCommissionPercent: '0.010',
    channel: 'STANDARD' as Merchant['channel'],
    enabledServicesJson: null,
    organizationId: 'org-1',
    organization: null,
    kyc: {
      aadhaarStatus: 'VERIFIED',
      panStatus: 'VERIFIED',
      aadhaarImageMatch: 'MATCHED',
      panImageMatch: 'MATCHED',
      aadhaarFrontPath: 's3://test/kyc/m1/aadhaar-front.jpg',
      panImagePath: 's3://test/kyc/m1/pan.jpg',
      selfiePath: 's3://test/kyc/m1/selfie.jpg',
      shopType: 'kirana',
      latitude: '28.6139',
      longitude: '77.2090',
      agreementSignedAt: new Date(),
      agreementVersion: '2026.1',
      agreementSha256: 'deadbeef',
      signatureMethod: 'PAPER_UPLOAD',
      signedCopyPath: 's3://test/kyc/m1/agreement/signed-copy.pdf',
      signedAt: new Date(),
    } as MerchantKyc,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    storage.putObject.mockImplementation(({ key }: { key: string }) => ({
      key,
      url: `s3://test/${key}`,
    }));
    storage.getObject.mockImplementation((key: string) => ({
      body: Buffer.from(key),
      contentType: 'image/jpeg',
    }));
    const module = await Test.createTestingModule({
      providers: [
        MerchantsService,
        { provide: getRepositoryToken(Merchant), useValue: merchants },
        { provide: getRepositoryToken(MerchantKyc), useValue: kycRecords },
        {
          provide: getRepositoryToken(Payout),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        { provide: KYC_PORT, useValue: kyc },
        {
          provide: OBJECT_STORAGE,
          useValue: storage,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'kyc.provider' ? 'mock' : undefined,
            ),
          },
        },
        { provide: WalletService, useValue: wallets },
        { provide: OrganizationsService, useValue: organizations },
        { provide: UsersService, useValue: users },
        {
          provide: AuthService,
          useValue: {
            assertRecentOnboardingOtp: jest.fn(),
            latestOnboardingOtpVerifiedAt: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: NotificationsService,
          useValue: { notifyUser: jest.fn() },
        },
        { provide: AuditService, useValue: audit },
        { provide: AgreementService, useValue: agreement },
        {
          provide: FeeEngineService,
          useValue: { getConfig: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();
    service = module.get(MerchantsService);
    organizations.get.mockResolvedValue({
      id: 'org-1',
      features: ['WALLET', 'PAYOUT', 'PAYOUT_IMPS'],
      resolvedBank: 'MOCK',
    });
  });

  it('activates a KYC-complete merchant and opens a wallet', async () => {
    merchants.findOne.mockResolvedValue({ ...merchant, kyc: { ...merchant.kyc } });
    merchants.save.mockImplementation(async (value: Merchant) => value);
    wallets.openWallet.mockResolvedValue({});

    const result = await service.activate('m1');

    expect(wallets.openWallet).toHaveBeenCalledWith({
      merchantId: 'm1',
      businessName: 'Acme',
      mobileNo: '9876543210',
    });
    expect(result.status).toBe(MerchantStatus.ACTIVE);
  });

  it('blocks activation when KYC is incomplete', async () => {
    merchants.findOne.mockResolvedValue({
      ...merchant,
      kyc: { aadhaarStatus: 'PENDING', panStatus: 'VERIFIED' },
    });

    await expect(service.activate('m1')).rejects.toMatchObject({
      code: ErrorCodes.KYC_INCOMPLETE,
    });
    expect(wallets.openWallet).not.toHaveBeenCalled();
  });

  it('blocks activation when the signed agreement copy is missing', async () => {
    merchants.findOne.mockResolvedValue({
      ...merchant,
      kyc: { ...merchant.kyc, signedCopyPath: null },
    });

    await expect(service.activate('m1')).rejects.toMatchObject({
      code: ErrorCodes.KYC_INCOMPLETE,
      status: 409,
    });
    expect(wallets.openWallet).not.toHaveBeenCalled();
  });

  it('rejects activation with 409 (not 500) when the KYC row is missing', async () => {
    merchants.findOne.mockResolvedValue({ ...merchant, kyc: null });

    await expect(service.activate('m1')).rejects.toMatchObject({
      code: ErrorCodes.KYC_INCOMPLETE,
      status: 409,
    });
    expect(wallets.openWallet).not.toHaveBeenCalled();
  });

  it('updates pending onboarding profile fields and audits the change', async () => {
    merchants.findOne.mockResolvedValue({ ...merchant, kyc: { ...merchant.kyc } });
    merchants.save.mockImplementation(async (value: Merchant) => value);
    kycRecords.save.mockImplementation(async (value: MerchantKyc) => value);
    users.updateMerchantProfile.mockResolvedValue({});

    const result = await service.updatePendingOnboarding(
      'm1',
      'user-1',
      {
        businessName: 'Updated Store',
        contactPerson: 'Anita',
        email: 'anita@acme.test',
        address: 'Pune',
      },
      'anita@acme.test',
    );

    expect(result.businessName).toBe('Updated Store');
    expect(result.contactPerson).toBe('Anita');
    expect(result.email).toBe('anita@acme.test');
    expect(result.status).toBe(MerchantStatus.KYC_PENDING);
    expect(organizations.updateContactDetails).toHaveBeenCalledWith('org-1', {
      email: 'anita@acme.test',
      contactPerson: 'Anita',
      name: 'Updated Store',
    });
    expect(users.updateMerchantProfile).toHaveBeenCalledWith('user-1', {
      email: 'anita@acme.test',
      name: 'Anita',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MERCHANT_ONBOARDING_UPDATED',
        merchantId: 'm1',
        actorRole: 'MERCHANT',
      }),
    );
  });

  it('rejects pending onboarding updates when merchant is already active', async () => {
    merchants.findOne.mockResolvedValue({
      ...merchant,
      status: MerchantStatus.ACTIVE,
      kyc: { ...merchant.kyc },
    });

    await expect(
      service.updatePendingOnboarding(
        'm1',
        'user-1',
        { businessName: 'Nope' },
        'ops@acme.test',
      ),
    ).rejects.toMatchObject({
      code: ErrorCodes.INVALID_REQUEST,
    });
  });

  it('streams a KYC document scoped to the kyc namespace', async () => {
    const file = await service.streamKycFile('s3://test/kyc/m1/pan.jpg');

    expect(storage.getObject).toHaveBeenCalledWith('kyc/m1/pan.jpg');
    expect(file.contentType).toBe('image/jpeg');
  });

  it('rejects KYC file paths outside the kyc namespace', async () => {
    await expect(service.streamKycFile('')).rejects.toMatchObject({
      code: ErrorCodes.INVALID_REQUEST,
    });
    await expect(
      service.streamKycFile('s3://test/kyc/../secrets/env'),
    ).rejects.toMatchObject({ code: ErrorCodes.INVALID_REQUEST });
    await expect(
      service.streamKycFile('s3://test/other/m1/pan.jpg'),
    ).rejects.toMatchObject({ code: ErrorCodes.INVALID_REQUEST });
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('maps a missing KYC document to 404', async () => {
    storage.getObject.mockImplementationOnce(() => {
      throw new Error('NoSuchKey');
    });

    await expect(
      service.streamKycFile('s3://test/kyc/m1/missing.jpg'),
    ).rejects.toMatchObject({ code: ErrorCodes.KYC_DOCUMENT_NOT_FOUND });
  });

  describe('Agreement signature (Phase 1: paper upload)', () => {
    const provisionedInput = (overrides: Record<string, unknown> = {}) =>
      ({
        mobile: '9876543210',
        businessName: 'Acme',
        contactPerson: 'Ravi',
        email: 'ops@acme.test',
        address: 'Mumbai',
        password: 'ChangeMe#2026',
        agreementAccepted: true,
        agreementVersion: '2026.1',
        signatureMethod: 'PAPER_UPLOAD',
        ...overrides,
      }) as any;

    const mockProvisionedMerchant = () => {
      merchants.findOne.mockResolvedValue({
        ...merchant,
        status: MerchantStatus.CREATED,
        kyc: { ...merchant.kyc },
      });
      merchants.save.mockImplementation(async (value: Merchant) => value);
      kycRecords.save.mockImplementation(async (value: MerchantKyc) => value);
    };

    it('stamps agreement version, hash, method, and signedAt on onboarding', async () => {
      mockProvisionedMerchant();

      await service.registerSelfServe(provisionedInput());

      expect(kycRecords.save).toHaveBeenCalled();
      const saved = kycRecords.save.mock.calls[0][0] as MerchantKyc;
      expect(saved.agreementVersion).toBe('2026.1');
      expect(saved.agreementSha256).toBe(getCurrentAgreement().sha256);
      expect(saved.signatureMethod).toBe('PAPER_UPLOAD');
      expect(saved.signedAt).toBeInstanceOf(Date);
      expect(saved.agreementSignedAt).toBeInstanceOf(Date);
    });

    it('rejects an explicitly stale agreement version with 422', async () => {
      mockProvisionedMerchant();

      await expect(
        service.registerSelfServe(provisionedInput({ agreementVersion: '2020.1' })),
      ).rejects.toMatchObject({ code: ErrorCodes.INVALID_REQUEST, status: 422 });
    });

    const makePng = (width: number, height: number, totalBytes = 3000) => {
      const header = Buffer.alloc(33);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
      header.writeUInt32BE(13, 8);
      header.write('IHDR', 12);
      header.writeUInt32BE(width, 16);
      header.writeUInt32BE(height, 20);
      header[24] = 8;
      header[25] = 2;
      return Buffer.concat([header, Buffer.alloc(Math.max(0, totalBytes - 33), 7)]);
    };
    const pngDataUrl = (buf: Buffer) =>
      `data:image/png;base64,${buf.toString('base64')}`;
    const digitalInput = (overrides: Record<string, unknown> = {}) =>
      provisionedInput({
        signatureMethod: 'DIGITAL_ESIGN',
        typedName: 'Ravi',
        signaturePngBase64: pngDataUrl(makePng(600, 200)),
        ...overrides,
      });

    it('seals a digital e-sign: stores PNG, audit bundle, stamps name', async () => {
      mockProvisionedMerchant();

      await service.registerSelfServe(digitalInput(), {
        ip: '1.2.3.4',
        userAgent: 'jest',
      });

      expect(kycRecords.save).toHaveBeenCalled();
      const saved = kycRecords.save.mock.calls[0][0] as MerchantKyc;
      expect(saved.signatureMethod).toBe('DIGITAL_ESIGN');
      expect(saved.signedName).toBe('Ravi');
      expect(saved.signatureImagePath).toBe(
        's3://test/kyc/m1/agreement/signature.png',
      );
      expect(saved.signatureAuditPath).toBe(
        's3://test/kyc/m1/agreement/audit.json',
      );
      expect(agreement.renderSignedPdf).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'm1',
          typedName: 'Ravi',
          version: '2026.1',
        }),
      );
      expect(saved.signedPdfPath).toBe(
        's3://test/kyc/m1/agreement/signed-esign.pdf',
      );

      const auditCall = storage.putObject.mock.calls.find(
        (args) =>
          (args[0] as { key: string }).key === 'kyc/m1/agreement/audit.json',
      );
      expect(auditCall).toBeDefined();
      const bundle = JSON.parse(
        ((auditCall![0] as unknown as { body: Buffer }).body.toString('utf8')),
      );
      expect(bundle).toMatchObject({
        schema: 'nexara-esign-audit/1',
        merchantId: 'm1',
        method: 'DIGITAL_ESIGN',
        typedName: 'Ravi',
        agreementVersion: '2026.1',
        ip: '1.2.3.4',
        userAgent: 'jest',
      });
      expect(String(bundle.documentRef)).toMatch(/^NXA-/);
      expect(String(bundle.signaturePngSha256)).toHaveLength(64);
    });

    it('rejects digital e-sign when the typed name does not match the contact', async () => {
      mockProvisionedMerchant();

      await expect(
        service.registerSelfServe(digitalInput({ typedName: 'Someone Else' })),
      ).rejects.toMatchObject({ code: ErrorCodes.INVALID_REQUEST, status: 422 });
    });

    it('rejects digital e-sign with missing or invalid signature image', async () => {
      mockProvisionedMerchant();

      await expect(
        service.registerSelfServe(
          digitalInput({ signaturePngBase64: undefined }),
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.INVALID_REQUEST, status: 422 });

      await expect(
        service.registerSelfServe(
          digitalInput({
            signaturePngBase64: 'data:image/jpeg;base64,/9j/AAAA',
          }),
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.INVALID_REQUEST, status: 422 });

      await expect(
        service.registerSelfServe(
          digitalInput({
            signaturePngBase64: pngDataUrl(makePng(10, 10)),
          }),
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.INVALID_REQUEST, status: 422 });
    });

    it('blocks activation when a digital e-sign bundle is incomplete', async () => {
      merchants.findOne.mockResolvedValue({
        ...merchant,
        kyc: {
          ...merchant.kyc,
          signatureMethod: 'DIGITAL_ESIGN',
          signedCopyPath: null,
          signatureImagePath: null,
          signatureAuditPath: null,
        },
      });

      await expect(service.activate('m1')).rejects.toMatchObject({
        code: ErrorCodes.KYC_INCOMPLETE,
        status: 409,
      });
      expect(wallets.openWallet).not.toHaveBeenCalled();
    });

    it('returns the merchant agreement summary with artifact URLs', async () => {
      merchants.findOne.mockResolvedValue({
        ...merchant,
        kyc: {
          ...merchant.kyc,
          signatureMethod: 'DIGITAL_ESIGN',
          agreementVersion: '2026.1',
          agreementSha256: getCurrentAgreement().sha256,
          signedCopyPath: null,
          signatureImagePath: 's3://test/kyc/m1/agreement/signature.png',
          signatureAuditPath: 's3://test/kyc/m1/agreement/audit.json',
          signedPdfPath: 's3://test/kyc/m1/agreement/signed-esign.pdf',
        },
      });

      const summary = await service.getAgreementSummary('m1');

      expect(summary.method).toBe('DIGITAL_ESIGN');
      expect(summary.version).toBe('2026.1');
      expect(summary.hashMatchesCurrent).toBe(true);
      expect(summary.urls.signedPdf).toBe(
        's3://test/kyc/m1/agreement/signed-esign.pdf',
      );
      expect(summary.urls.signedCopy).toBeNull();
    });

    it('activates a merchant with a complete sealed digital e-sign', async () => {
      merchants.findOne.mockResolvedValue({
        ...merchant,
        kyc: {
          ...merchant.kyc,
          signatureMethod: 'DIGITAL_ESIGN',
          signedCopyPath: null,
          signatureImagePath: 's3://test/kyc/m1/agreement/signature.png',
          signatureAuditPath: 's3://test/kyc/m1/agreement/audit.json',
        },
      });
      merchants.save.mockImplementation(async (value: Merchant) => value);
      wallets.openWallet.mockResolvedValue({});

      const result = await service.activate('m1');

      expect(wallets.openWallet).toHaveBeenCalled();
      expect(result.status).toBe(MerchantStatus.ACTIVE);
    });

    it('stores the uploaded signed agreement under the agreement namespace', async () => {
      merchants.findOne.mockResolvedValue({
        ...merchant,
        kyc: { ...merchant.kyc },
      });
      merchants.save.mockImplementation(async (value: Merchant) => value);
      kycRecords.save.mockImplementation(async (value: MerchantKyc) => value);

      await service.storeKycFiles('m1', {
        signedAgreement: {
          originalname: 'signed.pdf',
          buffer: Buffer.alloc(100),
          mimetype: 'application/pdf',
        },
      });

      expect(storage.putObject).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'kyc/m1/agreement/signed-copy.pdf',
        }),
      );
      const saved = kycRecords.save.mock.calls[0][0] as MerchantKyc;
      expect(saved.signedCopyPath).toBe(
        's3://test/kyc/m1/agreement/signed-copy.pdf',
      );
    });

    it('reports which artifact failed when object storage is down', async () => {
      merchants.findOne.mockResolvedValue({
        ...merchant,
        kyc: { ...merchant.kyc },
      });
      (storage.putObject as jest.Mock).mockRejectedValueOnce(
        new Error('NoSuchBucket'),
      );

      await expect(
        service.storeKycFiles('m1', {
          signedAgreement: {
            originalname: 'signed.pdf',
            buffer: Buffer.alloc(100),
            mimetype: 'application/pdf',
          },
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.STORAGE_UNAVAILABLE,
        status: 500,
      });
    });

    it('rejects signed agreement files with disallowed types or oversize bodies', async () => {
      merchants.findOne.mockResolvedValue({
        ...merchant,
        kyc: { ...merchant.kyc },
      });

      await expect(
        service.storeKycFiles('m1', {
          signedAgreement: {
            originalname: 'signed.exe',
            buffer: Buffer.alloc(100),
            mimetype: 'application/x-msdownload',
          },
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.INVALID_REQUEST, status: 400 });

      await expect(
        service.storeKycFiles('m1', {
          signedAgreement: {
            originalname: 'signed.pdf',
            buffer: Buffer.alloc(11 * 1024 * 1024),
            mimetype: 'application/pdf',
          },
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.INVALID_REQUEST, status: 400 });
      expect(storage.putObject).not.toHaveBeenCalled();
    });
  });

  describe('Hierarchy & KYC Gating', () => {
    it('blocks Super Distributor from adding children when their own KYC is pending', async () => {
      merchants.findOne.mockResolvedValueOnce({
        id: 'sd-1',
        status: MerchantStatus.KYC_PENDING,
      });

      await expect(
        service.create(
          { mobile: '9999999999', entityType: 'DISTRIBUTOR' },
          {
            id: 'u-sd',
            role: 'SUPER_DISTRIBUTOR' as any,
            merchantId: 'sd-1',
            organizationId: 'org-sd',
            email: 'sd@test.com',
            name: 'SD User',
          },
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.KYC_INCOMPLETE,
      });
    });

    it('allows Super Distributor with active KYC to provision a Distributor', async () => {
      merchants.findOne.mockResolvedValueOnce({
        id: 'sd-1',
        status: MerchantStatus.ACTIVE,
      });
      organizations.ensureSeeded.mockResolvedValueOnce({ id: 'org-admin' });
      organizations.createMerchantOrganization.mockResolvedValueOnce({
        id: 'org-dist-new',
      });
      merchants.create.mockReturnValue({
        id: 'dist-new',
        businessName: 'Dist New',
        mobile: '9888888888',
        status: MerchantStatus.CREATED,
        dailyPayoutLimit: '100000.00',
        feeType: 'FIXED',
        feeValue: '10.00',
        gstPercent: '18.00',
        tier: 'SILVER',
        channel: 'STANDARD',
        organizationId: 'org-dist-new',
      });
      merchants.save.mockImplementation(async (m: any) => m);
      kycRecords.create.mockReturnValue({});
      kycRecords.save.mockResolvedValue({});
      organizations.get.mockResolvedValue({ id: 'org-dist-new', type: 'DISTRIBUTOR', parentId: 'org-sd' });

      const result = await service.create(
        { mobile: '9888888888', entityType: 'DISTRIBUTOR' },
        {
          id: 'u-sd',
          role: 'SUPER_DISTRIBUTOR' as any,
          merchantId: 'sd-1',
          organizationId: 'org-sd',
          email: 'sd@test.com',
          name: 'SD User',
        },
      );

      expect(result).toBeDefined();
      expect(organizations.createMerchantOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          parentId: 'org-sd',
        }),
      );
    });

    it('blocks Distributor from creating another Distributor', async () => {
      merchants.findOne.mockResolvedValueOnce({
        id: 'd-1',
        status: MerchantStatus.ACTIVE,
      });

      await expect(
        service.create(
          { mobile: '9777777777', entityType: 'DISTRIBUTOR' },
          {
            id: 'u-dist',
            role: 'DISTRIBUTOR' as any,
            merchantId: 'd-1',
            organizationId: 'org-dist',
            email: 'dist@test.com',
            name: 'Dist User',
          },
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.FORBIDDEN,
      });
    });

    it('allows Admin to overrule and reassign an entity to a new parent', async () => {
      merchants.findOne.mockResolvedValueOnce({
        id: 'm-child',
        businessName: 'Child Store',
        organizationId: 'org-child',
        status: MerchantStatus.ACTIVE,
      });
      organizations.get.mockResolvedValue({
        id: 'org-child',
        parentId: 'org-old-parent',
      });
      organizations.ensureSeeded.mockResolvedValue({ id: 'org-admin' });
      merchants.save.mockImplementation(async (m: any) => m);

      await service.update(
        'm-child',
        { parentOrganizationId: 'org-new-parent' },
        'admin@nexara.com',
        {
          id: 'u-admin',
          role: 'ADMIN' as any,
          merchantId: null,
          organizationId: 'org-admin',
          email: 'admin@nexara.com',
          name: 'Admin',
        },
      );

      expect(organizations.reassignParent).toHaveBeenCalledWith(
        'org-child',
        'org-new-parent',
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ADMIN_OVERRULE_HIERARCHY',
          merchantId: 'm-child',
        }),
      );
    });
  });

  describe('create mobile duplication guard', () => {
    it('rejects create when mobile is already provisioned', async () => {
      merchants.findOne.mockResolvedValueOnce({
        id: 'existing-merchant',
        mobile: '9876543210',
      });

      await expect(
        service.create(
          { mobile: '9876543210', entityType: 'DISTRIBUTOR' } as any,
          {
            id: 'u-admin',
            role: 'ADMIN' as any,
            merchantId: null,
            organizationId: 'org-admin',
            email: 'admin@nexara.com',
            name: 'Admin',
          },
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_REQUEST,
        status: 409,
      });
    });

    it('rejects create when mobile belongs to an existing user', async () => {
      merchants.findOne.mockResolvedValueOnce(null);
      users.findByMobile.mockResolvedValueOnce({
        id: 'user-1',
        mobile: '9876543210',
        status: 'ACTIVE',
      });

      await expect(
        service.create(
          { mobile: '9876543210', entityType: 'DISTRIBUTOR' } as any,
          {
            id: 'u-admin',
            role: 'ADMIN' as any,
            merchantId: null,
            organizationId: 'org-admin',
            email: 'admin@nexara.com',
            name: 'Admin',
          },
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_REQUEST,
        status: 409,
      });
    });
  });

  describe('listDownline & provisionDownline', () => {
    const sdCaller = {
      id: 'u-sd',
      role: 'SUPER_DISTRIBUTOR' as any,
      merchantId: 'sd-1',
      organizationId: 'org-sd',
      email: 'sd@test.com',
      name: 'SD User',
    };

    it('lists merchants with batched org and spend lookups', async () => {
      merchants.find.mockResolvedValueOnce([
        { id: 'm-a', organizationId: 'org-a', status: MerchantStatus.ACTIVE },
        { id: 'm-b', organizationId: 'org-a', status: MerchantStatus.ACTIVE },
      ]);
      organizations.rawByIds.mockResolvedValueOnce([
        { id: 'org-a', type: 'DISTRIBUTOR', parentId: null },
      ]);

      const rows = await service.list({});

      // One org query for the whole page — not one per merchant.
      expect(organizations.rawByIds).toHaveBeenCalledTimes(1);
      expect(organizations.rawByIds).toHaveBeenCalledWith(['org-a']);
      expect(organizations.get).not.toHaveBeenCalled();
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ id: 'm-a', entityType: 'DISTRIBUTOR' });
    });

    it('rejects non-partner roles from listDownline', async () => {
      await expect(
        service.listDownline({
          id: 'u-m',
          role: 'MERCHANT' as any,
          merchantId: 'm-1',
          organizationId: 'org-m',
          email: 'm@test.com',
          name: 'Merchant',
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.FORBIDDEN });
    });

    it('returns flat downline with KYC displayStatus and hasWallet', async () => {
      organizations.getDescendantOrgIds.mockResolvedValueOnce(['org-dist', 'org-ret']);
      merchants.find.mockResolvedValueOnce([
        {
          id: 'dist-1',
          businessName: 'Dist Co',
          contactPerson: 'A',
          mobile: '9111111111',
          email: 'd@test.com',
          status: MerchantStatus.CREATED,
          organizationId: 'org-dist',
          createdAt: new Date('2026-01-01'),
          kyc: {},
        },
        {
          id: 'ret-1',
          businessName: 'Retail Shop',
          contactPerson: 'B',
          mobile: '9222222222',
          email: 'r@test.com',
          status: MerchantStatus.ACTIVE,
          organizationId: 'org-ret',
          createdAt: new Date('2026-01-02'),
          kyc: {
            panImagePath: 's3://x',
            aadhaarFrontPath: 's3://y',
            selfiePath: 's3://z',
          },
        },
      ]);
      organizations.rawByIds.mockResolvedValueOnce([
        { id: 'org-dist', type: 'DISTRIBUTOR' },
        { id: 'org-ret', type: 'MERCHANT' },
      ]);
      wallets.findMappedMerchantIds.mockResolvedValueOnce(new Set(['ret-1']));

      const result = await service.listDownline(sdCaller);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'dist-1',
        entityType: 'DISTRIBUTOR',
        displayStatus: 'NOT_STARTED',
        hasWallet: false,
      });
      expect(result[1]).toMatchObject({
        id: 'ret-1',
        entityType: 'RETAILER',
        displayStatus: 'APPROVED',
        hasWallet: true,
      });
    });

    it('rejects provision when mobile already exists', async () => {
      merchants.findOne.mockResolvedValueOnce({
        id: 'existing',
        mobile: '9333333333',
      });

      await expect(
        service.provisionDownline(sdCaller, {
          mobile: '9333333333',
          entityType: 'DISTRIBUTOR',
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_REQUEST,
        status: 409,
      });
    });

    it('provisions via create when mobile is free', async () => {
      merchants.findOne
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValueOnce({
          id: 'sd-1',
          status: MerchantStatus.ACTIVE,
        }); // assertKycDoneForManagement
      organizations.ensureSeeded.mockResolvedValueOnce({ id: 'org-admin' });
      organizations.createMerchantOrganization.mockResolvedValueOnce({
        id: 'org-new',
      });
      merchants.create.mockReturnValue({
        id: 'new-1',
        businessName: 'New Dist',
        contactPerson: 'C',
        mobile: '9444444444',
        email: '',
        address: 'Pending Onboarding Address',
        status: MerchantStatus.CREATED,
        dailyPayoutLimit: '100000.00',
        perPayoutLimit: '20000.00',
        feeType: 'FIXED',
        feeValue: '10.00',
        gstPercent: '18.00',
        tier: 'SILVER',
        channel: 'STANDARD',
        organizationId: 'org-new',
        distributorCommissionPercent: '0.20',
        superDistributorCommissionPercent: '0.025',
        masterDistributorCommissionPercent: '0.010',
      });
      merchants.save.mockImplementation(async (m: any) => m);
      kycRecords.create.mockReturnValue({});
      kycRecords.save.mockResolvedValue({});
      organizations.get.mockResolvedValue({
        id: 'org-new',
        type: 'DISTRIBUTOR',
        parentId: 'org-sd',
      });

      const result = await service.provisionDownline(sdCaller, {
        mobile: '9444444444',
        entityType: 'DISTRIBUTOR',
        businessName: 'New Dist',
        contactPerson: 'C',
      });

      expect(result).toBeDefined();
      expect(organizations.createMerchantOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          parentId: 'org-sd',
          organizationType: 'DISTRIBUTOR',
        }),
      );
    });
  });
});
