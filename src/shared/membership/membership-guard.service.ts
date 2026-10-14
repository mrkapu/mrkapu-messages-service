import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';

@Schema({ collection: 'auth_users' })
export class UserRef {
  @Prop() account_type?: string;
  @Prop() personal_tier?: string;
  @Prop() personal_tier_expires_at?: Date;
  @Prop() firstName?: string;
  @Prop() lastName?: string;
}

export type UserRefDocument = HydratedDocument<UserRef>;
export const UserRefSchema = SchemaFactory.createForClass(UserRef);

@Injectable()
export class MembershipGuardService {
  constructor(
    @InjectModel(UserRef.name) private readonly userRefModel: Model<UserRefDocument>,
  ) {}

  private async getMembership(userId: string) {
    const user = await this.userRefModel
      .findById(userId)
      .select('account_type personal_tier personal_tier_expires_at')
      .lean()
      .exec();

    if (!user) return null;

    const accountType = user.account_type || 'user';
    const expiresAt = user.personal_tier_expires_at;
    const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
    const effectiveTier = isExpired ? 'free' : (user.personal_tier || 'free');

    return { accountType, effectiveTier };
  }

  // Anyone can start a conversation — replying to a marriage proposal ad is
  // free (2026-10-06: member plans no longer gate messaging). Service
  // accounts (vendors) can still only receive messages, never initiate one.
  async requireCanInitiateMessage(userId: string): Promise<void> {
    const membership = await this.getMembership(userId);
    if (!membership) return;

    if (membership.accountType === 'service_account') {
      throw new ForbiddenException({
        error: 'UPGRADE_REQUIRED',
        reason: 'service_account_cannot_initiate_message',
      });
    }
  }
}
