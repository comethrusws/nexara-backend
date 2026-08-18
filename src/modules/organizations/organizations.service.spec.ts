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
    grants.find.mockImplementation(async ({ where }: { where: { organizationId: string } }) => {
      if (where.organizationId === 'admin') {
        return [
          { featureCode: Features.WALLET, enabled: true },
          { featureCode: Features.PAYOUT, enabled: true },
          { featureCode: Features.PAYOUT_IMPS, enabled: true },
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
    grants.find.mockImplementation(async ({ where }: { where: { organizationId: string } }) => {
      if (where.organizationId === 'admin') {
        return [
          { featureCode: Features.WALLET, enabled: true },
          { featureCode: Features.PAYOUT, enabled: true },
          { featureCode: Features.PAYOUT_IMPS, enabled: true },
          { featureCode: Features.PAYOUT_UPI, enabled: true },
        ];
      }
      if (where.organizationId === 'merch') {
        return [
          { featureCode: Features.WALLET, enabled: true },
          { featureCode: Features.PAYOUT_UPI, enabled: true },
        ];
      }
      return [];
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
    grants.find.mockImplementation(async ({ where }: { where: { organizationId: string } }) => {
      if (where.organizationId === 'admin') {
        return [
          { featureCode: Features.WALLET, enabled: true },
          { featureCode: Features.PAYOUT, enabled: true },
          { featureCode: Features.PAYOUT_IMPS, enabled: true },
        ];
      }
      return [];
    });

    await expect(service.assertPayoutRail('merch', 'IMPS')).resolves.toBeUndefined();
    await expect(service.assertPayoutRail('merch', 'UPI')).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });
});
