import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ActorAuthService } from '../shared/auth/actor-auth.service';
import { MessagesService } from './messages.service';

type RequestChatBody = {
  requesterId: string;
  recipientId: string;
};

type AcceptChatBody = {
  recipientId: string;
};

type SendDirectMessageBody = {
  recipientId: string;
  text: string;
};

@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly actorAuthService: ActorAuthService,
  ) {}

  @Post('request')
  async requestChat(@Body() body: RequestChatBody) {
    return this.messagesService.requestChat(body.requesterId, body.recipientId);
  }

  @Post('request/:id/accept')
  async acceptChat(@Param('id') id: string, @Body() body: AcceptChatBody) {
    return this.messagesService.acceptRequest(id, body.recipientId);
  }

  @Get('requests')
  async listRequests(@Query('userId') userId: string) {
    return this.messagesService.listRequestsForUser(userId);
  }

  @Get('status')
  async status(
    @Query('requesterId') requesterId: string,
    @Query('recipientId') recipientId: string,
  ) {
    return this.messagesService.getStatus(requesterId, recipientId);
  }

  @Get('thread')
  async listDirectThread(
    @Headers('authorization') authorization: string | undefined,
    @Query('withUserId') withUserId: string,
  ) {
    const actorId = this.actorAuthService.getActorIdFromAuth(authorization);
    return this.messagesService.listDirectThread(actorId, withUserId);
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
