import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { TeamController } from './team.controller';
import { AuthService } from './auth.service';
import { OtpChallenge } from './entities/otp-challenge.entity';
import { User } from './entities/user.entity';
import { Merchant } from '../merchants/entities/merchant.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, OtpChallenge, Merchant]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('auth.jwtSecret') ?? 'nexara-dev-jwt-secret',
        signOptions: { expiresIn: '7d' },
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
