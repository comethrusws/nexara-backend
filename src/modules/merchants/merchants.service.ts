import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, In, Not, Repository } from 'typeorm';
import { Payout, PayoutStatus } from '../payouts/entities/payout.entity';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { KYC_PORT, type KycPort } from '../../integrations/kyc/kyc.types';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../../integrations/storage/storage.types';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../auth/auth.constants';
import { UsersService } from '../auth/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Features, OrganizationType } from '../organizations/organization.constants';
import { OrganizationsService } from '../organizations/organizations.service';
import { WalletService } from '../wallet/wallet.service';
import {
  CreateMerchantDto,
  PublicOnboardingDto,
  UpdateMerchantDto,
} from './dto/merchant.dto';
import { MerchantKyc } from './entities/merchant-kyc.entity';
import { Merchant } from './entities/merchant.entity';
import { FeeType, MerchantStatus, MerchantTier } from './merchant.enums';

@Injectable()
export class MerchantsService implements OnModuleInit {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchants: Repository<Merchant>,
    @InjectRepository(MerchantKyc)
    private readonly kycRecords: Repository<MerchantKyc>,
    @InjectRepository(Payout)
    private readonly payouts: Repository<Payout>,
    @Inject(KYC_PORT) private readonly kyc: KycPort,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    private readonly config: ConfigService,
    private readonly wallets: WalletService,
    private readonly organizations: OrganizationsService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    const admin = await this.organizations.ensureSeeded();
    const orphans = await this.merchants.find({
      where: { organizationId: IsNull() },
    });
    for (const merchant of orphans) {
      const org = await this.organizations.createMerchantOrganization({
        parentId: admin.id,
        name: merchant.businessName,
        contactPerson: merchant.contactPerson,
        mobile: merchant.mobile,
        email: merchant.email ?? undefined,
      });
      merchant.organizationId = org.id;
      await this.merchants.save(merchant);
    }
  }

  async create(input: CreateMerchantDto) {
    const admin = await this.organizations.ensureSeeded();
    const parentId = input.parentOrganizationId ?? admin.id;
    const businessName = input.businessName || `Merchant (+91 ${input.mobile})`;
    const contactPerson = input.contactPerson || `Mobile Contact (+91 ${input.mobile})`;
    const email = input.email || '';

    const address = input.address || 'Pending Onboarding Address';

    const org = await this.organizations.createMerchantOrganization({
      parentId,
      name: businessName,
      contactPerson,
      mobile: input.mobile,
      email: email ?? undefined,
      organizationType: this.mapEntityType(input.entityType),
    });
    const merchant = this.merchants.create({
      businessName,
      contactPerson,
      mobile: input.mobile,
      email,
      address,
      status: MerchantStatus.CREATED,
      dailyPayoutLimit: input.dailyPayoutLimit ?? '100000.00',
      perPayoutLimit: input.perPayoutLimit ?? '20000.00',
      tier: input.tier ?? MerchantTier.SILVER,
      feeType: input.feeType ?? FeeType.FIXED,
      feeValue: input.feeValue ?? '10.00',
      gstPercent: input.gstPercent ?? '18.00',
      enabledServicesJson: JSON.stringify(
        input.services ?? {
          payouts: true,
          bbpsBills: true,
          licInsurance: true,
          loanEmi: true,
        },
      ),
      organizationId: org.id,
    });
    const saved = await this.merchants.save(merchant);
    const kyc = this.kycRecords.create({
      merchantId: saved.id,
      aadhaarStatus: 'PENDING',
      panStatus: 'PENDING',
      aadhaarImageMatch: 'PENDING',
      panImageMatch: 'PENDING',
    });
    saved.kyc = await this.kycRecords.save(kyc);
    if (email) {
      await this.users.createMerchantUser({
        email,
        name: saved.contactPerson,
        mobile: saved.mobile,
        merchantId: saved.id,
        organizationId: saved.organizationId,
        password: input.password,
        mpin: input.mpin,
      });
    }
    await this.audit.record({
      actorEmail: 'system',
      actorRole: 'ADMIN',
      action: 'MERCHANT_CREATED',
      merchantId: saved.id,
      details: `Created merchant ${saved.businessName}`,
    });
    return this.toView(saved);
  }

  async get(id: string) {
    return this.toView(await this.requireMerchant(id));
  }

  async list(filters?: { status?: string; search?: string }) {
    const filtered = await this.findFilteredMerchants(filters);
    return Promise.all(filtered.map((row) => this.toView(row)));
  }

  async listKycVerifications(filters?: { status?: string; search?: string }) {
    const filtered = await this.findFilteredMerchants(filters);
    return filtered.map((row) => this.toKycVerificationListItem(row));
  }

  async getKycVerification(id: string) {
    const merchant = await this.requireMerchant(id);
    const images = await this.getKycPresignedUrls(id);
    return {
      id: merchant.id,
      businessName: merchant.businessName,
      contactPerson: merchant.contactPerson,
      mobile: merchant.mobile,
      email: merchant.email,
      address: merchant.address,
      status: merchant.status,
      tier: merchant.tier,
      channel: merchant.channel,
      createdAt: merchant.createdAt,
      kycDetail: {
        aadhaarLast4: merchant.kyc?.aadhaarLast4 ?? null,
        panMasked: merchant.kyc?.panMasked ?? null,
        aadhaarStatus: merchant.kyc?.aadhaarStatus ?? 'PENDING',
        panStatus: merchant.kyc?.panStatus ?? 'PENDING',
        aadhaarImageMatch: merchant.kyc?.aadhaarImageMatch ?? 'PENDING',
        panImageMatch: merchant.kyc?.panImageMatch ?? 'PENDING',
        shopType: merchant.kyc?.shopType ?? null,
        latitude: merchant.kyc?.latitude ?? null,
        longitude: merchant.kyc?.longitude ?? null,
        agreementSignedAt: merchant.kyc?.agreementSignedAt ?? null,
        images: {
          aadhaarFront: images.aadhaarFront,
          aadhaarBack: images.aadhaarBack,
          pan: images.pan,
          selfie: images.selfie,
        },
      },
    };
  }

  async approveKyc(id: string) {
    return this.activate(id);
  }

  async rejectKyc(id: string, reason?: string, actorEmail = 'ops') {
    const merchant = await this.requireMerchant(id);
    if (merchant.status === MerchantStatus.REJECTED) {
      return this.toView(merchant);
    }
    if (merchant.status === MerchantStatus.ACTIVE) {
      throw new NexaraError(
        ErrorCodes.MERCHANT_INACTIVE,
        'Active merchants cannot be rejected via KYC review; suspend them instead',
        409,
      );
    }
    merchant.status = MerchantStatus.REJECTED;
    await this.merchants.save(merchant);
    await this.audit.record({
      actorEmail,
      actorRole: 'ADMIN',
      action: 'MERCHANT_KYC_REJECTED',
      merchantId: merchant.id,
      details: reason ?? 'KYC application rejected',
    });
    await this.notifications.notifyUser({
      merchantId: merchant.id,
      organizationId: merchant.organizationId,
      audience: 'MERCHANT',
      title: 'KYC rejected',
      body:
        reason?.trim() ||
        'Your KYC application was rejected. Please contact support or resubmit documents.',
      type: 'MERCHANT_KYC_REJECTED',
    });
    return this.toView(merchant);
  }

  async resolveKycFileUrl(path: string) {
    if (!path?.trim()) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'path query parameter is required',
        400,
      );
    }
    return { url: await this.presignStoredObject(path) };
  }

  async update(id: string, input: UpdateMerchantDto, actorEmail = 'ops') {
    const merchant = await this.requireMerchant(id);
    const previous = { status: merchant.status, tier: merchant.tier };
    if (input.status && input.status !== merchant.status) {
      merchant.status = input.status;
    }
    if (input.dailyPayoutLimit) {
      merchant.dailyPayoutLimit = input.dailyPayoutLimit;
    }
    if (input.perPayoutLimit !== undefined) {
      merchant.perPayoutLimit = input.perPayoutLimit;
    }
    if (input.feeType) {
      merchant.feeType = input.feeType;
    }
    if (input.feeValue) {
      merchant.feeValue = input.feeValue;
    }
    if (input.gstPercent) {
      merchant.gstPercent = input.gstPercent;
    }
    if (input.percentFee) {
      merchant.feeType = FeeType.PERCENTAGE;
      merchant.feeValue = input.percentFee;
    }
    if (input.services) {
      merchant.enabledServicesJson = JSON.stringify(input.services);
    }
    if (input.tier) {
      merchant.tier = input.tier;
    }
    await this.merchants.save(merchant);
    await this.audit.record({
      actorEmail,
      actorRole: 'ADMIN',
      action: 'MERCHANT_UPDATED',
      merchantId: merchant.id,
      details: input.reason ?? 'Merchant record updated',
      previousValue: previous,
      newValue: { status: merchant.status, tier: merchant.tier },
    });
    return this.toView(merchant);
  }

  async network() {
    const orgs = await this.organizations.list();
    const merchants = await this.merchants.find();
    const byParent = new Map<string | null, typeof orgs>();
    for (const org of orgs) {
      const key = org.parentId;
      const list = byParent.get(key) ?? [];
      list.push(org);
      byParent.set(key, list);
    }
    const attach = async (org: (typeof orgs)[number]): Promise<unknown> => {
      const merchant = merchants.find((item) => item.organizationId === org.id);
      let wallet = null;
      if (merchant) {
        try {
          wallet = await this.wallets.getWallet(merchant.id);
        } catch {
          wallet = null;
        }
      }
      const children = byParent.get(org.id) ?? [];
      return {
        ...org,
        merchantId: merchant?.id ?? null,
        tier: merchant?.tier ?? null,
        merchantStatus: merchant?.status ?? null,
        wallet,
        children: await Promise.all(children.map((child) => attach(child))),
      };
    };
    const roots = orgs.filter((org) => !org.parentId);
    return Promise.all(roots.map((root) => attach(root)));
  }

  async verifyAadhaar(id: string, aadhaarNumber: string) {
    const merchant = await this.requireMerchant(id);
    this.assertKycAllowed(merchant);
    const result = await this.kyc.verifyAadhaar({
      aadhaarNumber,
      merchantId: merchant.id,
    });
    merchant.kyc.aadhaarStatus = result.status;
    merchant.kyc.aadhaarLast4 = aadhaarNumber.slice(-4);
    merchant.kyc.aadhaarProviderRef = result.providerReference;
    merchant.status = MerchantStatus.KYC_PENDING;
    await this.refreshDocumentMatch(merchant);
    await this.kycRecords.save(merchant.kyc);
    await this.merchants.save(merchant);
    if (result.status === 'FAILED') {
      throw new NexaraError(
        ErrorCodes.KYC_FAILED,
        result.failureReason ?? 'Aadhaar verification failed',
        422,
      );
    }
    return this.toView(merchant);
  }

  async verifyPan(id: string, pan: string, name?: string) {
    const merchant = await this.requireMerchant(id);
    this.assertKycAllowed(merchant);
    const result = await this.kyc.verifyPan({
      pan: pan.toUpperCase(),
      merchantId: merchant.id,
      name,
    });
    merchant.kyc.panStatus = result.status;
    merchant.kyc.panMasked = result.maskedValue;
    merchant.kyc.panProviderRef = result.providerReference;
    merchant.status = MerchantStatus.KYC_PENDING;
    await this.refreshDocumentMatch(merchant);
    await this.kycRecords.save(merchant.kyc);
    await this.merchants.save(merchant);
    if (result.status === 'FAILED') {
      throw new NexaraError(
        ErrorCodes.KYC_FAILED,
        result.failureReason ?? 'PAN verification failed',
        422,
      );
    }
    return this.toView(merchant);
  }

  async activate(id: string) {
    const merchant = await this.requireMerchant(id);
    if (merchant.status === MerchantStatus.ACTIVE) {
      return this.toView(merchant);
    }
    if (
      merchant.status === MerchantStatus.SUSPENDED ||
      merchant.status === MerchantStatus.REJECTED
    ) {
      throw new NexaraError(
        ErrorCodes.MERCHANT_INACTIVE,
        'Suspended or rejected merchants cannot be activated this way',
        409,
      );
    }
    if (
      merchant.kyc.aadhaarStatus !== 'VERIFIED' ||
      merchant.kyc.panStatus !== 'VERIFIED' ||
      merchant.kyc.aadhaarImageMatch !== 'MATCHED' ||
      merchant.kyc.panImageMatch !== 'MATCHED'
    ) {
      throw new NexaraError(
        ErrorCodes.KYC_INCOMPLETE,
        'Aadhaar and PAN must be verified and document images must match API details',
        409,
      );
    }
    const organizationId = this.requireOrganizationId(merchant);
    await this.organizations.assertAncestorsActive(organizationId);
    await this.organizations.assertFeature(organizationId, Features.WALLET);
    await this.wallets.openWallet({
      merchantId: merchant.id,
      businessName: merchant.businessName,
      mobileNo: merchant.mobile,
    });
    merchant.status = MerchantStatus.ACTIVE;
    await this.merchants.save(merchant);
    await this.notifications.notifyUser({
      merchantId: merchant.id,
      organizationId: merchant.organizationId,
      audience: 'MERCHANT',
      title: 'Merchant activated',
      body: 'Your Nexara wallet is active and ready for payouts.',
      type: 'MERCHANT_ACTIVATED',
    });
    return this.toView(merchant);
  }

  async suspend(id: string, reason?: string, actorEmail = 'ops') {
    const merchant = await this.requireMerchant(id);
    if (merchant.status !== MerchantStatus.ACTIVE) {
      throw new NexaraError(
        ErrorCodes.MERCHANT_INACTIVE,
        'Only ACTIVE merchants can be suspended',
        409,
      );
    }
    merchant.status = MerchantStatus.SUSPENDED;
    await this.merchants.save(merchant);
    await this.audit.record({
      actorEmail,
      actorRole: 'ADMIN',
      action: 'MERCHANT_SUSPENDED',
      merchantId: merchant.id,
      details: reason ?? 'Merchant suspended',
    });
    return this.toView(merchant);
  }

  async getKycPresignedUrls(id: string) {
    const merchant = await this.requireMerchant(id);
    const paths = {
      aadhaarFront: merchant.kyc.aadhaarFrontPath,
      aadhaarBack: merchant.kyc.aadhaarBackPath,
      pan: merchant.kyc.panImagePath,
      selfie: merchant.kyc.selfiePath,
    };
    const result: Record<string, string | null> = {};
    for (const [label, stored] of Object.entries(paths)) {
      result[label] = stored
        ? await this.presignStoredObject(stored)
        : null;
    }
    return result;
  }

  private async presignStoredObject(stored: string): Promise<string> {
    if (
      stored.startsWith('http://') ||
      stored.startsWith('https://') ||
      stored.startsWith('file://')
    ) {
      if (!this.storage.getPresignedUrl) {
        return stored;
      }
    }
    const key = this.extractStorageKey(stored);
    if (this.storage.getPresignedUrl) {
      return this.storage.getPresignedUrl(key);
    }
    return stored;
  }

  private extractStorageKey(stored: string): string {
    if (stored.startsWith('s3://')) {
      const parts = stored.replace('s3://', '').split('/');
      parts.shift();
      return parts.join('/');
    }
    const marker = '/kyc/';
    const idx = stored.indexOf(marker);
    if (idx >= 0) {
      return stored.slice(idx + 1);
    }
    return stored;
  }

  private mapEntityType(entityType?: string): OrganizationType {
    switch (entityType) {
      case 'SUPER_DISTRIBUTOR':
        return OrganizationType.SUPER_DISTRIBUTOR;
      case 'DISTRIBUTOR':
        return OrganizationType.DISTRIBUTOR;
      default:
        return OrganizationType.MERCHANT;
    }
  }

  private normalizeStatusFilter(status?: string): string | undefined {
    if (!status || status === 'ALL') {
      return undefined;
    }
    const aliases: Record<string, MerchantStatus> = {
      PENDING_KYC: MerchantStatus.KYC_PENDING,
      UNDER_REVIEW: MerchantStatus.KYC_PENDING,
      PENDING: MerchantStatus.CREATED,
    };
    return aliases[status] ?? status;
  }

  private statusAliases(status: MerchantStatus): string[] {
    if (status === MerchantStatus.KYC_PENDING) {
      return ['KYC_PENDING', 'PENDING_KYC', 'UNDER_REVIEW'];
    }
    if (status === MerchantStatus.CREATED) {
      return ['CREATED', 'PENDING'];
    }
    return [status];
  }

  private parseEnabledServices(json: string | null) {
    const defaults = {
      payouts: true,
      bbpsBills: true,
      licInsurance: true,
      loanEmi: true,
    };
    if (!json) {
      return defaults;
    }
    try {
      return { ...defaults, ...JSON.parse(json) };
    } catch {
      return defaults;
    }
  }

  private async currentDailySpent(merchantId: string): Promise<string> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const rows = await this.payouts.find({
      where: {
        merchantId,
        status: Not(In([PayoutStatus.FAILED])),
      },
    });
    const total = rows
      .filter((row) => row.createdAt >= start)
      .reduce((sum, row) => sum + parseFloat(row.amount), 0);
    return total.toFixed(2);
  }

  async requireActive(id: string): Promise<Merchant> {
    const merchant = await this.requireMerchant(id);
    if (merchant.status !== MerchantStatus.ACTIVE) {
      throw new NexaraError(
        ErrorCodes.MERCHANT_INACTIVE,
        'Only ACTIVE merchants may initiate payouts',
        409,
      );
    }
    const organizationId = this.requireOrganizationId(merchant);
    await this.organizations.assertAncestorsActive(organizationId);
    return merchant;
  }

  async requireById(id: string): Promise<Merchant> {
    return this.requireMerchant(id);
  }

  async registerSelfServe(input: PublicOnboardingDto) {
    const mobile = input.mobile.replace(/\D/g, '').slice(-10);
    const existingUser = await this.users.findByMobile(mobile);

    if (existingUser) {
      if (
        existingUser.role !== UserRole.MERCHANT ||
        !existingUser.merchantId
      ) {
        throw new NexaraError(
          ErrorCodes.INVALID_REQUEST,
          'This mobile number is already linked to another account',
          409,
        );
      }

      const existingMerchant = await this.requireMerchant(
        existingUser.merchantId,
      );
      if (existingMerchant.mobile !== mobile) {
        throw new NexaraError(
          ErrorCodes.INVALID_REQUEST,
          'The mobile number does not match your registered account',
          400,
        );
      }

      if (existingMerchant.status === MerchantStatus.ACTIVE) {
        throw new NexaraError(
          ErrorCodes.INVALID_REQUEST,
          'This mobile number is already registered. Please sign in instead.',
          409,
        );
      }

      if (
        existingMerchant.status === MerchantStatus.CREATED ||
        existingMerchant.status === MerchantStatus.KYC_PENDING
      ) {
        return this.resumeSelfServeOnboarding(
          existingMerchant,
          existingUser.id,
          input,
        );
      }

      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'This merchant account cannot complete onboarding. Please contact support.',
        409,
      );
    }

    const existingMerchant = await this.merchants.findOne({
      where: { mobile },
      order: { createdAt: 'DESC' },
    });
    if (existingMerchant) {
      if (existingMerchant.status === MerchantStatus.ACTIVE) {
        throw new NexaraError(
          ErrorCodes.INVALID_REQUEST,
          'This mobile number is already registered. Please sign in instead.',
          409,
        );
      }
      if (
        existingMerchant.status === MerchantStatus.CREATED ||
        existingMerchant.status === MerchantStatus.KYC_PENDING
      ) {
        await this.auth.assertRecentOnboardingOtp(mobile);
        return this.completeProvisionedMerchantOnboarding(
          existingMerchant,
          input,
        );
      }
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'This merchant account cannot complete onboarding. Please contact support.',
        409,
      );
    }

    throw new NexaraError(
      ErrorCodes.INVALID_REQUEST,
      'This mobile number is not provisioned. Please contact your administrator.',
      404,
    );
  }

  private async completeProvisionedMerchantOnboarding(
    merchant: Merchant,
    input: PublicOnboardingDto,
  ) {
    const email = input.email.toLowerCase().trim();
    merchant.businessName = input.businessName;
    merchant.contactPerson = input.contactPerson;
    merchant.address = input.address;
    merchant.email = email;
    await this.merchants.save(merchant);
    if (merchant.organizationId) {
      await this.organizations.updateContactDetails(merchant.organizationId, {
        email,
        contactPerson: input.contactPerson,
        name: input.businessName,
      });
    }
    await this.users.createMerchantUser({
      email,
      name: input.contactPerson,
      mobile: merchant.mobile,
      merchantId: merchant.id,
      organizationId: merchant.organizationId,
      password: input.password,
      mpin: input.mpin,
    });
    return this.finalizeSelfServeOnboarding(merchant.id, input);
  }

  private async resumeSelfServeOnboarding(
    merchant: Merchant,
    userId: string,
    input: PublicOnboardingDto,
  ) {
    const email = input.email.toLowerCase().trim();
    merchant.businessName = input.businessName;
    merchant.contactPerson = input.contactPerson;
    merchant.address = input.address;
    merchant.email = email;
    await this.merchants.save(merchant);
    if (merchant.organizationId) {
      await this.organizations.updateContactDetails(merchant.organizationId, {
        email,
        contactPerson: input.contactPerson,
        name: input.businessName,
      });
    }
    await this.users.updateMerchantProfile(userId, {
      email,
      name: input.contactPerson,
      password: input.password,
    });
    return this.finalizeSelfServeOnboarding(merchant.id, input);
  }

  private async finalizeSelfServeOnboarding(
    merchantId: string,
    input: PublicOnboardingDto,
  ) {
    if (input.pan) {
      await this.verifyPan(merchantId, input.pan, input.contactPerson);
    }
    if (input.aadhaar) {
      await this.verifyAadhaar(merchantId, input.aadhaar);
    }

    const refreshed = await this.requireMerchant(merchantId);
    if (input.latitude) {
      refreshed.kyc.latitude = input.latitude;
    }
    if (input.longitude) {
      refreshed.kyc.longitude = input.longitude;
    }
    if (input.shopType) {
      refreshed.kyc.shopType = input.shopType;
    }
    if (input.agreementAccepted) {
      refreshed.kyc.agreementSignedAt = new Date();
    }

    if (this.looksLikeImagePayload(input.selfieBase64)) {
      const decoded = this.decodeBase64Image(
        input.selfieBase64!,
        input.selfieContentType,
      );
      const stored = await this.storage.putObject({
        key: `kyc/${refreshed.id}/selfie${decoded.extension}`,
        body: decoded.buffer,
        contentType: decoded.contentType,
      });
      refreshed.kyc.selfiePath = stored.url;
    }

    await this.applyMockDocumentMatchIfReady(refreshed);
    await this.kycRecords.save(refreshed.kyc);
    refreshed.status = MerchantStatus.KYC_PENDING;
    await this.merchants.save(refreshed);
    return this.toView(refreshed);
  }

  async storeKycFiles(
    id: string,
    files: {
      aadhaarFront?: { originalname: string; buffer: Buffer; mimetype?: string };
      aadhaarBack?: { originalname: string; buffer: Buffer; mimetype?: string };
      pan?: { originalname: string; buffer: Buffer; mimetype?: string };
      selfie?: { originalname: string; buffer: Buffer; mimetype?: string };
    },
  ) {
    const merchant = await this.requireMerchant(id);
    this.assertKycAllowed(merchant);
    const save = async (
      file:
        | { originalname: string; buffer: Buffer; mimetype?: string }
        | undefined,
      name: string,
    ) => {
      if (!file) {
        return null;
      }
      const ext = file.originalname.includes('.')
        ? file.originalname.slice(file.originalname.lastIndexOf('.'))
        : '.bin';
      const stored = await this.storage.putObject({
        key: `kyc/${merchant.id}/${name}${ext}`,
        body: file.buffer,
        contentType: file.mimetype ?? 'application/octet-stream',
      });
      return stored.url;
    };
    if (files.aadhaarFront) {
      merchant.kyc.aadhaarFrontPath = await save(
        files.aadhaarFront,
        'aadhaar-front',
      );
    }
    if (files.aadhaarBack) {
      merchant.kyc.aadhaarBackPath = await save(
        files.aadhaarBack,
        'aadhaar-back',
      );
    }
    if (files.pan) {
      merchant.kyc.panImagePath = await save(files.pan, 'pan');
    }
    if (files.selfie) {
      merchant.kyc.selfiePath = await save(files.selfie, 'selfie');
    }
    await this.refreshDocumentMatch(merchant);
    await this.applyMockDocumentMatchIfReady(merchant);
    await this.kycRecords.save(merchant.kyc);
    merchant.status = MerchantStatus.KYC_PENDING;
    await this.merchants.save(merchant);
    return this.toView(merchant);
  }

  async saveOnboardingExtras(
    id: string,
    input: {
      latitude?: string;
      longitude?: string;
      shopType?: string;
      agreementAccepted?: boolean;
    },
  ) {
    const merchant = await this.requireMerchant(id);
    if (input.latitude) {
      merchant.kyc.latitude = input.latitude;
    }
    if (input.longitude) {
      merchant.kyc.longitude = input.longitude;
    }
    if (input.shopType) {
      merchant.kyc.shopType = input.shopType;
    }
    if (input.agreementAccepted) {
      merchant.kyc.agreementSignedAt = new Date();
    }
    await this.kycRecords.save(merchant.kyc);
    return this.toView(merchant);
  }

  private async refreshDocumentMatch(merchant: Merchant): Promise<void> {
    const mismatchName = (path: string | null) =>
      (path ?? '').toLowerCase().includes('mismatch');
    if (merchant.kyc.aadhaarStatus === 'VERIFIED' && merchant.kyc.aadhaarFrontPath) {
      merchant.kyc.aadhaarImageMatch = mismatchName(merchant.kyc.aadhaarFrontPath)
        ? 'MISMATCH'
        : 'MATCHED';
    }
    if (merchant.kyc.panStatus === 'VERIFIED' && merchant.kyc.panImagePath) {
      merchant.kyc.panImageMatch = mismatchName(merchant.kyc.panImagePath)
        ? 'MISMATCH'
        : 'MATCHED';
    }
  }

  /**
   * Without a live DigiLocker/liveness provider, mock mode treats verified
   * PAN+Aadhaar (and optional selfie) as document-matched so ops can activate.
   */
  private async applyMockDocumentMatchIfReady(
    merchant: Merchant,
  ): Promise<void> {
    const provider = (
      this.config.get<string>('kyc.provider') ?? 'mock'
    ).toLowerCase();
    if (provider !== 'mock') {
      return;
    }
    if (
      merchant.kyc.aadhaarStatus === 'VERIFIED' &&
      merchant.kyc.panStatus === 'VERIFIED'
    ) {
      merchant.kyc.aadhaarImageMatch = 'MATCHED';
      merchant.kyc.panImageMatch = 'MATCHED';
    }
  }

  private looksLikeImagePayload(value?: string): boolean {
    if (!value) {
      return false;
    }
    const trimmed = value.trim();
    return (
      trimmed.startsWith('data:image/') ||
      (trimmed.length > 256 && !trimmed.includes(' ') && !trimmed.includes('.'))
    );
  }

  private decodeBase64Image(
    value: string,
    contentTypeHint?: string,
  ): { buffer: Buffer; contentType: string; extension: string } {
    const dataUrl = /^data:([^;]+);base64,(.+)$/i.exec(value.trim());
    const contentType =
      dataUrl?.[1] ?? contentTypeHint ?? 'image/jpeg';
    const base64 = dataUrl?.[2] ?? value.replace(/^base64,/i, '').trim();
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'selfieBase64 is empty or invalid',
      );
    }
    const extension =
      contentType.includes('png')
        ? '.png'
        : contentType.includes('webp')
          ? '.webp'
          : '.jpg';
    return { buffer, contentType, extension };
  }

  private requireOrganizationId(merchant: Merchant): string {
    if (!merchant.organizationId) {
      throw new NexaraError(
        ErrorCodes.ORGANIZATION_NOT_FOUND,
        'Merchant is not attached to an organization',
        500,
      );
    }
    return merchant.organizationId;
  }

  private async findFilteredMerchants(filters?: {
    status?: string;
    search?: string;
  }): Promise<Merchant[]> {
    const rows = await this.merchants.find({
      relations: { kyc: true },
      order: { createdAt: 'DESC' },
    });
    const searched = filters?.search
      ? rows.filter((row) => {
          const q = filters.search!.toLowerCase();
          return (
            row.businessName.toLowerCase().includes(q) ||
            row.contactPerson.toLowerCase().includes(q) ||
            (row.email?.toLowerCase().includes(q) ?? false) ||
            row.mobile.includes(q)
          );
        })
      : rows;
    const normalizedStatus = this.normalizeStatusFilter(filters?.status);
    if (!normalizedStatus) {
      return searched;
    }
    return searched.filter((row) => {
      const aliases = this.statusAliases(row.status);
      return (
        row.status === normalizedStatus ||
        aliases.includes(filters!.status!)
      );
    });
  }

  private toKycVerificationListItem(merchant: Merchant) {
    const kyc = merchant.kyc;
    const hasPanImage = Boolean(kyc?.panImagePath);
    const hasAadhaarImage = Boolean(kyc?.aadhaarFrontPath);
    const hasSelfie = Boolean(kyc?.selfiePath);
    const hasLocation = Boolean(kyc?.latitude && kyc?.longitude);
    const hasAgreement = Boolean(kyc?.agreementSignedAt);
    const isComplete =
      kyc?.aadhaarStatus === 'VERIFIED' &&
      kyc?.panStatus === 'VERIFIED' &&
      kyc?.aadhaarImageMatch === 'MATCHED' &&
      kyc?.panImageMatch === 'MATCHED' &&
      hasPanImage &&
      hasAadhaarImage &&
      hasSelfie &&
      hasLocation &&
      hasAgreement;

    return {
      id: merchant.id,
      businessName: merchant.businessName,
      contactPerson: merchant.contactPerson,
      mobile: merchant.mobile,
      email: merchant.email,
      status: merchant.status,
      createdAt: merchant.createdAt,
      kyc: {
        panStatus: kyc?.panStatus ?? 'PENDING',
        aadhaarStatus: kyc?.aadhaarStatus ?? 'PENDING',
        panImageMatch: kyc?.panImageMatch ?? 'PENDING',
        aadhaarImageMatch: kyc?.aadhaarImageMatch ?? 'PENDING',
        hasPanImage,
        hasAadhaarImage,
        hasSelfie,
        hasLocation,
        hasAgreement,
        isComplete,
        submittedAt: kyc?.updatedAt ?? merchant.createdAt,
      },
    };
  }

  private assertKycAllowed(merchant: Merchant): void {
    if (
      merchant.status === MerchantStatus.REJECTED ||
      merchant.status === MerchantStatus.SUSPENDED
    ) {
      throw new NexaraError(
        ErrorCodes.MERCHANT_INACTIVE,
        'KYC cannot be updated for this merchant',
        409,
      );
    }
  }

  private async requireMerchant(id: string): Promise<Merchant> {
    const merchant = await this.merchants.findOne({
      where: { id },
      relations: { kyc: true },
    });
    if (!merchant) {
      throw new NexaraError(
        ErrorCodes.MERCHANT_NOT_FOUND,
        'Merchant was not found',
        404,
      );
    }
    return merchant;
  }

  private async toView(merchant: Merchant) {
    const entitlements = merchant.organizationId
      ? await this.organizations.get(merchant.organizationId)
      : null;
    const entityType =
      entitlements?.type === 'MERCHANT'
        ? 'RETAILER'
        : entitlements?.type ?? 'RETAILER';
    const dailySpent = await this.currentDailySpent(merchant.id);
    const enabledServices = this.parseEnabledServices(
      merchant.enabledServicesJson,
    );
    const percentFee =
      merchant.feeType === FeeType.PERCENTAGE ? merchant.feeValue : '0.00';
    const fixedFee =
      merchant.feeType === FeeType.FIXED ? merchant.feeValue : '10.00';

    return {
      id: merchant.id,
      businessName: merchant.businessName,
      contactPerson: merchant.contactPerson,
      mobile: merchant.mobile,
      email: merchant.email,
      address: merchant.address,
      status: merchant.status,
      displayStatus:
        merchant.status === MerchantStatus.KYC_PENDING
          ? 'PENDING_KYC'
          : merchant.status,
      entityType,
      parentId: entitlements?.parentId ?? null,
      dailyPayoutLimit: merchant.dailyPayoutLimit,
      perPayoutLimit: merchant.perPayoutLimit,
      tier: merchant.tier,
      feeType: merchant.feeType,
      feeValue: merchant.feeValue,
      gstPercent: merchant.gstPercent,
      feeConfig: {
        feeModel: merchant.feeType,
        fixedFee: parseFloat(fixedFee),
        percentFee: parseFloat(percentFee),
        taxRatePercent: parseFloat(merchant.gstPercent),
      },
      limitConfig: {
        dailyLimit: parseFloat(merchant.dailyPayoutLimit),
        perTxLimit: parseFloat(merchant.perPayoutLimit ?? '20000'),
        currentDailySpent: parseFloat(dailySpent),
      },
      enabledServices,
      organizationId: merchant.organizationId,
      organization: entitlements,
      kyc: merchant.kyc
        ? {
            aadhaarStatus: merchant.kyc.aadhaarStatus,
            aadhaarLast4: merchant.kyc.aadhaarLast4,
            panStatus: merchant.kyc.panStatus,
            panMasked: merchant.kyc.panMasked,
            aadhaarImageMatch: merchant.kyc.aadhaarImageMatch,
            panImageMatch: merchant.kyc.panImageMatch,
            hasAadhaarImage: Boolean(merchant.kyc.aadhaarFrontPath),
            hasPanImage: Boolean(merchant.kyc.panImagePath),
            hasSelfie: Boolean(merchant.kyc.selfiePath),
            agreementSignedAt: merchant.kyc.agreementSignedAt,
          }
        : null,
    };
  }
}
