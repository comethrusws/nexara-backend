import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { BANK_CATALOG } from '../organization.constants';

const CREATE_TYPES = ['SUPER_DISTRIBUTOR', 'DISTRIBUTOR'] as const;
const BANKS = BANK_CATALOG.map((item) => item.code);

export class CreateOrganizationDto {
  @IsIn(CREATE_TYPES)
  type: (typeof CREATE_TYPES)[number];

  @IsUUID()
  parentId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class SetFeaturesDto {
  @IsOptional()
  @IsBoolean()
  inherit?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}

export class SetBankDto {
  @IsIn([...BANKS, 'INHERIT'])
  bankCode: string;
}

export class SetDefaultBankDto {
  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsString()
  railId?: string;
}

export class UpdateBankConnectorDto {
  @Type(() => Boolean)
  @IsBoolean()
  enabled: boolean;
}

export class SetOrganizationStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status: 'ACTIVE' | 'SUSPENDED';
}
