import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export const MESSAGE_REQUEST_STATUSES = [
  'pending',
  'accepted',
  'rejected',
] as const;

export type MessageRequestStatus = (typeof MESSAGE_REQUEST_STATUSES)[number];

@Schema({ timestamps: true })
export class MessageRequest {
  @Prop({ required: true })
  requesterId!: string;

  @Prop({ required: true })
  recipientId!: string;

  @Prop({
    required: true,
    enum: MESSAGE_REQUEST_STATUSES,
    default: 'pending',
  })
  status!: MessageRequestStatus;
}

export const MessageRequestSchema =
  SchemaFactory.createForClass(MessageRequest);
