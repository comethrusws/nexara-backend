import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { TeamController } from './team.controller';
import { AuthService } from './auth.service';
import { OtpChallenge } from './entities/otp-challenge.entity';
import { AuthSession } from './entities/auth-session.entity';
import { User } from './entities/user.entity';
import { Merchant } from '../merchants/entities/merchant.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, OtpChallenge, Merchant, Organization, AuthSession]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('auth.jwtSecret') ?? 'nexara-dev-jwt-secret',
        // Short-lived access tokens (2h) backed by the server-side session
        // registry: idle timeout, absolute lifetime, and logout revoke are
        // enforced per request in JwtAuthGuard.
        signOptions: { expiresIn: '2h' },
      }),
    }),
  ],
  controllers: [AuthController, TeamController],
  providers: [
    UsersService,
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [UsersService, AuthService, JwtModule],
})
export class AuthModule {}
