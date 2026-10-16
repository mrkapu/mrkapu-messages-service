import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type DevicePlatform = 'web' | 'android' | 'ios';

// One row per FCM registration token. A user can have several (phone,
// laptop browser, …); a token belongs to whoever registered it last, so a
// shared device that changes accounts stops notifying the old one.
@Schema({ timestamps: true, collection: 'push_device_tokens' })
export class DeviceToken {
  @Prop({ required: true, unique: true })
  token!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, enum: ['web', 'android', 'ios'] })
  platform!: DevicePlatform;
}

export const DeviceTokenSchema = SchemaFactory.createForClass(DeviceToken);
