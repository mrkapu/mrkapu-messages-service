import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Notification,
  NotificationSchema,
} from '../../notifications/notification.entity';
import { NotificationWriterService } from './notification-writer.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  providers: [NotificationWriterService],
  exports: [NotificationWriterService],
})
export class SharedNotificationWriterModule {}
