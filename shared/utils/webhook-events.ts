/** Events that outgoing webhooks can subscribe to. `*` subscribes to everything. */
export const WEBHOOK_EVENTS = [
  'order.placed',
  'order.updated',
  'order.canceled',
  'order.fulfilled',
  'order.shipped',
  'order.delivered',
  'payment.captured',
  'payment.refunded',
  'return.requested',
  'return.received',
  'exchange.created',
  'product.created',
  'product.updated',
  'product.deleted',
  'customer.created',
  'inventory.low_stock',
] as const
export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number]
