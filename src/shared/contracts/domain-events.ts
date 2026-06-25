export const DOMAIN_EVENT_SOURCE = 'mrkapu.backend';

export const DOMAIN_EVENT_TYPES = {
  userProfileUpdated: 'user.profile.updated',
  wallPostCreated: 'wall.post.created',
  wallPostUpdated: 'wall.post.updated',
  wallPostDeleted: 'wall.post.deleted',
  messageCreated: 'message.created',
  venueUpdated: 'venue.updated',
  serviceCatalogUpdated: 'service.catalog.updated',
  advertisementUpdated: 'advertisement.updated',
  botCommandTick: 'bot.command.tick',
  botCommandBootstrap: 'bot.command.bootstrap',
} as const;

export type DomainEventType =
  (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];

export type DomainEvent<TDetail = Record<string, unknown>> = {
  version: 1;
  type: DomainEventType;
  emittedAt: string;
  detail: TDetail;
};

export function createDomainEvent<TDetail>(
  type: DomainEventType,
  detail: TDetail,
): DomainEvent<TDetail> {
  return {
    version: 1,
    type,
    emittedAt: new Date().toISOString(),
    detail,
  };
}
