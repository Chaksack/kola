import { withTx } from '../db/client'
import type { CheckoutDeps } from '../services/checkout'

export function useCheckoutDeps(): CheckoutDeps {
  const url = useServerConfig().databaseUrl
  return {
    db: useDb(),
    withTx: (fn) => withTx(url, fn),
    provider: usePaymentProvider,
    emit: (name, data) => emitEvent(name, data),
  }
}
