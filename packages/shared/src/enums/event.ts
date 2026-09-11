/** Append-only audit trail vocabulary (CLAUDE.md §5.4). */
export const AssetEventType = {
  PURCHASED: 'PURCHASED',
  STOCK_IN: 'STOCK_IN',
  ISSUED: 'ISSUED',
  RETURNED: 'RETURNED',
  INSPECTED: 'INSPECTED',
  SENT_FOR_REPAIR: 'SENT_FOR_REPAIR',
  REPAIR_COMPLETED: 'REPAIR_COMPLETED',
  TRANSFERRED: 'TRANSFERRED',
  MARKED_LOST: 'MARKED_LOST',
  WRITTEN_OFF: 'WRITTEN_OFF',
  RETIRED: 'RETIRED',
  NOTE_ADDED: 'NOTE_ADDED',
} as const;
export type AssetEventType = (typeof AssetEventType)[keyof typeof AssetEventType];
export const ASSET_EVENT_TYPES = Object.values(AssetEventType);

/** What `asset_event.reference_id` points at. */
export const EventReferenceType = {
  ASSIGNMENT: 'ASSIGNMENT',
  REPAIR_TICKET: 'REPAIR_TICKET',
  PURCHASE_ITEM: 'PURCHASE_ITEM',
} as const;
export type EventReferenceType = (typeof EventReferenceType)[keyof typeof EventReferenceType];
export const EVENT_REFERENCE_TYPES = Object.values(EventReferenceType);
