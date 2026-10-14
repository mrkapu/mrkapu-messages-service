import { Controller, Get, Headers, Param, Patch } from '@nestjs/common';
import { ActorAuthService } from '../shared/auth/actor-auth.service';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly actorAuthService: ActorAuthService,
  ) {}

  // userId used to be a trusted, unverified query param — anyone could read
  // anyone else's notifications by guessing their id. Now derived from the
  // caller's own bearer token, same as every other authenticated route here.
  @Get()
  async list(@Headers('authorization') authorization: string | undefined) {
    const actorId = this.actorAuthService.getActorIdFromAuth(authorization);
    return this.notificationsService.listForUser(actorId);
  }

  @Patch(':id/read')
  async markRead(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actorId = this.actorAuthService.getActorIdFromAuth(authorization);
    return this.notificationsService.markRead(id, actorId);
  }
}
