import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import jwt, { JwtPayload } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { loadConfig } from '../../config/env';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwks = jwksClient({
    jwksUri: `https://cognito-idp.${loadConfig().COGNITO_REGION}.amazonaws.com/${loadConfig().COGNITO_USER_POOL_ID}/.well-known/jwks.json`,
    cache: true,
    cacheMaxAge: 10 * 60 * 1000,
  });

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'] as string | undefined;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = auth.slice(7);

    const decoded = jwt.decode(token, { complete: true });
    if (!decoded?.header.kid) throw new UnauthorizedException('bad token');

    const key = await this.jwks.getSigningKey(decoded.header.kid);
    const cfg = loadConfig();
    const payload = jwt.verify(token, key.getPublicKey(), {
      algorithms: ['RS256'],
      issuer: cfg.JWT_ISSUER,
      audience: cfg.JWT_AUDIENCE,
    }) as JwtPayload;

    req.user = {
      id: payload['custom:user_id'] ?? payload.sub,
      tenantId: payload['custom:tenant_id'],
      roles: (payload['custom:roles'] as string | undefined)?.split(',') ?? [],
      email: payload['email'],
    };
    if (!req.user.tenantId) throw new UnauthorizedException('missing tenant');
    return true;
  }
}
