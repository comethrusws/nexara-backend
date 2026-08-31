import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { BankConnector } from './entities/bank-connector.entity';
import { OrganizationFeature } from './entities/organization-feature.entity';
import { Organization } from './entities/organization.entity';
import {
  ALLOWED_CHILDREN,
  BANK_CATALOG,
  BANK_RAIL_METADATA,
  BankCode,
  BankCodes,
  FEATURE_CATALOG,
  FeatureCode,
  Features,
  OrganizationStatus,
  OrganizationType,
  railFeature,
} from './organization.constants';

@Injectable()
export class OrganizationsService implements OnModuleInit {
  constructor(
    @InjectRepository(Organization)
    private readonly orgs: Repository<Organization>,
    @InjectRepository(OrganizationFeature)
    private readonly grants: Repository<OrganizationFeature>,
    @InjectRepository(BankConnector)
    private readonly banks: Repository<BankConnector>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSeeded();
  }

  async ensureSeeded(): Promise<Organization> {
    for (const bank of BANK_CATALOG) {
      const existing = await this.banks.findOne({ where: { code: bank.code } });
      if (!existing) {
        const preferred =
          this.config.get<string>('bank.provider') === 'yesbank'
            ? BankCodes.YESBANK
            : BankCodes.MOCK;
        await this.banks.save(
          this.banks.create({
            code: bank.code,
            name: bank.name,
            enabled: bank.code === BankCodes.MOCK || bank.code === BankCodes.YESBANK,
            isDefault: bank.code === preferred,
          }),
        );
      }
    }

    const defaults = await this.banks.find({ where: { isDefault: true } });
    if (defaults.length === 0) {
      await this.banks.update({ code: BankCodes.MOCK }, { isDefault: true });
    }

    let admin = await this.orgs.findOne({
      where: { type: OrganizationType.ADMIN },
    });
    if (!admin) {
      admin = await this.orgs.save(
        this.orgs.create({
          type: OrganizationType.ADMIN,
          name: 'Nexara',
          contactPerson: 'Platform Admin',
          status: OrganizationStatus.ACTIVE,
          parentId: null,
          bankCode: null,
        }),
      );
      await this.replaceGrants(
        admin.id,
        FEATURE_CATALOG.map((item) => item.code),
      );
    }
    return admin;
  }

  catalog() {
    return {
      features: FEATURE_CATALOG,
      banks: BANK_CATALOG,
      hierarchy: ALLOWED_CHILDREN,
    };
  }

  async create(input: {
    type: OrganizationType;
    parentId: string;
    name: string;
    contactPerson?: string;
    mobile?: string;
    email?: string;
  }) {
    if (input.type === OrganizationType.ADMIN) {
      throw new NexaraError(
        ErrorCodes.INVALID_HIERARCHY,
        'The ADMIN organization already exists',
      );
    }
    const parent = await this.requireOrg(input.parentId);
    this.assertChildAllowed(parent.type, input.type);
    const saved = await this.orgs.save(
      this.orgs.create({
        type: input.type,
        parentId: parent.id,
        name: input.name,
        contactPerson: input.contactPerson ?? null,
        mobile: input.mobile ?? null,
        email: input.email ?? null,
        status: OrganizationStatus.ACTIVE,
        bankCode: null,
      }),
    );
    return this.toView(saved);
  }

  async get(id: string) {
    return this.toView(await this.requireOrg(id));
  }

  async list(filters?: { parentId?: string; type?: OrganizationType }) {
    const where: Record<string, string> = {};
    if (filters?.parentId) {
      where.parentId = filters.parentId;
    }
    if (filters?.type) {
      where.type = filters.type;
    }
    const rows = await this.orgs.find({
      where,
      order: { createdAt: 'ASC' },
    });
    return Promise.all(rows.map((row) => this.toView(row)));
  }

  async children(id: string) {
    await this.requireOrg(id);
    return this.list({ parentId: id });
  }

