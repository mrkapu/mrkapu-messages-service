import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  createDomainEvent,
  DOMAIN_EVENT_TYPES,
} from '../shared/contracts/domain-events';
import { NotificationWriterService } from '../shared/data-access/notification-writer.service';
import { EventPublisherService } from '../shared/events/event-publisher.service';
import {
  MembershipGuardService,
  UserRef,
  UserRefDocument,
} from '../shared/membership/membership-guard.service';
import { DirectMessage } from './direct-message.entity';
import { MessageRequest } from './message-request.entity';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(MessageRequest.name)
    private readonly requestModel: Model<MessageRequest>,
    @InjectModel(DirectMessage.name)
    private readonly directMessageModel: Model<DirectMessage>,
    private readonly notificationWriter: NotificationWriterService,
    private readonly eventPublisher: EventPublisherService,
    private readonly membershipGuard: MembershipGuardService,
    @InjectModel(UserRef.name)
    private readonly userRefModel: Model<UserRefDocument>,
  ) {}

  async requestChat(requesterId: string, recipientId: string) {
    await this.membershipGuard.requireCanInitiateMessage(requesterId);
    if (requesterId === recipientId) {
      throw new ConflictException('Cannot request yourself');
    }

    const existing = await this.requestModel.findOne({
      requesterId,
      recipientId,
      status: { $in: ['pending', 'accepted'] },
    });
    if (existing) {
      return existing;
    }

    const inverseAccepted = await this.requestModel.findOne({
      requesterId: recipientId,
      recipientId: requesterId,
      status: 'accepted',
    });
    if (inverseAccepted) {
      return inverseAccepted;
    }

    const request = new this.requestModel({
      requesterId,
      recipientId,
      status: 'pending',
    });
    const saved = await request.save();

    await this.notificationWriter.create({
      userId: recipientId,
      type: 'message_request',
      title: 'New chat request',
      message: `You have a chat request from ${requesterId}`,
      fromUserId: requesterId,
      requestId: saved._id.toString(),
      isRead: false,
    });
    await this.notificationWriter.create({
      userId: requesterId,
      type: 'message_request',
      title: 'Chat request sent',
      message: `You sent a chat request to ${recipientId}`,
      fromUserId: requesterId,
      requestId: saved._id.toString(),
      isRead: false,
    });

    return saved;
  }

  async acceptRequest(id: string, recipientId: string) {
    const request = await this.requestModel.findById(id);
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.recipientId !== recipientId) {
      throw new ConflictException('Not authorized');
    }

    request.status = 'accepted';
    const saved = await request.save();
    await this.notificationWriter.markReadByRequestId(saved._id.toString());
    return saved;
  }

  async listRequestsForUser(userId: string) {
    return this.requestModel
      .find({
        $or: [{ requesterId: userId }, { recipientId: userId }],
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async getStatus(requesterId: string, recipientId: string) {
    const request =
      (await this.requestModel.findOne({ requesterId, recipientId }).lean()) ||
      (await this.requestModel
        .findOne({
          requesterId: recipientId,
          recipientId: requesterId,
        })
        .lean());

    return request || null;
  }

  async sendDirectMessage(senderId: string, recipientId: string, text: string) {
    const cleanText = text.trim();
    if (!cleanText) {
      throw new BadRequestException('Message text is required');
    }
    if (senderId === recipientId) {
      throw new ConflictException('Cannot message yourself');
    }

    // Only gate *starting* a new thread — once a conversation already
    // exists, replying stays allowed regardless of tier so nobody gets
    // retroactively locked out of a chat they already have.
    const existingThread = await this.directMessageModel
      .findOne({
        $or: [
          { senderId, recipientId },
          { senderId: recipientId, recipientId: senderId },
        ],
      })
      .lean()
      .exec();
    if (!existingThread) {
      await this.membershipGuard.requireCanInitiateMessage(senderId);
    }

    const message = await this.directMessageModel.create({
      senderId,
      recipientId,
      text: cleanText,
    });

    await this.notificationWriter.create({
      userId: recipientId,
      type: 'message',
      title: 'New message',
      message: cleanText,
      fromUserId: senderId,
      isRead: false,
    });

    await this.eventPublisher.publish(
      createDomainEvent(DOMAIN_EVENT_TYPES.messageCreated, {
        messageId: message._id.toString(),
        senderId,
        recipientId,
      }),
    );

    return message.toObject();
  }

  // Everyone the actor has exchanged direct messages with, newest first.
  // Names are first name + last initial and there's no photo — replies to
  // a proposal ad mustn't reveal more than the ad itself does.
  async listConversations(actorId: string) {
    const rows = await this.directMessageModel
      .aggregate([
        { $match: { $or: [{ senderId: actorId }, { recipientId: actorId }] } },
        { $sort: { createdAt: -1, _id: -1 } },
        {
          $group: {
            _id: { $cond: [{ $eq: ['$senderId', actorId] }, '$recipientId', '$senderId'] },
            lastText: { $first: '$text' },
            lastAt: { $first: '$createdAt' },
            lastSenderId: { $first: '$senderId' },
            unread: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$recipientId', actorId] }, { $not: ['$readAt'] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { lastAt: -1 } },
        { $limit: 100 },
      ])
      .exec();

    const ids = rows.map((r) => r._id).filter((id) => Types.ObjectId.isValid(id));
    const users = await this.userRefModel
      .find({ _id: { $in: ids } })
      .select('firstName lastName')
      .lean()
      .exec();
    const nameOf = new Map(
      users.map((u) => [
        String(u._id),
        [u.firstName, u.lastName ? `${u.lastName.trim().charAt(0)}.` : '']
          .filter(Boolean)
          .join(' ')
          .trim(),
      ]),
    );

    return rows.map((r) => ({
      userId: r._id,
      name: nameOf.get(String(r._id)) || null,
      lastText: r.lastText,
      lastAt: r.lastAt,
      lastFromMe: r.lastSenderId === actorId,
      unread: r.unread,
    }));
  }

  async listDirectThread(actorId: string, withUserId: string) {
    // Opening a thread marks what the actor received in it as read.
    await this.directMessageModel
      .updateMany(
        { senderId: withUserId, recipientId: actorId, readAt: { $exists: false } },
        { $set: { readAt: new Date() } },
      )
      .exec();
    return this.directMessageModel
      .find({
        $or: [
          { senderId: actorId, recipientId: withUserId },
          { senderId: withUserId, recipientId: actorId },
        ],
      })
      .sort({ createdAt: 1, _id: 1 })
      .limit(100)
      .lean()
      .exec();
  }
}
