import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { PushService } from '../push/push.service';
import { ActorAuthService } from '../shared/auth/actor-auth.service';
import { MessagesService } from './messages.service';

type RequestChatBody = {
  requesterId?: string;
  recipientId: string;
};

type SendDirectMessageBody = {
  recipientId: string;
  text: string;
};

type RegisterDeviceBody = {
  token: string;
  platform: string;
};

@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly actorAuthService: ActorAuthService,
    private readonly pushService: PushService,
  ) {}

  // Chat requests act as the signed-in member. Clients still send their own
  // id in the body / query (requesterId, recipientId, userId); it's ignored
  // — trusting it let anyone act as, or read the requests of, anyone else.
  @Post('request')
  async requestChat(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: RequestChatBody,
  ) {
    const actorId = this.actorAuthService.getActorIdFromAuth(authorization);
    return this.messagesService.requestChat(actorId, body.recipientId);
  }

  @Post('request/:id/accept')
  async acceptChat(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    const actorId = this.actorAuthService.getActorIdFromAuth(authorization);
    return this.messagesService.acceptRequest(id, actorId);
  }

  @Get('requests')
  async listRequests(@Headers('authorization') authorization: string | undefined) {
    const actorId = this.actorAuthService.getActorIdFromAuth(authorization);
    return this.messagesService.listRequestsForUser(actorId);
  }

  // Between the signed-in member and the other id given (either param).
  @Get('status')
  async status(
    @Headers('authorization') authorization: string | undefined,
    @Query('requesterId') requesterId: string,
    @Query('recipientId') recipientId: string,
  ) {
    const actorId = this.actorAuthService.getActorIdFromAuth(authorization);
    const otherId = requesterId === actorId ? recipientId : requesterId;
    return this.messagesService.getStatus(actorId, otherId);
  }

  @Get('conversations')
  async listConversations(
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actorId = this.actorAuthService.getActorIdFromAuth(authorization);
    return this.messagesService.listConversations(actorId);
  }

  @Get('thread')
  async listDirectThread(
    @Headers('authorization') authorization: string | undefined,
    @Query('withUserId') withUserId: string,
  ) {
    const actorId = this.actorAuthService.getActorIdFromAuth(authorization);
    return this.messagesService.listDirectThread(actorId, withUserId);
  }

  // Firebase Cloud Messaging token for the caller's browser/phone, so new
  // messages reach it as push notifications and live chat updates.
  @Post('devices')
  async registerDevice(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: RegisterDeviceBody,
  ) {
    const actorId = this.actorAuthService.getActorIdFromAuth(authorization);
    return this.pushService.registerToken(actorId, body?.token, body?.platform);
  }

  // Called on sign-out so a shared device stops getting the old account's
  // messages.
  @Post('devices/remove')
  async removeDevice(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { token: string },
  ) {
    const actorId = this.actorAuthService.getActorIdFromAuth(authorization);
    return this.pushService.removeToken(actorId, body?.token);
  }

  @Post('direct')
  async sendDirectMessage(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: SendDirectMessageBody,
  ) {
    const actorId = this.actorAuthService.getActorIdFromAuth(authorization);
    return this.messagesService.sendDirectMessage(
      actorId,
      body.recipientId,
      body.text,
    );
  }
}
