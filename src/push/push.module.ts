import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeviceToken, DeviceTokenSchema } from './device-token.entity';
import { PushService } from './push.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DeviceToken.name, schema: DeviceTokenSchema },
    ]),
  ],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
