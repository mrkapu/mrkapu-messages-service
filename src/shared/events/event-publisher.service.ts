import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { Injectable, Logger } from '@nestjs/common';
import {
  DOMAIN_EVENT_SOURCE,
  type DomainEvent,
} from '../contracts/domain-events';

@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);
  private readonly eventBusName = process.env.EVENT_BUS_NAME?.trim() || undefined;
  private readonly client = new EventBridgeClient({
    region: process.env.AWS_REGION || 'ap-southeast-1',
  });

  async publish(event: DomainEvent): Promise<void> {
    if (!this.eventBusName) {
      this.logger.debug(
        `Skipping event publish for ${event.type}; EVENT_BUS_NAME is not set`,
      );
      return;
    }

    await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.eventBusName,
            Source: DOMAIN_EVENT_SOURCE,
            DetailType: event.type,
            Detail: JSON.stringify(event),
          },
        ],
      }),
    );
  }
}
