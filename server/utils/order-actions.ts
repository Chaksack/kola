import type { H3Event } from 'h3'
import { withTx } from '../db/client'
import type { OrderActionDeps } from '../services/order-actions'
import { getAdminOrder } from '../services/order-admin'
import { PaymentProviderError } from '../providers/payment/types'
import type { UserRole } from '#shared/utils/roles'

/** Authorize, run an order action with its dependencies, audit it, and return the fresh order. */
export async function runOrderAction(event: H3Event, orderId: string, action: string, minRole: UserRole, fn: (deps: OrderActionDeps) => Promise<unknown>) {
  const actor = await requireAdmin(event, minRole)
  const url = useServerConfig().databaseUrl
  const deps: OrderActionDeps = {
    db: useDb(),
    withTx: (f) => withTx(url, f),
    provider: usePaymentProvider,
    emit: (name, data) => emitEvent(name, data),
    actor: { id: actor.id, name: actor.type === 'user' ? (actor.name ?? actor.email) : 'API key' },
  }
  try {
    const result = await fn(deps)
    await audit(event, actor, `order.${action}`, 'order', orderId)
    return { order: await getAdminOrder(useDb(), orderId), result: result ?? null }
  } catch (err) {
    if (err instanceof PaymentProviderError) throw apiError(502, 'payment_provider_error', `${err.provider}: ${err.message}`)
    throw err
  }
}
