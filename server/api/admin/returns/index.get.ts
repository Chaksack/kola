import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { customer, order, orderReturn, returnItem } from '../../../db/schema'

export default defineValidatedHandler({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(20), offset: z.coerce.number().int().min(0).default(0), status: z.enum(['requested', 'received', 'canceled']).optional() }) }, async (event, { query }) => {
  await requireAdmin(event)
  const db = useDb()
  const where = query.status ? eq(orderReturn.status, query.status) : undefined
  const [rows, [total]] = await Promise.all([
    db
      .select({ id: orderReturn.id, status: orderReturn.status, refundAmount: orderReturn.refundAmount, exchangeId: orderReturn.exchangeId, createdAt: orderReturn.createdAt, receivedAt: orderReturn.receivedAt, orderId: order.id, displayId: order.displayId, currencyCode: order.currencyCode, email: order.email, firstName: customer.firstName, lastName: customer.lastName })
      .from(orderReturn)
      .innerJoin(order, eq(order.id, orderReturn.orderId))
      .leftJoin(customer, eq(customer.id, order.customerId))
      .where(where)
      .orderBy(desc(orderReturn.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(orderReturn).where(where),
  ])
  const qty = rows.length ? await db.select({ returnId: returnItem.returnId, quantity: returnItem.quantity }).from(returnItem).where(and(inArray(returnItem.returnId, rows.map((r) => r.id)))) : []
  return listResponse(rows.map((r) => ({ ...r, itemCount: qty.filter((q) => q.returnId === r.id).reduce((a, q) => a + q.quantity, 0) })), total?.value ?? 0, query.limit, query.offset)
})
