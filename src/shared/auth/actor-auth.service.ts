import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

type JwtPayload = {
  uid?: string;
};

@Injectable()
export class ActorAuthService {
  constructor(private readonly jwtService: JwtService) {}

  getActorIdFromAuth(authorization?: string): string {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header',
      );
    }

    const token = authorization.slice(7).trim();

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: process.env.JWT_SECRET || 'your_jwt_secret',
      });

      if (!payload?.uid) {
        throw new UnauthorizedException('Invalid auth token');
      }

      return payload.uid;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
