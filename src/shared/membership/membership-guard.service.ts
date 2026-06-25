import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';

@Schema({ collection: 'auth_users' })
export class UserRef {
  @Prop() account_type?: string;
  @Prop() membership_tier?: string;
  @Prop() membership_expires_at?: Date;
}

export type UserRefDocument = HydratedDocument<UserRef>;
export const UserRefSchema = SchemaFactory.createForClass(UserRef);

const TRACK_OF: Record<string, string> = {
  free: 'user',
  premium: 'user',
  silver: 'service_account',
  platinum: 'service_account',
};

const TIER_RANK: Record<string, number> = {
  free: 0,
  premium: 1,
  silver: 0,
  platinum: 1,
};

@Injectable()
export class MembershipGuardService {
  constructor(
    @InjectModel(UserRef.name) private readonly userRefModel: Model<UserRefDocument>,
  ) {}

  private async getMembership(userId: string) {
    const user = await this.userRefModel
      .findById(userId)
      .select('account_type membership_tier membership_expires_at')
      .lean()
      .exec();

    if (!user) return null;

    const accountType = user.account_type || 'user';
    const expiresAt = user.membership_expires_at;
    const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
    const defaultTier = accountType === 'service_account' ? 'silver' : 'free';
    const effectiveTier = isExpired ? defaultTier : (user.membership_tier || defaultTier);

    return { accountType, effectiveTier };
  }

  async requireTier(userId: string, requiredTier: string, feature: string): Promise<void> {
    const membership = await this.getMembership(userId);
    if (!membership) return;

    const { accountType, effectiveTier } = membership;

    // Track mismatch: service_account can never satisfy a user-track tier requirement.
    const requiredTrack = TRACK_OF[requiredTier];
    if (requiredTrack && requiredTrack !== accountType) {
      throw new ForbiddenException({
        error: 'UPGRADE_REQUIRED',
        requiredTier,
        feature,
      });
    }

    const effectiveRank = TIER_RANK[effectiveTier] ?? 0;
    const requiredRank = TIER_RANK[requiredTier] ?? 0;

    if (effectiveRank < requiredRank) {
      throw new ForbiddenException({
        error: 'UPGRADE_REQUIRED',
        requiredTier,
        feature,
      });
    }
  }

  // Service accounts can only receive messages, not initiate them.
  async requireCanInitiateMessage(userId: string): Promise<void> {
    const membership = await this.getMembership(userId);
    if (!membership) return;

    if (membership.accountType === 'service_account') {
      throw new ForbiddenException({
        error: 'UPGRADE_REQUIRED',
        requiredTier: 'premium',
        feature: 'send_direct_message',
      });
    }

    if (membership.effectiveTier !== 'premium') {
      throw new ForbiddenException({
        error: 'UPGRADE_REQUIRED',
        requiredTier: 'premium',
        feature: 'send_direct_message',
      });
    }
  }
}
