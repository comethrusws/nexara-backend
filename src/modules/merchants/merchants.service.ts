import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { IsNull, Repository } from 'typeorm';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { KYC_PORT, type KycPort } from '../../integrations/kyc/kyc.types';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../auth/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Features } from '../organizations/organization.constants';
import { OrganizationsService } from '../organizations/organizations.service';
import { WalletService } from '../wallet/wallet.service';
import { CreateMerchantDto, UpdateMerchantDto } from './dto/merchant.dto';
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
    @Inject(KYC_PORT) private readonly kyc: KycPort,
    private readonly wallets: WalletService,
    private readonly organizations: OrganizationsService,
    private readonly users: UsersService,
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
        email: merchant.email,
      });
      merchant.organizationId = org.id;
      await this.merchants.save(merchant);
    }
  }

  async create(input: CreateMerchantDto) {
    const admin = await this.organizations.ensureSeeded();
    const parentId = input.parentOrganizationId ?? admin.id;
    const org = await this.organizations.createMerchantOrganization({
      parentId,
      name: input.businessName,
      contactPerson: input.contactPerson,
      mobile: input.mobile,
      email: input.email,
    });
    const merchant = this.merchants.create({
      businessName: input.businessName,
      contactPerson: input.contactPerson,
      mobile: input.mobile,
      email: input.email,
      address: input.address,
      status: MerchantStatus.CREATED,
      dailyPayoutLimit: input.dailyPayoutLimit,
      perPayoutLimit: input.perPayoutLimit ?? null,
      tier: input.tier ?? MerchantTier.SILVER,
      feeType: input.feeType ?? FeeType.FIXED,
      feeValue: input.feeValue ?? '10.00',
      gstPercent: input.gstPercent ?? '18.00',
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
    await this.users.createMerchantUser({
      email: saved.email,
      name: saved.contactPerson,
      mobile: saved.mobile,
      merchantId: saved.id,
      organizationId: saved.organizationId,
      password: input.password,
    });
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
    const rows = await this.merchants.find({
      relations: { kyc: true },
      order: { createdAt: 'DESC' },
    });
    const searched = filters?.search
      ? rows.filter((row) => {
          const q = filters.search!.toLowerCase();
          return (
            row.businessName.toLowerCase().includes(q) ||
            row.email.toLowerCase().includes(q) ||
            row.mobile.includes(q)
          );
        })
      : rows;
    const filtered = filters?.status
      ? searched.filter((row) => row.status === filters.status)
      : searched;
    return Promise.all(filtered.map((row) => this.toView(row)));
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

  async suspend(id: string) {
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
    return this.toView(merchant);
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

  async storeKycFiles(
    id: string,
    files: {
      aadhaarFront?: { originalname: string; buffer: Buffer };
      aadhaarBack?: { originalname: string; buffer: Buffer };
      pan?: { originalname: string; buffer: Buffer };
      selfie?: { originalname: string; buffer: Buffer };
    },
  ) {
    const merchant = await this.requireMerchant(id);
    this.assertKycAllowed(merchant);
    const dir = join(process.cwd(), 'uploads', 'kyc', merchant.id);
    await mkdir(dir, { recursive: true });
    const save = async (
      file: { originalname: string; buffer: Buffer } | undefined,
      name: string,
    ) => {
      if (!file) {
        return null;
      }
      const ext = file.originalname.includes('.')
        ? file.originalname.slice(file.originalname.lastIndexOf('.'))
        : '.bin';
      const path = join(dir, `${name}${ext}`);
      await writeFile(path, file.buffer);
      return path;
    };
    if (files.aadhaarFront) {
      merchant.kyc.aadhaarFrontPath = await save(files.aadhaarFront, 'aadhaar-front');
    }
    if (files.aadhaarBack) {
      merchant.kyc.aadhaarBackPath = await save(files.aadhaarBack, 'aadhaar-back');
    }
    if (files.pan) {
      merchant.kyc.panImagePath = await save(files.pan, 'pan');
    }
    if (files.selfie) {
      merchant.kyc.selfiePath = await save(files.selfie, 'selfie');
    }
    await this.refreshDocumentMatch(merchant);
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
    return {
      id: merchant.id,
      businessName: merchant.businessName,
      contactPerson: merchant.contactPerson,
      mobile: merchant.mobile,
      email: merchant.email,
      address: merchant.address,
      status: merchant.status,
      dailyPayoutLimit: merchant.dailyPayoutLimit,
      perPayoutLimit: merchant.perPayoutLimit,
      tier: merchant.tier,
      feeType: merchant.feeType,
      feeValue: merchant.feeValue,
      gstPercent: merchant.gstPercent,
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
