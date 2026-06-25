import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ActorAuthService } from './actor-auth.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your_jwt_secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [ActorAuthService],
  exports: [JwtModule, ActorAuthService],
})
export class SharedAuthModule {}
