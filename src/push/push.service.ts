import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Messaging, TokenMessage } from 'firebase-admin/messaging';
import { Model } from 'mongoose';
import { DevicePlatform, DeviceToken } from './device-token.entity';

const PLATFORMS: DevicePlatform[] = ['web', 'android', 'ios'];
const MAX_TOKENS_PER_USER = 10;

// FCM rejects data payloads over 4KB; the full text is always one
// /messages/thread call away, so a long message is cut short here.
const MAX_TEXT_IN_PAYLOAD = 1000;

// Error codes meaning the token will never work again and should be dropped.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export type NewMessagePush = {
  messageId: string;
  senderId: string;
  senderName: string | null;
  recipientId: string;
  text: string;
  createdAt: Date;
};

// Firebase Cloud Messaging for chat. The recipient's devices get a visible
// notification (or, with the app open, a live update of the open chat); the
// sender's own other devices get a silent update so every tab/phone they're
// signed in on stays in sync.
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private messaging: Messaging | null | undefined;

  constructor(
    @InjectModel(DeviceToken.name)
    private readonly deviceTokenModel: Model<DeviceToken>,
  ) {}

  async registerToken(userId: string, token: string, platform: string) {
    const cleanToken = (token || '').trim();
    if (!cleanToken || cleanToken.length > 4096) {
      throw new BadRequestException('A valid device token is required');
    }
    if (!PLATFORMS.includes(platform as DevicePlatform)) {
      throw new BadRequestException(`platform must be one of ${PLATFORMS.join(', ')}`);
    }

    await this.deviceTokenModel
      .updateOne(
        { token: cleanToken },
        { $set: { userId, platform } },
        { upsert: true },
      )
      .exec();

    // Old browsers/phones never unregister themselves, so keep only the most
    // recently refreshed tokens.
    const stale = await this.deviceTokenModel
      .find({ userId })
      .sort({ updatedAt: -1 })
      .skip(MAX_TOKENS_PER_USER)
      .select('_id')
      .lean()
      .exec();
    if (stale.length) {
      await this.deviceTokenModel
        .deleteMany({ _id: { $in: stale.map((s) => s._id) } })
        .exec();
    }
    return { ok: true };
  }

  async removeToken(userId: string, token: string) {
    await this.deviceTokenModel.deleteOne({ token, userId }).exec();
    return { ok: true };
  }

  // Never throws: a push failure must not fail the message send itself.
  async notifyNewMessage(msg: NewMessagePush) {
    try {
      const messaging = this.getMessaging();
      if (!messaging) return;

      // Browsers must show a notification for every push they receive
      // (Chrome otherwise shows its own "site updated in the background"),
      // so the sender's silent sync only goes to their phones.
      const devices = await this.deviceTokenModel
        .find({
          $or: [
            { userId: msg.recipientId },
            { userId: msg.senderId, platform: { $ne: 'web' } },
          ],
        })
        .lean()
        .exec();
      if (!devices.length) return;

      const title = msg.senderName || 'New message';
      const body =
        msg.text.length > 160 ? `${msg.text.slice(0, 157)}…` : msg.text;
      const data: Record<string, string> = {
        kind: 'message',
        messageId: msg.messageId,
        senderId: msg.senderId,
        recipientId: msg.recipientId,
        senderName: msg.senderName || '',
        text: msg.text.slice(0, MAX_TEXT_IN_PAYLOAD),
        createdAt: msg.createdAt.toISOString(),
      };

      const messages: TokenMessage[] = devices.map((d) =>
        d.userId === msg.recipientId
          ? this.visibleMessage(d.token, d.platform, title, body, data)
          : this.silentMessage(d.token, d.platform, data),
      );

      const res = await messaging.sendEach(messages);
      const dead: string[] = [];
      res.responses.forEach((r, i) => {
        if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) {
          dead.push(devices[i].token);
        } else if (!r.success) {
          this.logger.warn(`FCM send failed: ${r.error?.code} ${r.error?.message}`);
        }
      });
      if (dead.length) {
        await this.deviceTokenModel.deleteMany({ token: { $in: dead } }).exec();
      }
    } catch (err) {
      this.logger.error(`Push for message ${msg.messageId} failed: ${(err as Error).message}`);
    }
  }

  private visibleMessage(
    token: string,
    platform: DevicePlatform,
    title: string,
    body: string,
    data: Record<string, string>,
  ): TokenMessage {
    if (platform === 'web') {
      // Data-only, so the site's service worker builds the notification
      // itself and can link to whichever origin (dev/prod/localhost) the
      // token came from.
      return {
        token,
        data: { ...data, title, body },
        webpush: { headers: { Urgency: 'high' } },
      };
    }
    return {
      token,
      data,
      notification: { title, body },
      android: {
        priority: 'high',
        notification: { tag: `chat_${data.senderId}` },
      },
      apns: {
        payload: { aps: { sound: 'default', threadId: data.senderId } },
      },
    };
  }

  private silentMessage(
    token: string,
    platform: DevicePlatform,
    data: Record<string, string>,
  ): TokenMessage {
    const silentData = { ...data, silent: '1' };
    return {
      token,
      data: silentData,
      android: { priority: 'normal' },
      apns: {
        headers: { 'apns-push-type': 'background', 'apns-priority': '5' },
        payload: { aps: { contentAvailable: true } },
      },
    };
  }

  // Loaded on first use so cold starts that never send a push don't pay
  // for firebase-admin.
  private getMessaging(): Messaging | null {
    if (this.messaging !== undefined) return this.messaging;

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('FIREBASE_* env vars not set — chat push disabled');
      this.messaging = null;
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { cert, getApps, initializeApp } = require('firebase-admin/app') as typeof import('firebase-admin/app');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getMessaging } = require('firebase-admin/messaging') as typeof import('firebase-admin/messaging');
    const app =
      getApps()[0] ??
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    this.messaging = getMessaging(app);
    return this.messaging;
  }
}
