import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ErrorCodes, NexaraError } from '../../../common/errors/nexara-error';
import { IS_PUBLIC_KEY } from '../auth.constants';
import { AuthService } from '../auth.service';
import { UsersService } from '../users.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sid?: string }>(token);
      const user = await this.users.requireActive(payload.sub);
      // Pre-session tokens (issued before the registry) have no sid and are
      // rejected — one re-login after deploy moves everyone onto sessions.
      if (!payload.sid) {
        throw new NexaraError(
          ErrorCodes.UNAUTHORIZED,
          'Session expired. Please sign in again.',
          401,
        );
      }
      await this.auth.assertSessionActive(payload.sid, user.id);
      (request as Request & { user: unknown }).user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        merchantId: user.merchantId,
        organizationId: user.organizationId,
        sid: payload.sid,
      };
      return true;
    } catch (error) {
      if (error instanceof NexaraError) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
