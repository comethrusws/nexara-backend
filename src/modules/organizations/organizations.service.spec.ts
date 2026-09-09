import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BankConnector } from './entities/bank-connector.entity';
import { OrganizationFeature } from './entities/organization-feature.entity';
import { Organization } from './entities/organization.entity';
import {
  BankCodes,
  Features,
  OrganizationType,
} from './organization.constants';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService entitlements', () => {
  const orgs = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };
  const grants = {
    find: jest.fn(),
    delete: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };
  const banks = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  let service: OrganizationsService;

  const admin: Organization = {
    id: 'admin',
    type: OrganizationType.ADMIN,
    name: 'Nexara',
    parentId: null,
    bankCode: null,
    status: 'ACTIVE',
  } as Organization;

  const distributor: Organization = {
    id: 'dist',
    type: OrganizationType.DISTRIBUTOR,
    name: 'West Dist',
    parentId: 'admin',
    bankCode: null,
    status: 'ACTIVE',
  } as Organization;

  const merchant: Organization = {
    id: 'merch',
    type: OrganizationType.MERCHANT,
    name: 'Shop',
    parentId: 'dist',
    bankCode: 'HDFC',
    status: 'ACTIVE',
  } as Organization;

  beforeEach(async () => {
    jest.resetAllMocks();
    // Default dataset shared by the batched queries: skeleton rows for the
    // ancestor walk, full rows for In(...) lookups.
    const allOrgs = [admin, distributor, merchant];
    const idsOf = (id: unknown): string[] | null => {
      if (typeof id === 'string') return [id];
      if (id && typeof id === 'object' && Array.isArray((id as any).value)) {
        return (id as any).value as string[];
      }
      return null;
    };
    orgs.find.mockImplementation(async (opts?: any) => {
      const ids = opts?.where?.id ? idsOf(opts.where.id) : null;
      if (ids) {
        return allOrgs.filter((o) => ids.includes(o.id));
      }
      return allOrgs.map((o) => ({ id: o.id, parentId: o.parentId }));
    });
    grants.find.mockImplementation(async (opts?: any) => {
      const orgId = opts?.where?.organizationId;
      const ids = idsOf(orgId) ?? (typeof orgId === 'string' ? [orgId] : []);
      // Fixture grants live on admin; everything else inherits.
      if (ids.includes('admin')) {
        return [
          { organizationId: 'admin', featureCode: Features.WALLET, enabled: true },
          { organizationId: 'admin', featureCode: Features.PAYOUT, enabled: true },
          { organizationId: 'admin', featureCode: Features.PAYOUT_IMPS, enabled: true },
        ];
      }
      return [];
    });
    const module = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: getRepositoryToken(Organization), useValue: orgs },
        { provide: getRepositoryToken(OrganizationFeature), useValue: grants },
        { provide: getRepositoryToken(BankConnector), useValue: banks },
        { provide: ConfigService, useValue: { get: () => 'mock' } },
      ],
    }).compile();
    service = module.get(OrganizationsService);
  });

  it('inherits parent features when a node has no custom grants', async () => {
    orgs.findOne.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'merch') {
        return merchant;
      }
      if (where.id === 'dist') {
        return distributor;
      }
      return admin;
    });
    grants.find.mockImplementation(async ({ where }: { where: { organizationId: any } }) => {
      const ids = Array.isArray(where.organizationId?.value)
        ? where.organizationId.value
        : [where.organizationId];
      if (ids.includes('admin')) {
        return [
          { organizationId: 'admin', featureCode: Features.WALLET, enabled: true },
          { organizationId: 'admin', featureCode: Features.PAYOUT, enabled: true },
          { organizationId: 'admin', featureCode: Features.PAYOUT_IMPS, enabled: true },
        ];
      }
      return [];
    });

    const features = await service.resolveFeatures('merch');
    expect(features).toEqual([
      Features.WALLET,
      Features.PAYOUT,
      Features.PAYOUT_IMPS,
    ]);
  });

  it('intersects custom child grants with the parent allow-list', async () => {
    orgs.findOne.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'merch') {
        return merchant;
      }
      if (where.id === 'dist') {
        return distributor;
      }
      return admin;
    });
    grants.find.mockImplementation(async ({ where }: { where: { organizationId: any } }) => {
      const ids = Array.isArray(where.organizationId?.value)
        ? where.organizationId.value
        : [where.organizationId];
      const rows: any[] = [];
      if (ids.includes('admin')) {
        rows.push(
          { organizationId: 'admin', featureCode: Features.WALLET, enabled: true },
          { organizationId: 'admin', featureCode: Features.PAYOUT, enabled: true },
          { organizationId: 'admin', featureCode: Features.PAYOUT_IMPS, enabled: true },
          { organizationId: 'admin', featureCode: Features.PAYOUT_UPI, enabled: true },
        );
      }
      if (ids.includes('merch')) {
        rows.push(
          { organizationId: 'merch', featureCode: Features.WALLET, enabled: true },
          { organizationId: 'merch', featureCode: Features.PAYOUT_UPI, enabled: true },
        );
      }
      return rows;
    });

    const features = await service.resolveFeatures('merch');
    expect(features).toEqual([Features.WALLET, Features.PAYOUT_UPI]);
    expect(features).not.toContain(Features.PAYOUT_IMPS);
  });

  it('uses the nearest assigned bank, else the platform default', async () => {
    orgs.findOne.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'merch') {
        return merchant;
      }
      if (where.id === 'dist') {
        return distributor;
      }
      return admin;
    });
    banks.findOne.mockResolvedValue({
      code: BankCodes.HDFC,
      enabled: true,
    });

    await expect(service.resolveBankCode('merch')).resolves.toBe(BankCodes.HDFC);
  });

  it('blocks a payout rail the organization is not entitled to', async () => {
    orgs.findOne.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'merch') {
        return merchant;
      }
      if (where.id === 'dist') {
        return distributor;
      }
      return admin;
    });
    grants.find.mockImplementation(async ({ where }: { where: { organizationId: any } }) => {
      const ids = Array.isArray(where.organizationId?.value)
        ? where.organizationId.value
        : [where.organizationId];
      const rows: any[] = [];
      if (ids.includes('admin')) {
        rows.push(
          { organizationId: 'admin', featureCode: Features.WALLET, enabled: true },
          { organizationId: 'admin', featureCode: Features.PAYOUT, enabled: true },
          { organizationId: 'admin', featureCode: Features.PAYOUT_IMPS, enabled: true },
        );
      }
      return rows;
    });

    await expect(service.assertPayoutRail('merch', 'IMPS')).resolves.toBeUndefined();
    await expect(service.assertPayoutRail('merch', 'UPI')).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });
});
