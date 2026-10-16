import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PushModule } from '../push/push.module';
import { SharedAuthModule } from '../shared/auth/shared-auth.module';
import { SharedNotificationWriterModule } from '../shared/data-access/shared-notification-writer.module';
import { SharedEventsModule } from '../shared/events/shared-events.module';
import {
  MembershipGuardService,
  UserRef,
  UserRefSchema,
} from '../shared/membership/membership-guard.service';
import { DirectMessage, DirectMessageSchema } from './direct-message.entity';
import { MessageRequest, MessageRequestSchema } from './message-request.entity';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MessageRequest.name, schema: MessageRequestSchema },
      { name: DirectMessage.name, schema: DirectMessageSchema },
      { name: UserRef.name, schema: UserRefSchema },
    ]),
    SharedAuthModule,
    SharedNotificationWriterModule,
    SharedEventsModule,
    PushModule,
  ],
  providers: [MessagesService, MembershipGuardService],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
