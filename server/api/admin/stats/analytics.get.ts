import { and, desc, eq, gte, isNull, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { order, orderItem, salesChannel, store } from '../../../db/schema'

/** Sales analytics for the default currency over the last N days. */
export default defineValidatedHandler({ query: z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }) }, async (event, { query }) => {
  await requireAdmin(event)
  const db = useDb()
  const [s] = await db.select({ currency: store.defaultCurrencyCode }).from(store).where(isNull(store.deletedAt)).limit(1)
  const currency = s?.currency ?? 'GHS'
  const since = new Date(Date.now() - query.days * 86_400_000)
  since.setHours(0, 0, 0, 0)
  const live = and(isNull(order.deletedAt), eq(order.isDraft, false), ne(order.status, 'canceled'), eq(order.currencyCode, currency), gte(order.createdAt, since))
  const [daily, products, channels] = await Promise.all([
    db
      .select({ day: sql<string>`to_char(date_trunc('day', ${order.createdAt}), 'YYYY-MM-DD')`, sales: sql<number>`sum(${order.total} - ${order.refundedTotal})::int`, orders: sql<number>`count(*)::int` })
      .from(order)
      .where(live)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ productId: orderItem.productId, title: orderItem.title, units: sql<number>`sum(${orderItem.quantity})::int`, revenue: sql<number>`sum(${orderItem.total})::int` })
      .from(orderItem)
      .innerJoin(order, eq(order.id, orderItem.orderId))
      .where(live)
      .groupBy(orderItem.productId, orderItem.title)
      .orderBy(desc(sql`4`))
      .limit(8),
    db
      .select({ name: salesChannel.name, orders: sql<number>`count(*)::int`, sales: sql<number>`sum(${order.total})::int` })
      .from(order)
      .innerJoin(salesChannel, eq(salesChannel.id, order.salesChannelId))
      .where(live)
      .groupBy(salesChannel.name)
      .orderBy(desc(sql`3`)),
  ])
  // Fill missing days with zero so the chart has one bar per day.
  const series: { day: string; sales: number; orders: number }[] = []
  for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10)
    series.push(daily.find((x) => x.day === key) ?? { day: key, sales: 0, orders: 0 })
  }
  return { currencyCode: currency, days: query.days, series, topProducts: products, channels }
})
