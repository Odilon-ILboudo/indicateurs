import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export interface AuthenticatedUser {
  id: string;
  username: string;
}

interface PlatonJwtPayload extends jwt.JwtPayload {
  sub: string;
  username: string;
}

/**
 * Vérifie le token `Authorization: Bearer` envoyé par le frontend (voir auth.interceptor.ts).
 *
 * Comportement contrôlé par NODE_ENV :
 * - production : vérification cryptographique complète (signature + expiration) avec `jwtSecret`.
 *   À utiliser quand indicateurs est déployé aux côtés de SON PLaTon (même secret partagé).
 * - dev (par défaut) : les développeurs s'authentifient sur le PLaTon de PRODUCTION
 *   (https://platon.univ-eiffel.fr), dont le secret de signature est inconnu ici - on ne peut
 *   donc que décoder le payload (sans vérifier la signature) et contrôler l'expiration (`exp`).
 *   Un token expiré rejette quand même la requête (l'utilisateur est "mis à la porte").
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Token manquant');
    }

    const isProd = this.configService.get('NODE_ENV') === 'production';
    const payload = isProd ? this.verifyStrict(token) : this.verifyExpirationOnly(token);

    request.user = { id: payload.sub, username: payload.username } as AuthenticatedUser;
    return true;
  }

  private verifyStrict(token: string): PlatonJwtPayload {
    try {
      const secret = this.configService.get<string>('jwtSecret') ?? 'secret';
      return jwt.verify(token, secret) as PlatonJwtPayload;
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }

  private verifyExpirationOnly(token: string): PlatonJwtPayload {
    const payload = jwt.decode(token) as PlatonJwtPayload | null;
    if (!payload || typeof payload !== 'object' || !payload.sub) {
      throw new UnauthorizedException('Token invalide');
    }
    if (!payload.exp || payload.exp * 1000 <= Date.now()) {
      throw new UnauthorizedException('Token expiré');
    }
    return payload;
  }

  private extractToken(request: { headers?: { authorization?: string } }): string | null {
    const header = request.headers?.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length);
  }
}
