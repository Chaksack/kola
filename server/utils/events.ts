import { domainEvent } from '../db/schema'

export type DomainEventName =
  | 'invite.created'
  | 'customer.created'
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'order.placed'
  | 'order.canceled'
  | 'order.fulfilled'
  | 'order.shipped'
  | 'order.delivered'
  | 'order.updated'
  | 'payment.captured'
  | 'payment.refunded'
  | 'return.requested'
  | 'return.received'
  | 'exchange.created'
  | 'inventory.low_stock'

export interface DomainEvent<T = Record<string, unknown>> {
  id: string
  name: DomainEventName
  data: T
}

type Subscriber = (event: DomainEvent) => Promise<void> | void

/**
 * Subscribers are registered statically at module load by Nitro plugins (notifications, outgoing
 * webhooks). This is code wiring, not runtime state, so it's safe on serverless.
 */
const subscribers: Subscriber[] = []

export function onDomainEvent(fn: Subscriber) {
  subscribers.push(fn)
}

/**
 * Persist the event, then fan out. Subscriber failures are logged and never fail the caller:
 * webhooks are retried from the delivery table by cron, and notifications are best-effort.
 */
export async function emitEvent(name: DomainEventName, data: Record<string, unknown>): Promise<DomainEvent> {
  const [row] = await useDb().insert(domainEvent).values({ name, data }).returning({ id: domainEvent.id })
  const evt: DomainEvent = { id: row!.id, name, data }
  await Promise.all(
    subscribers.map(async (fn) => {
      try {
        await fn(evt)
      } catch (err) {
        console.error(`[events] subscriber failed for ${name}`, err instanceof Error ? err.message : err)
      }
    }),
  )
  return evt
}
