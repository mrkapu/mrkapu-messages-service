import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class DirectMessage {
  @Prop({ required: true, index: true })
  senderId!: string;

  @Prop({ required: true, index: true })
  recipientId!: string;

  @Prop({ required: true, trim: true })
  text!: string;

  @Prop()
  readAt?: Date;
}

export const DirectMessageSchema = SchemaFactory.createForClass(DirectMessage);
