import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification } from '../../notifications/notification.entity';

type CreateNotificationInput = Partial<Notification>;

@Injectable()
export class NotificationWriterService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
  ) {}

  async create(data: CreateNotificationInput) {
    const doc = new this.notificationModel(data);
    return doc.save();
  }

  async markReadByRequestId(requestId: string) {
    return this.notificationModel
      .updateMany({ requestId }, { isRead: true })
      .exec();
  }
}
