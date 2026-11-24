import { eq, inArray } from 'drizzle-orm'
import { fulfillment, fulfillmentTracking, order } from '../db/schema'
import { getStoreOrder } from '../services/order'
import { orderConfirmationEmail, shippingConfirmationEmail } from '../services/email-templates'

/** Domain events → transactional emails. */
export default defineNitroPlugin(() => {
  onDomainEvent(async (evt) => {
    const storeUrl = useServerConfig().storeUrl
    if (evt.name === 'order.placed') {
      const o = await getStoreOrder(useDb(), String(evt.data.id))
      const orderUrl = `${storeUrl}/order/confirmed/${o.id}?email=${encodeURIComponent(o.email)}`
      await sendEmail('order.confirmation', orderConfirmationEmail({ ...o, displayId: o.displayId, orderUrl }), o.id)
    }
    if (evt.name === 'order.shipped') {
      const id = String(evt.data.id)
      const [o] = await useDb().select({ id: order.id, displayId: order.displayId, email: order.email }).from(order).where(eq(order.id, id))
      if (!o) return
      const fulfillmentIds = evt.data.fulfillmentId ? [String(evt.data.fulfillmentId)] : (await useDb().select({ id: fulfillment.id }).from(fulfillment).where(eq(fulfillment.orderId, id))).map((f) => f.id)
      const tracking = fulfillmentIds.length ? await useDb().select().from(fulfillmentTracking).where(inArray(fulfillmentTracking.fulfillmentId, fulfillmentIds)) : []
      await sendEmail(
        'order.shipped',
        shippingConfirmationEmail({ displayId: o.displayId, email: o.email, tracking: tracking.map((t) => ({ number: t.trackingNumber, carrier: t.carrier, url: t.trackingUrl })), orderUrl: `${storeUrl}/order/confirmed/${o.id}?email=${encodeURIComponent(o.email)}` }),
        o.id,
      )
    }
  })
})
