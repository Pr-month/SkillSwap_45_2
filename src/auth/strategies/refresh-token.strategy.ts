import { Injectable, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { jwtConfig, TJwtConfig } from '../../config/jwt.config';
import { TJwtPayload } from '../auth.types';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    @Inject(jwtConfig.KEY)
    private readonly config: TJwtConfig,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const body = request?.body as { refreshToken?: string } | undefined;
          const cookies = request?.cookies as
            { refreshToken?: string } | undefined;
          const token = body?.refreshToken ?? cookies?.refreshToken ?? null;
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: config.refreshSecret ?? 'default-refresh-secret',
    });
  }

  validate(payload: TJwtPayload) {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken: payload.refreshToken,
    };
  }
}
