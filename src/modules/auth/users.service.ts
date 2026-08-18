import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { UserRole } from './auth.constants';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureStaffUser(
      this.config.get<string>('auth.adminEmail') ?? 'admin@nexara.com',
      this.config.get<string>('auth.adminPassword') ?? 'NexaraAdmin#2026',
      'Platform Admin',
      UserRole.ADMIN,
    );
    await this.ensureStaffUser(
      this.config.get<string>('auth.opsEmail') ?? 'ops@nexara.com',
      this.config.get<string>('auth.adminPassword') ?? 'NexaraAdmin#2026',
      'Nexara Operations',
      UserRole.OPS,
    );
  }

  async requireActive(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user || user.status !== 'ACTIVE') {
      throw new NexaraError(ErrorCodes.UNAUTHORIZED, 'User is not active', 401);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findByMobile(mobile: string): Promise<User | null> {
    return this.users.findOne({ where: { mobile } });
  }

  async createMerchantUser(input: {
    email: string;
    name: string;
    mobile: string;
    merchantId: string;
    organizationId: string | null;
    password?: string;
  }): Promise<User> {
    const email = input.email.toLowerCase().trim();
    const existingEmail = await this.findByEmail(email);
    if (existingEmail) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'A user with this email already exists',
        409,
      );
    }
    const existingMobile = await this.findByMobile(input.mobile);
    if (existingMobile) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'A user with this mobile already exists',
        409,
      );
    }
    const password =
      input.password ??
      this.config.get<string>('auth.merchantDefaultPassword') ??
      'ChangeMe#2026';
    const user = this.users.create({
      email,
      name: input.name,
      mobile: input.mobile,
      role: UserRole.MERCHANT,
      merchantId: input.merchantId,
      organizationId: input.organizationId,
      passwordHash: await bcrypt.hash(password, 10),
      status: 'ACTIVE',
    });
    return this.users.save(user);
  }

  async listByRole(role: UserRole): Promise<User[]> {
    return this.users.find({ where: { role, status: 'ACTIVE' } });
  }

  async listAllActive(): Promise<User[]> {
    return this.users.find({ where: { status: 'ACTIVE' } });
  }

  private async ensureStaffUser(
    email: string,
    password: string,
    name: string,
    role: UserRole,
  ): Promise<void> {
    const existing = await this.findByEmail(email);
    if (existing) {
      return;
    }
    await this.users.save(
      this.users.create({
        email: email.toLowerCase().trim(),
        name,
        mobile: null,
        role,
        merchantId: null,
        organizationId: null,
        passwordHash: await bcrypt.hash(password, 10),
        status: 'ACTIVE',
      }),
    );
  }
}
