import { Inject, Injectable, OnModuleInit, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Payout, PayoutStatus } from '../payouts/entities/payout.entity';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { validateFeeSlabsJson } from '../../common/validation/fee-slabs.validator';
import { KYC_PORT, type KycPort } from '../../integrations/kyc/kyc.types';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../../integrations/storage/storage.types';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { AuthUser, UserRole } from '../auth/auth.constants';
import { FeeEngineService } from '../fee-engine/fee-engine.service';
import { UsersService } from '../auth/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  Features,
  OrganizationType,
} from '../organizations/organization.constants';
import { OrganizationsService } from '../organizations/organizations.service';
import { WalletService } from '../wallet/wallet.service';
import {
  CreateMerchantDto,
  ProvisionDownlineDto,
  PublicOnboardingDto,
  UpdateMerchantDto,
  UpdatePendingOnboardingDto,
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
    @Inject(forwardRef(() => WalletService))
    private readonly wallets: WalletService,
    private readonly organizations: OrganizationsService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly feeEngine: FeeEngineService,
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

  /**
   * Asserts that a Super Distributor or Distributor has completed KYC and is ACTIVE
   * before allowing them to add, remove, or manage sub-entities.
   * Admin and Ops bypass this check as platform bosses.
   */
  async assertKycDoneForManagement(caller?: AuthUser): Promise<void> {
    if (!caller) return;
    if (caller.role === UserRole.ADMIN || caller.role === UserRole.OPS) {
      return;
    }
    if (
      caller.role === UserRole.SUPER_DISTRIBUTOR ||
      caller.role === UserRole.DISTRIBUTOR
    ) {
      if (!caller.merchantId) {
        throw new NexaraError(
          ErrorCodes.FORBIDDEN,
          'Your account does not have an associated merchant profile',
          403,
        );
      }
      const callerMerchant = await this.merchants.findOne({
        where: { id: caller.merchantId },
      });
      if (!callerMerchant || callerMerchant.status !== MerchantStatus.ACTIVE) {
        throw new NexaraError(
          ErrorCodes.KYC_INCOMPLETE,
          'Your account KYC verification must be approved and active before you can manage sub-entities',
          403,
        );
      }
      return;
    }
    throw new NexaraError(
      ErrorCodes.FORBIDDEN,
      'Only Super Distributors, Distributors, or Administrators can manage sub-entities',
      403,
    );
  }

  /**
   * Asserts that target organization / merchant belongs to the caller's hierarchy.
   * Admin and Ops bypass this check.
   */
  async assertEntityInHierarchy(
    caller: AuthUser,
    targetMerchant: Merchant,
  ): Promise<void> {
    if (caller.role === UserRole.ADMIN || caller.role === UserRole.OPS) {
      return;
    }
    if (!caller.organizationId || !targetMerchant.organizationId) {
      throw new NexaraError(
        ErrorCodes.FORBIDDEN,
        'Target entity is not within your hierarchy',
        403,
      );
    }
    const isChild = await this.organizations.isDescendant(
      caller.organizationId,
      targetMerchant.organizationId,
    );
    if (!isChild) {
      throw new NexaraError(
        ErrorCodes.FORBIDDEN,
        'Target entity is not within your hierarchy',
        403,
      );
    }
  }

  async create(input: CreateMerchantDto, caller?: AuthUser) {
    const admin = await this.organizations.ensureSeeded();

    if (caller) {
      await this.assertKycDoneForManagement(caller);

      if (caller.role === UserRole.SUPER_DISTRIBUTOR) {
        const requestedType = input.entityType?.toUpperCase();
        if (requestedType === 'SUPER_DISTRIBUTOR') {
          throw new NexaraError(
            ErrorCodes.FORBIDDEN,
            'Super Distributors cannot create other Super Distributors',
            403,
          );
        }
        if (input.parentOrganizationId && input.parentOrganizationId.trim()) {
          const targetParent = input.parentOrganizationId.trim();
          const isValidParent =
            targetParent === caller.organizationId ||
            (await this.organizations.isDescendant(
              caller.organizationId!,
              targetParent,
            ));
          if (!isValidParent) {
            throw new NexaraError(
              ErrorCodes.FORBIDDEN,
              'Parent organization must be within your hierarchy',
              403,
            );
          }
        } else {
          input.parentOrganizationId = caller.organizationId!;
        }
      } else if (caller.role === UserRole.DISTRIBUTOR) {
        const requestedType = input.entityType?.toUpperCase();
        if (
          requestedType === 'DISTRIBUTOR' ||
          requestedType === 'SUPER_DISTRIBUTOR'
        ) {
          throw new NexaraError(
            ErrorCodes.FORBIDDEN,
            'Distributors can only create Retailers / Merchants',
            403,
          );
        }
        input.parentOrganizationId = caller.organizationId!;
      }
    }

    const parentId =
      input.parentOrganizationId && input.parentOrganizationId.trim()
        ? input.parentOrganizationId
        : admin.id;
    const businessName = input.businessName || `Merchant (+91 ${input.mobile})`;
    const contactPerson =
      input.contactPerson || `Mobile Contact (+91 ${input.mobile})`;
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
    // New merchants inherit the platform rate card; admins can override
    // per-merchant afterwards on the merchant detail page.
    let platformRates: {
      distributorCommissionPercent?: string;
      superDistributorCommissionPercent?: string;
      masterDistributorCommissionPercent?: string;
      gstPercent?: string;
    } | null = null;
    try {
      platformRates = await this.feeEngine.getConfig();
    } catch {
      platformRates = null;
    }
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
      gstPercent: input.gstPercent ?? platformRates?.gstPercent ?? '18.00',
      distributorCommissionPercent:
        input.distributorCommissionPercent ??
        platformRates?.distributorCommissionPercent ??
        '0.20',
      superDistributorCommissionPercent:
        input.superDistributorCommissionPercent ??
        platformRates?.superDistributorCommissionPercent ??
        '0.025',
      masterDistributorCommissionPercent:
        input.masterDistributorCommissionPercent ??
        platformRates?.masterDistributorCommissionPercent ??
        '0.010',
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
      actorEmail: caller?.email ?? 'system',
      actorRole: caller?.role ?? 'ADMIN',
      action: 'MERCHANT_CREATED',
      merchantId: saved.id,
      details: `Created merchant ${saved.businessName}${caller ? ` under ${caller.role}` : ''}`,
    });
    return this.toView(saved);
  }

  async get(id: string, caller?: AuthUser) {
    const merchant = await this.requireMerchant(id);
    if (
      caller &&
      (caller.role === UserRole.SUPER_DISTRIBUTOR ||
        caller.role === UserRole.DISTRIBUTOR)
    ) {
      if (merchant.id !== caller.merchantId) {
        await this.assertEntityInHierarchy(caller, merchant);
      }
    } else if (caller && caller.role === UserRole.MERCHANT) {
      if (merchant.id !== caller.merchantId) {
        throw new NexaraError(
          ErrorCodes.FORBIDDEN,
          'You do not have access to this merchant profile',
          403,
        );
      }
    }
    return this.toView(merchant);
  }

  async findByOrganizationId(organizationId: string): Promise<Merchant | null> {
    return this.merchants.findOne({ where: { organizationId } });
  }

  async list(filters?: { status?: string; search?: string }, caller?: AuthUser) {
    const filtered = await this.findFilteredMerchants(filters, caller);
    if (filtered.length === 0) {
      return [];
    }
    // Batched: 1 org query + 1 payouts query for the whole page instead of
    // ~2N per-row queries (org entitlement view + full payout history scan).
    const orgIds = [
      ...new Set(
        filtered
          .map((row) => row.organizationId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [orgRows, spentByMerchant] = await Promise.all([
      this.organizations.rawByIds(orgIds),
      this.dailySpentByMerchantIds(filtered.map((row) => row.id)),
    ]);
    const orgById = new Map(orgRows.map((org) => [org.id, org]));
    return filtered.map((row) =>
      this.toListView(
        row,
        orgById.get(row.organizationId ?? ''),
        spentByMerchant.get(row.id) ?? '0.00',
      ),
    );
  }

  /**
   * Flat downline for Super Distributor / Distributor portals.
   * Scoped to descendant orgs only (excludes the caller's own merchant).
   */
  async listDownline(caller: AuthUser) {
    if (
      caller.role !== UserRole.SUPER_DISTRIBUTOR &&
      caller.role !== UserRole.DISTRIBUTOR
    ) {
      throw new NexaraError(
        ErrorCodes.FORBIDDEN,
        'Only Super Distributors and Distributors can view a downline network',
        403,
      );
    }
    if (!caller.organizationId) {
      throw new NexaraError(
        ErrorCodes.FORBIDDEN,
        'Your account does not have an associated organization',
        403,
      );
    }

    const descendantOrgIds = await this.organizations.getDescendantOrgIds(
      caller.organizationId,
    );
    if (descendantOrgIds.length === 0) {
      return [];
    }

    const rows = await this.merchants.find({
      where: { organizationId: In(descendantOrgIds) },
      relations: { kyc: true },
      order: { createdAt: 'DESC' },
    });

    // Batched: org types for exactly these rows (1 lightweight query, no
    // entitlement views) + wallet presence (1 query).
    const orgIds = [
      ...new Set(
        rows
          .map((row) => row.organizationId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const orgs = await this.organizations.rawByIds(orgIds);
    const orgById = new Map(orgs.map((org) => [org.id, org]));
    const walletIds = await this.wallets.findMappedMerchantIds(
      rows.map((row) => row.id),
    );

    return rows.map((merchant) => {
      const org = merchant.organizationId
        ? orgById.get(merchant.organizationId)
        : undefined;
      const entityType =
        org?.type === OrganizationType.MERCHANT || !org?.type
          ? 'RETAILER'
          : org.type;
      return {
        id: merchant.id,
        businessName: merchant.businessName,
        contactPerson: merchant.contactPerson,
        mobile: merchant.mobile,
        email: merchant.email,
        status: merchant.status,
        displayStatus: this.resolveKycDisplayStatus(merchant),
        entityType,
        organizationId: merchant.organizationId,
        createdAt: merchant.createdAt,
        hasWallet: walletIds.has(merchant.id),
      };
    });
  }

  /**
   * Partner self-service provision of a child mobile (SD → Dist/Retailer, Dist → Retailer).
   */
  async provisionDownline(caller: AuthUser, input: ProvisionDownlineDto) {
    if (
      caller.role !== UserRole.SUPER_DISTRIBUTOR &&
      caller.role !== UserRole.DISTRIBUTOR
    ) {
      throw new NexaraError(
        ErrorCodes.FORBIDDEN,
        'Only Super Distributors and Distributors can provision downline entities',
        403,
      );
    }

    const mobile = input.mobile.replace(/\D/g, '').slice(-10);
    if (!/^\d{10}$/.test(mobile)) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'mobile must be 10 digits',
        400,
      );
    }

    const existing = await this.merchants.findOne({
      where: { mobile },
      order: { createdAt: 'DESC' },
    });
    if (existing) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'This mobile number is already provisioned',
        409,
      );
    }

    return this.create(
      {
        mobile,
        entityType: input.entityType,
        parentOrganizationId: input.parentOrganizationId,
        businessName: input.businessName,
        contactPerson: input.contactPerson,
      },
      caller,
    );
  }

  async listKycVerifications(
    filters?: { status?: string; search?: string },
    caller?: AuthUser,
  ) {
    const filtered = await this.findFilteredMerchants(filters, caller);
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
      displayStatus: this.resolveKycDisplayStatus(merchant),
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

  private resolveKycDisplayStatus(
    merchant: Merchant,
  ): 'PENDING_REVIEW' | 'NOT_STARTED' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' {
    if (merchant.status === MerchantStatus.ACTIVE) {
      return 'APPROVED';
    }
    if (merchant.status === MerchantStatus.REJECTED) {
      return 'REJECTED';
    }
    if (merchant.status === MerchantStatus.SUSPENDED) {
      return 'SUSPENDED';
    }
    // CREATED / KYC_PENDING only count as "pending review" once the merchant
    // has actually submitted KYC documents. A provisioned merchant that never
    // submitted anything is "not started", even if onboarding flipped the raw
    // status to KYC_PENDING mid-flow.
    const hasSubmittedKyc = Boolean(
      merchant.kyc?.panImagePath ||
      merchant.kyc?.aadhaarFrontPath ||
      merchant.kyc?.selfiePath,
    );
    return hasSubmittedKyc ? 'PENDING_REVIEW' : 'NOT_STARTED';
  }

  /**
   * Load a stored KYC document for admin viewing. The path is resolved to a
   * storage key and strictly scoped to the `kyc/` namespace so a crafted
   * query parameter can never escape into other objects.
   */
  async streamKycFile(
    path: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    if (!path?.trim()) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'path query parameter is required',
        400,
      );
    }
    const key = this.extractStorageKey(path.trim()).split(/[?#]/)[0];
    const segments = key.split('/').filter(Boolean);
    if (
      segments.length < 2 ||
      segments[0] !== 'kyc' ||
      segments.some((segment) => segment === '..' || segment.includes('\\'))
    ) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'path must reference a stored KYC document',
        400,
      );
    }
    if (typeof this.storage.getObject !== 'function') {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Document streaming is not supported by the configured storage driver',
        500,
      );
    }
    try {
      return await this.storage.getObject(key);
    } catch {
      throw new NexaraError(
        ErrorCodes.KYC_DOCUMENT_NOT_FOUND,
        'KYC document was not found',
        404,
      );
    }
  }

  async update(
    id: string,
    input: UpdateMerchantDto,
    actorEmail = 'ops',
    caller?: AuthUser,
  ) {
    const merchant = await this.requireMerchant(id);

    if (
      caller &&
      (caller.role === UserRole.SUPER_DISTRIBUTOR ||
        caller.role === UserRole.DISTRIBUTOR)
    ) {
      await this.assertKycDoneForManagement(caller);
      await this.assertEntityInHierarchy(caller, merchant);

      if (
        input.parentOrganizationId &&
        merchant.organizationId &&
        input.parentOrganizationId !== merchant.organizationId
      ) {
        const isAllowed = await this.organizations.isDescendant(
          caller.organizationId!,
          input.parentOrganizationId,
        );
        if (!isAllowed) {
          throw new NexaraError(
            ErrorCodes.FORBIDDEN,
            'Cannot reassign entity to an organization outside your hierarchy',
            403,
          );
        }
        await this.organizations.reassignParent(
          merchant.organizationId,
          input.parentOrganizationId,
        );
      }
    } else if (
      caller &&
      (caller.role === UserRole.ADMIN || caller.role === UserRole.OPS)
    ) {
      if (input.parentOrganizationId && merchant.organizationId) {
        const currentOrg = await this.organizations.get(merchant.organizationId);
        if (currentOrg.parentId !== input.parentOrganizationId) {
          await this.organizations.reassignParent(
            merchant.organizationId,
            input.parentOrganizationId,
          );
          await this.audit.record({
            actorEmail,
            actorRole: 'ADMIN',
            action: 'ADMIN_OVERRULE_HIERARCHY',
            merchantId: merchant.id,
            details: `Admin reassigned entity parent from ${currentOrg.parentId} to ${input.parentOrganizationId}`,
            previousValue: currentOrg.parentId,
            newValue: input.parentOrganizationId,
          });
        }
      }

      if (merchant.organizationId) {
        const currentOrg = await this.organizations.get(merchant.organizationId);
        const adminOrg = await this.organizations.ensureSeeded();
        if (currentOrg.parentId && currentOrg.parentId !== adminOrg.id) {
          await this.audit.record({
            actorEmail,
            actorRole: 'ADMIN',
            action: 'ADMIN_OVERRULE',
            merchantId: merchant.id,
            details: `Admin overruled settings for entity ${merchant.businessName} under downline ${currentOrg.parentId}`,
          });
        }
      }
    }

    const previous = { status: merchant.status, tier: merchant.tier };
    if (input.businessName) {
      merchant.businessName = input.businessName;
    }
    if (input.contactPerson) {
      merchant.contactPerson = input.contactPerson;
    }
    if (input.email !== undefined) {
      merchant.email = input.email;
    }
    if (input.address) {
      merchant.address = input.address;
    }
    if (
      merchant.organizationId &&
      (input.businessName || input.contactPerson || input.email)
    ) {
      await this.organizations.updateContactDetails(merchant.organizationId, {
        name: input.businessName,
        contactPerson: input.contactPerson,
        email: input.email,
      });
    }
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
    if (input.feeSlabsJson !== undefined) {
      if (input.feeSlabsJson) {
        this.validateFeeSlabs(input.feeSlabsJson);
      }
      merchant.feeSlabsJson = input.feeSlabsJson || null;
    }
    if (input.channel) {
      merchant.channel = input.channel;
    }
    if (input.distributorCommissionPercent !== undefined) {
      merchant.distributorCommissionPercent =
        input.distributorCommissionPercent;
    }
    if (input.superDistributorCommissionPercent !== undefined) {
      merchant.superDistributorCommissionPercent =
        input.superDistributorCommissionPercent;
    }
    if (input.masterDistributorCommissionPercent !== undefined) {
      merchant.masterDistributorCommissionPercent =
        input.masterDistributorCommissionPercent;
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
      actorRole: caller?.role ?? 'ADMIN',
      action: 'MERCHANT_UPDATED',
      merchantId: merchant.id,
      details: input.reason ?? 'Merchant record updated',
      previousValue: previous,
      newValue: { status: merchant.status, tier: merchant.tier },
    });
    return this.toView(merchant);
  }

  private validateFeeSlabs(feeSlabsJson: string): void {
    validateFeeSlabsJson(feeSlabsJson);
  }

  async network(caller?: AuthUser) {
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

    if (
      caller &&
      (caller.role === UserRole.SUPER_DISTRIBUTOR ||
        caller.role === UserRole.DISTRIBUTOR) &&
      caller.organizationId
    ) {
      const userRoots = orgs.filter((org) => org.id === caller.organizationId);
      return Promise.all(userRoots.map((root) => attach(root)));
    }

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

  async activate(id: string, caller?: AuthUser) {
    const merchant = await this.requireMerchant(id);

    if (
      caller &&
      (caller.role === UserRole.SUPER_DISTRIBUTOR ||
        caller.role === UserRole.DISTRIBUTOR)
    ) {
      await this.assertKycDoneForManagement(caller);
      await this.assertEntityInHierarchy(caller, merchant);
    } else if (
      caller &&
      (caller.role === UserRole.ADMIN || caller.role === UserRole.OPS)
    ) {
      if (merchant.organizationId) {
        const currentOrg = await this.organizations.get(merchant.organizationId);
        const adminOrg = await this.organizations.ensureSeeded();
        if (currentOrg.parentId && currentOrg.parentId !== adminOrg.id) {
          await this.audit.record({
            actorEmail: caller.email ?? 'admin',
            actorRole: 'ADMIN',
            action: 'ADMIN_OVERRULE_ACTIVATE',
            merchantId: merchant.id,
            details: `Admin overruled and activated entity ${merchant.businessName}`,
          });
        }
      }
    }

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

    // Ensure merchant has actually completed onboarding before approval.
    // A missing KYC row (legacy records) means nothing was submitted — report
    // everything as missing (409), never TypeError into a bare 500.
    const kyc: Partial<MerchantKyc> = merchant.kyc ?? {};
    const missingOnboarding: string[] = [];
    if (!kyc.panImagePath) {
      missingOnboarding.push('PAN card image');
    }
    if (!kyc.aadhaarFrontPath) {
      missingOnboarding.push('Aadhaar card image');
    }
    if (!kyc.selfiePath) {
      missingOnboarding.push('Selfie photo');
    }
    if (!kyc.latitude || !kyc.longitude) {
      missingOnboarding.push('GPS location');
    }
    if (!kyc.agreementSignedAt) {
      missingOnboarding.push('Merchant agreement');
    }
    if (!merchant.organizationId) {
      missingOnboarding.push('Organization linkage (contact platform support)');
    }
    if (missingOnboarding.length > 0) {
      throw new NexaraError(
        ErrorCodes.KYC_INCOMPLETE,
        `Merchant has not completed onboarding. Missing: ${missingOnboarding.join(', ')}`,
        409,
      );
    }

    // Verify KYC documents were verified
    if (
      kyc.aadhaarStatus !== 'VERIFIED' ||
      kyc.panStatus !== 'VERIFIED'
    ) {
      throw new NexaraError(
        ErrorCodes.KYC_INCOMPLETE,
        'Aadhaar and PAN verification must be completed before activation',
        409,
      );
    }
    if (
      kyc.aadhaarImageMatch !== 'MATCHED' ||
      kyc.panImageMatch !== 'MATCHED'
    ) {
      throw new NexaraError(
        ErrorCodes.KYC_INCOMPLETE,
        'Document images must match API verification details',
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

  async suspend(
    id: string,
    reason?: string,
    actorEmail = 'ops',
    caller?: AuthUser,
  ) {
    const merchant = await this.requireMerchant(id);

    if (
      caller &&
      (caller.role === UserRole.SUPER_DISTRIBUTOR ||
        caller.role === UserRole.DISTRIBUTOR)
    ) {
      await this.assertKycDoneForManagement(caller);
      await this.assertEntityInHierarchy(caller, merchant);
    } else if (
      caller &&
      (caller.role === UserRole.ADMIN || caller.role === UserRole.OPS)
    ) {
      if (merchant.organizationId) {
        const currentOrg = await this.organizations.get(merchant.organizationId);
        const adminOrg = await this.organizations.ensureSeeded();
        if (currentOrg.parentId && currentOrg.parentId !== adminOrg.id) {
          await this.audit.record({
            actorEmail,
            actorRole: 'ADMIN',
            action: 'ADMIN_OVERRULE_SUSPEND',
            merchantId: merchant.id,
            details: `Admin overruled and suspended entity ${merchant.businessName}`,
          });
        }
      }
    }

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
      actorRole: caller?.role ?? 'ADMIN',
      action: 'MERCHANT_SUSPENDED',
      merchantId: merchant.id,
      details: reason ?? 'Merchant suspended',
    });
    return this.toView(merchant);
  }

  async deleteMerchant(id: string, actorEmail: string, caller?: AuthUser) {
    const merchant = await this.requireMerchant(id);
    if (
      caller &&
      (caller.role === UserRole.SUPER_DISTRIBUTOR ||
        caller.role === UserRole.DISTRIBUTOR)
    ) {
      await this.assertKycDoneForManagement(caller);
      await this.assertEntityInHierarchy(caller, merchant);
    }

    if (merchant.organizationId) {
      const children = await this.organizations.children(
        merchant.organizationId,
      );
      if (children && children.length > 0) {
        throw new NexaraError(
          ErrorCodes.INVALID_HIERARCHY,
          'Cannot remove entity that still has sub-distributors or retailers. Reassign or remove them first.',
          409,
        );
      }
    }

    merchant.status = MerchantStatus.SUSPENDED;
    if (!merchant.businessName.startsWith('[REMOVED]')) {
      merchant.businessName = `[REMOVED] ${merchant.businessName}`;
    }
    await this.merchants.save(merchant);

    const isOverrule =
      caller &&
      (caller.role === UserRole.ADMIN || caller.role === UserRole.OPS) &&
      merchant.organizationId &&
      (await this.organizations.get(merchant.organizationId)).parentId !==
        (await this.organizations.ensureSeeded()).id;

    await this.audit.record({
      actorEmail,
      actorRole: caller?.role ?? 'ADMIN',
      action: isOverrule ? 'ADMIN_OVERRULE_REMOVE' : 'ENTITY_REMOVED',
      merchantId: merchant.id,
      details: `Entity removed from active network by ${caller?.role ?? 'ADMIN'} (${actorEmail})`,
    });

    return { success: true, removed: true };
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
    const entries = await Promise.all(
      Object.entries(paths).map(async ([label, stored]) => {
        const url = stored ? await this.presignStoredObject(stored) : null;
        return [label, url] as const;
      }),
    );
    for (const [label, url] of entries) {
      result[label] = url;
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
    const spent = await this.dailySpentByMerchantIds([merchantId]);
    return spent.get(merchantId) ?? '0.00';
  }

  /**
   * Today's settled spend for a batch of merchants — ONE query. The date
   * and status filters run in SQL (the old per-row version loaded the full
   * payout history and filtered in JS).
   */
  private async dailySpentByMerchantIds(
    merchantIds: string[],
  ): Promise<Map<string, string>> {
    const totals = new Map<string, string>();
    const unique = [...new Set(merchantIds.filter(Boolean))];
    if (unique.length === 0) {
      return totals;
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const rows = await this.payouts.find({
      where: {
        merchantId: In(unique),
        status: Not(In([PayoutStatus.FAILED])),
        createdAt: MoreThanOrEqual(start),
      },
      select: { merchantId: true, amount: true },
    });
    const sums = new Map<string, number>();
    for (const row of rows) {
      sums.set(
        row.merchantId,
        (sums.get(row.merchantId) ?? 0) + parseFloat(row.amount),
      );
    }
    for (const [id, total] of sums) {
      totals.set(id, total.toFixed(2));
    }
    return totals;
  }

  async requireActive(id: string): Promise<Merchant> {
    const merchant = await this.requireMerchant(id);
    if (merchant.status !== MerchantStatus.ACTIVE) {
      throw new NexaraError(
        ErrorCodes.MERCHANT_INACTIVE,
        'Only ACTIVE merchants may use wallet funding and payouts',
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
      const isEntityRole =
        existingUser.role === UserRole.MERCHANT ||
        existingUser.role === UserRole.DISTRIBUTOR ||
        existingUser.role === UserRole.SUPER_DISTRIBUTOR;
      if (!isEntityRole || !existingUser.merchantId) {
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
    let entityUserRole: UserRole = UserRole.MERCHANT;
    if (merchant.organizationId) {
      try {
        const org = await this.organizations.get(merchant.organizationId);
        if (org?.type === OrganizationType.SUPER_DISTRIBUTOR) {
          entityUserRole = UserRole.SUPER_DISTRIBUTOR;
        } else if (org?.type === OrganizationType.DISTRIBUTOR) {
          entityUserRole = UserRole.DISTRIBUTOR;
        }
      } catch {
        // fallback to MERCHANT
      }
    }
    await this.users.createMerchantUser({
      email,
      name: input.contactPerson,
      mobile: merchant.mobile,
      merchantId: merchant.id,
      organizationId: merchant.organizationId,
      password: input.password,
      mpin: input.mpin,
      role: entityUserRole,
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
      aadhaarFront?: {
        originalname: string;
        buffer: Buffer;
        mimetype?: string;
      };
      aadhaarBack?: { originalname: string; buffer: Buffer; mimetype?: string };
      pan?: { originalname: string; buffer: Buffer; mimetype?: string };
      selfie?: { originalname: string; buffer: Buffer; mimetype?: string };
    },
  ) {
    const merchant = await this.requireMerchant(id);
    this.assertKycAllowed(merchant);
    const save = async (
      file:
        { originalname: string; buffer: Buffer; mimetype?: string } | undefined,
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

  /**
   * Merchant self-serve correction of a pending KYC submission.
   * Mobile / PAN / Aadhaar stay locked; profile + location + selfie may change.
   */
  async updatePendingOnboarding(
    merchantId: string,
    userId: string,
    input: UpdatePendingOnboardingDto,
    actorEmail: string,
  ) {
    const hasUpdate =
      input.businessName !== undefined ||
      input.contactPerson !== undefined ||
      input.email !== undefined ||
      input.address !== undefined ||
      input.latitude !== undefined ||
      input.longitude !== undefined ||
      input.shopType !== undefined ||
      input.selfieBase64 !== undefined;
    if (!hasUpdate) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Provide at least one field to update',
        400,
      );
    }

    const merchant = await this.requireMerchant(merchantId);
    if (
      merchant.status !== MerchantStatus.CREATED &&
      merchant.status !== MerchantStatus.KYC_PENDING
    ) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Onboarding can only be edited while KYC is pending review',
        409,
      );
    }

    const previous = {
      businessName: merchant.businessName,
      contactPerson: merchant.contactPerson,
      email: merchant.email,
      address: merchant.address,
      shopType: merchant.kyc?.shopType ?? null,
      latitude: merchant.kyc?.latitude ?? null,
      longitude: merchant.kyc?.longitude ?? null,
      hasSelfie: Boolean(merchant.kyc?.selfiePath),
    };

    if (input.businessName !== undefined) {
      merchant.businessName = input.businessName.trim();
    }
    if (input.contactPerson !== undefined) {
      merchant.contactPerson = input.contactPerson.trim();
    }
    if (input.email !== undefined) {
      merchant.email = input.email.toLowerCase().trim();
    }
    if (input.address !== undefined) {
      merchant.address = input.address.trim();
    }
    await this.merchants.save(merchant);

    if (merchant.organizationId) {
      await this.organizations.updateContactDetails(merchant.organizationId, {
        email: merchant.email ?? undefined,
        contactPerson: merchant.contactPerson,
        name: merchant.businessName,
      });
    }

    await this.users.updateMerchantProfile(userId, {
      email: input.email !== undefined ? merchant.email ?? undefined : undefined,
      name:
        input.contactPerson !== undefined
          ? merchant.contactPerson
          : undefined,
    });

    if (input.latitude !== undefined) {
      merchant.kyc.latitude = input.latitude;
    }
    if (input.longitude !== undefined) {
      merchant.kyc.longitude = input.longitude;
    }
    if (input.shopType !== undefined) {
      merchant.kyc.shopType = input.shopType;
    }

    if (this.looksLikeImagePayload(input.selfieBase64)) {
      const decoded = this.decodeBase64Image(
        input.selfieBase64!,
        input.selfieContentType,
      );
      const stored = await this.storage.putObject({
        key: `kyc/${merchant.id}/selfie${decoded.extension}`,
        body: decoded.buffer,
        contentType: decoded.contentType,
      });
      merchant.kyc.selfiePath = stored.url;
    } else if (input.selfieBase64 !== undefined) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'selfieBase64 must be a valid image data-URL or base64 payload',
        400,
      );
    }

    await this.kycRecords.save(merchant.kyc);
    merchant.status = MerchantStatus.KYC_PENDING;
    await this.merchants.save(merchant);

    await this.audit.record({
      actorEmail,
      actorRole: 'MERCHANT',
      action: 'MERCHANT_ONBOARDING_UPDATED',
      merchantId: merchant.id,
      details: 'Merchant updated pending KYC submission',
      previousValue: previous,
      newValue: {
        businessName: merchant.businessName,
        contactPerson: merchant.contactPerson,
        email: merchant.email,
        address: merchant.address,
        shopType: merchant.kyc.shopType,
        latitude: merchant.kyc.latitude,
        longitude: merchant.kyc.longitude,
        hasSelfie: Boolean(merchant.kyc.selfiePath),
      },
    });

    return this.toView(merchant);
  }

  private async refreshDocumentMatch(merchant: Merchant): Promise<void> {
    const mismatchName = (path: string | null) =>
      (path ?? '').toLowerCase().includes('mismatch');
    if (
      merchant.kyc.aadhaarStatus === 'VERIFIED' &&
      merchant.kyc.aadhaarFrontPath
    ) {
      merchant.kyc.aadhaarImageMatch = mismatchName(
        merchant.kyc.aadhaarFrontPath,
      )
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
    const contentType = dataUrl?.[1] ?? contentTypeHint ?? 'image/jpeg';
    const base64 = dataUrl?.[2] ?? value.replace(/^base64,/i, '').trim();
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'selfieBase64 is empty or invalid',
      );
    }
    const extension = contentType.includes('png')
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

  private async findFilteredMerchants(
    filters?: {
      status?: string;
      search?: string;
    },
    caller?: AuthUser,
  ): Promise<Merchant[]> {
    let allowedOrgIds: string[] | null = null;
    if (
      caller &&
      (caller.role === UserRole.SUPER_DISTRIBUTOR ||
        caller.role === UserRole.DISTRIBUTOR)
    ) {
      if (!caller.organizationId) {
        return [];
      }
      const descendants = await this.organizations.getDescendantOrgIds(
        caller.organizationId,
      );
      allowedOrgIds = [caller.organizationId, ...descendants];
    } else if (caller && caller.role === UserRole.MERCHANT) {
      allowedOrgIds = caller.organizationId ? [caller.organizationId] : [];
    }

    const where: any = {};
    if (allowedOrgIds !== null) {
      if (allowedOrgIds.length === 0) {
        return [];
      }
      where.organizationId = In(allowedOrgIds);
    }

    const rows = await this.merchants.find({
      where,
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
        row.status === normalizedStatus || aliases.includes(filters!.status!)
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
      displayStatus: this.resolveKycDisplayStatus(merchant),
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
    const [entitlements, dailySpent] = await Promise.all([
      merchant.organizationId
        ? this.organizations.get(merchant.organizationId)
        : Promise.resolve(null),
      this.currentDailySpent(merchant.id),
    ]);
    return this.buildView(merchant, entitlements, dailySpent);
  }

  /**
   * List-path view: takes pre-batched org identity + spend so `list()`
   * stays at a constant query count. The `organization` field carries the
   * identity stub (id/type/parentId — everything list consumers read);
   * single-record `get()` still returns the full entitlement view.
   */
  private toListView(
    merchant: Merchant,
    org: { id: string; type: string; parentId: string | null } | undefined,
    dailySpent: string,
  ) {
    return this.buildView(
      merchant,
      org ? { id: org.id, type: org.type, parentId: org.parentId } : null,
      dailySpent,
    );
  }

  private buildView(
    merchant: Merchant,
    entitlements: {
      id?: string;
      type?: string;
      parentId?: string | null;
    } | null,
    dailySpent: string,
  ) {
    const entityType =
      entitlements?.type === 'MERCHANT'
        ? 'RETAILER'
        : (entitlements?.type ?? 'RETAILER');
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
      displayStatus: this.resolveKycDisplayStatus(merchant),
      entityType,
      parentId: entitlements?.parentId ?? null,
      dailyPayoutLimit: merchant.dailyPayoutLimit,
      perPayoutLimit: merchant.perPayoutLimit,
      tier: merchant.tier,
      feeType: merchant.feeType,
      feeValue: merchant.feeValue,
      gstPercent: merchant.gstPercent,
      feeSlabsJson: merchant.feeSlabsJson,
      channel: merchant.channel,
      distributorCommissionPercent: merchant.distributorCommissionPercent,
      superDistributorCommissionPercent:
        merchant.superDistributorCommissionPercent,
      masterDistributorCommissionPercent:
        merchant.masterDistributorCommissionPercent,
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
