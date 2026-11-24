import { and, eq } from 'drizzle-orm'
import { order } from '../db/schema'

export async function isOrderOwner(orderId: string, customerId: string): Promise<boolean> {
  const [row] = await useDb().select({ id: order.id }).from(order).where(and(eq(order.id, orderId), eq(order.customerId, customerId)))
  return Boolean(row)
}
