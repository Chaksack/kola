import { count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { customer, exchange, order } from '../../../db/schema'

export default defineValidatedHandler({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(20), offset: z.coerce.number().int().min(0).default(0) }) }, async (event, { query }) => {
  await requireAdmin(event)
  const db = useDb()
  const [rows, [total]] = await Promise.all([
    db
      .select({ id: exchange.id, status: exchange.status, differenceDue: exchange.differenceDue, createdAt: exchange.createdAt, orderId: order.id, displayId: order.displayId, currencyCode: order.currencyCode, email: order.email, firstName: customer.firstName, lastName: customer.lastName })
      .from(exchange)
      .innerJoin(order, eq(order.id, exchange.orderId))
      .leftJoin(customer, eq(customer.id, order.customerId))
      .orderBy(desc(exchange.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(exchange),
  ])
  return listResponse(rows, total?.value ?? 0, query.limit, query.offset)
})
