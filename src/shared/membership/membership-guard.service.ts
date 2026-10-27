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

  // Members chat once they've matched (docs/matchmaking-plan.md, stage 3):
  // two members need an accepted interest between them
  // (mrkapu-matrimonial-service listing_interests) to start a conversation;
  // writing to a vendor about a booking needs none. A declined or ended
  // match closes the chat for good, existing thread or not. Threads from
  // before matching existed carry on.
  async requireCanMessage(senderId: string, recipientId: string, threadExists: boolean): Promise<void> {
    const pair = (await this.userRefModel.db
      .collection('listing_interests')
      .findOne({ pairKey: [senderId, recipientId].sort().join(':') }, { projection: { status: 1 } })) as { status?: string } | null;
    if (pair?.status === 'declined' || pair?.status === 'unmatched') {
      throw new ForbiddenException({ error: 'CHAT_CLOSED', message: 'This conversation is closed.' });
    }
    if (threadExists) return;

    await this.requireCanInitiateMessage(senderId);
    // While matchmaking is hidden (web MATCHMAKING_ENABLED, mobile
    // kMatchmakingEnabled) members can't match, so anyone may reply to a
    // marriage proposal ad.
    if (process.env.MATCHMAKING_ENABLED !== 'true') return;
    const [sender, recipient] = await Promise.all([this.getMembership(senderId), this.getMembership(recipientId)]);
    if (!sender || recipient?.accountType === 'service_account') return;
    if (pair?.status === 'accepted') return;
    throw new ForbiddenException({
      error: 'MATCH_REQUIRED',
      message: 'You can chat once you’ve matched — send interest from their ad first.',
    });
  }

  // Service accounts (vendors) can only receive messages, never start a
  // conversation.
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
