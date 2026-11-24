import { deliverDue, enqueueEvent } from '../services/webhooks'

/** Domain events → queued webhook deliveries, attempted right away (retries happen via cron). */
export default defineNitroPlugin(() => {
  onDomainEvent(async (evt) => {
    const queued = await enqueueEvent(useDb(), evt)
    const key = useServerConfig().webhookSigningKey
    if (queued.length && key) await deliverDue(useDb(), { serverKey: key, limit: queued.length, timeoutMs: 3000 })
  })
})