  async setFeatures(
    id: string,
    input: { inherit?: boolean; features?: string[] },
  ) {
    const org = await this.requireOrg(id);
    if (input.inherit === true) {
      await this.grants.delete({ organizationId: org.id });
      return this.toView(org);
    }
    if (input.features === undefined) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'features is required unless inherit is true',
      );
    }
    const requested = this.normalizeFeatures(input.features);
    if (org.parentId) {
      const parentResolved = await this.resolveFeatures(org.parentId);
      const illegal = requested.filter((code) => !parentResolved.includes(code));
      if (illegal.length > 0) {
        throw new NexaraError(
          ErrorCodes.FEATURE_DISABLED,
          `Parent does not allow features: ${illegal.join(', ')}`,
          409,
        );
      }
    }
    await this.replaceGrants(org.id, requested);
    return this.toView(org);
  }

  async setBank(id: string, bankCode: string) {
    const org = await this.requireOrg(id);
    if (bankCode === 'INHERIT') {
      org.bankCode = null;
    } else {
      await this.requireEnabledBank(bankCode);
      org.bankCode = bankCode;
    }
    await this.orgs.save(org);
    return this.toView(org);
  }

  async setStatus(id: string, status: OrganizationStatus) {
    const org = await this.requireOrg(id);
    if (
      org.type === OrganizationType.ADMIN &&
      status === OrganizationStatus.SUSPENDED
    ) {
      throw new NexaraError(
        ErrorCodes.INVALID_HIERARCHY,
        'The ADMIN organization cannot be suspended',
        409,
      );
    }
    org.status = status;
    await this.orgs.save(org);
    return this.toView(org);
  }

  async listBanks() {
    const rows = await this.banks.find({ order: { code: 'ASC' } });
    return rows;
  }

  async listBanksEnriched() {
    const rows = await this.listBanks();
    return rows.map((row) => this.enrichBank(row));
  }

  private enrichBank(row: BankConnector) {
    const meta = BANK_RAIL_METADATA[row.code] ?? BANK_RAIL_METADATA.MOCK;
    return {
      id: meta.railId,
      railId: meta.railId,
      code: row.code,
      name: row.name,
      provider: meta.provider,
      status: row.enabled ? 'ACTIVE' : 'STANDBY',
      priority: meta.priority,
      supportedModes: meta.supportedModes,
      avgClearingTime: meta.avgClearingTime,
      uptimePercent: meta.uptimePercent,
      successRate: meta.successRate,
      dailyCapacity: meta.dailyCapacity,
      enabled: row.enabled,
      isDefault: row.isDefault,
    };
  }

  async setDefaultBank(bankCode: string) {
    const resolved = this.normalizeBankRailId(bankCode);
    await this.requireEnabledBank(resolved);
    const rows = await this.banks.find();
    for (const row of rows) {
      row.isDefault = row.code === resolved;
    }
    await this.banks.save(rows);
    return this.listBanksEnriched();
  }

  normalizeBankRailId(input: string): string {
    const normalized = input.toUpperCase();
    for (const [code, meta] of Object.entries(BANK_RAIL_METADATA)) {
      if (meta.railId === input || meta.railId === normalized || code === normalized) {
        return code;
      }
    }
    return normalized;
  }

  async setBankEnabled(code: string, enabled: boolean) {
    const bank = await this.banks.findOne({ where: { code } });
    if (!bank) {
      throw new NexaraError(
        ErrorCodes.BANK_DISABLED,
        `Unknown bank ${code}`,
        404,
      );
    }
    if (!enabled && bank.isDefault) {
      throw new NexaraError(
        ErrorCodes.BANK_DISABLED,
        'Cannot disable the default bank. Switch the default first.',
        409,
      );
    }
    bank.enabled = enabled;
    await this.banks.save(bank);
    return this.listBanks();
  }

  async resolveFeatures(organizationId: string): Promise<FeatureCode[]> {
    const chain = await this.chain(organizationId);
    let allowed = new Set<FeatureCode>(
      FEATURE_CATALOG.map((item) => item.code),
    );
    for (const org of chain) {
      const own = await this.grants.find({
        where: { organizationId: org.id, enabled: true },
      });
      if (own.length === 0) {
        continue;
      }
      const ownCodes = new Set(own.map((row) => row.featureCode));
      allowed = new Set(
        [...allowed].filter((code) => ownCodes.has(code)),
      );
    }
    return FEATURE_CATALOG.map((item) => item.code).filter((code) =>
      allowed.has(code),
    );
  }

  async resolveBankCode(organizationId: string): Promise<BankCode> {
    const chain = await this.chain(organizationId);
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const code = chain[i].bankCode;
      if (code) {
        return this.requireEnabledBank(code);
      }
    }
    const fallback = await this.banks.findOne({ where: { isDefault: true } });
    if (!fallback) {
      throw new NexaraError(
        ErrorCodes.BANK_NOT_CONFIGURED,
        'No default bank is configured',
        503,
      );
    }
    return this.requireEnabledBank(fallback.code);
  }

  async assertFeature(organizationId: string, feature: FeatureCode): Promise<void> {
    const features = await this.resolveFeatures(organizationId);
    if (!features.includes(feature)) {
      throw new NexaraError(
        ErrorCodes.FEATURE_DISABLED,
        `Feature ${feature} is not enabled for this organization`,
        403,
      );
    }
  }

  async assertPayoutRail(
    organizationId: string,
    paymentMode: string,
  ): Promise<void> {
    await this.assertFeature(organizationId, Features.PAYOUT);
    await this.assertFeature(organizationId, railFeature(paymentMode));
  }

  async assertAncestorsActive(organizationId: string): Promise<void> {
    const chain = await this.chain(organizationId);
    const blocked = chain.find(
      (org) => org.status === OrganizationStatus.SUSPENDED,
    );
    if (blocked) {
      throw new NexaraError(
        ErrorCodes.MERCHANT_INACTIVE,
        `${blocked.name} is suspended`,
        409,
      );
    }
  }

  async createMerchantOrganization(input: {
    parentId: string;
    name: string;
    contactPerson?: string;
    mobile?: string;
    email?: string;
    organizationType?: OrganizationType;
  }): Promise<Organization> {
    const created = await this.create({
      type: input.organizationType ?? OrganizationType.MERCHANT,
      parentId: input.parentId,
      name: input.name,
      contactPerson: input.contactPerson,
      mobile: input.mobile,
      email: input.email,
    });
    return this.requireOrg(created.id);
  }

  private async chain(organizationId: string): Promise<Organization[]> {
    const result: Organization[] = [];
    let current: Organization | null = await this.requireOrg(organizationId);
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current.id)) {
        throw new NexaraError(
          ErrorCodes.INVALID_HIERARCHY,
          'Organization hierarchy contains a cycle',
          500,
        );
      }
      seen.add(current.id);
      result.unshift(current);
      current = current.parentId
        ? await this.orgs.findOne({ where: { id: current.parentId } })
        : null;
    }
    return result;
  }

  private assertChildAllowed(
    parentType: OrganizationType,
    childType: OrganizationType,
  ): void {
    if (!ALLOWED_CHILDREN[parentType].includes(childType)) {
      throw new NexaraError(
        ErrorCodes.INVALID_HIERARCHY,
        `${parentType} cannot have a ${childType} child`,
        409,
      );
    }
  }

  private normalizeFeatures(features: string[]): FeatureCode[] {
    const allowed = new Set(FEATURE_CATALOG.map((item) => item.code));
    const unique = [...new Set(features)];
    const invalid = unique.filter((code) => !allowed.has(code as FeatureCode));
    if (invalid.length > 0) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        `Unknown features: ${invalid.join(', ')}`,
      );
    }
    return unique as FeatureCode[];
  }

  private async replaceGrants(
    organizationId: string,
    features: FeatureCode[],
  ): Promise<void> {
    await this.grants.delete({ organizationId });
    if (features.length === 0) {
      return;
    }
    await this.grants.save(
      features.map((featureCode) =>
        this.grants.create({
          organizationId,
          featureCode,
          enabled: true,
        }),
      ),
    );
  }

  private async requireEnabledBank(code: string): Promise<BankCode> {
    const bank = await this.banks.findOne({ where: { code } });
    if (!bank || !bank.enabled) {
      throw new NexaraError(
        ErrorCodes.BANK_DISABLED,
        `Bank ${code} is not enabled`,
        409,
      );
    }
    return bank.code as BankCode;
  }

  async requireOrg(id: string): Promise<Organization> {
    const org = await this.orgs.findOne({ where: { id } });
    if (!org) {
      throw new NexaraError(
        ErrorCodes.ORGANIZATION_NOT_FOUND,
        'Organization was not found',
        404,
      );
    }
    return org;
  }

  private async toView(org: Organization) {
    const [features, resolvedBank, defaultBank] = await Promise.all([
      this.resolveFeatures(org.id),
      this.resolveBankCode(org.id),
      this.banks.findOne({ where: { isDefault: true } }),
    ]);
    const own = await this.grants.find({ where: { organizationId: org.id } });
    return {
      id: org.id,
      type: org.type,
      name: org.name,
      contactPerson: org.contactPerson,
      mobile: org.mobile,
      email: org.email,
      status: org.status,
      parentId: org.parentId,
      assignedBank: org.bankCode,
      resolvedBank,
      defaultBank: defaultBank?.code ?? null,
      featureMode: own.length === 0 ? 'INHERIT' : 'CUSTOM',
      features,
    };
  }
}
