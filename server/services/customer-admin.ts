import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { DbLike } from '../db/client'
import * as t from '../db/schema'
import { notFound } from './errors'

export interface CustomerListQuery {
  limit: number
  offset: number
  q?: string
  groupId?: string
  hasAccount?: 'true' | 'false'
  order: 'newest' | 'oldest' | 'name' | 'spent'
}

// Subqueries reference the outer row explicitly: with a single table, Drizzle renders
// ${t.customer.id} unqualified, which would bind to the subquery's own `id` column.

/** Lifetime spend in one currency (non-canceled, non-draft orders minus refunds). */
const spentIn = (currency: string) =>
  sql<number>`coalesce((select sum(o.total - o.refunded_total) from ${t.order} o where o.customer_id = "customer"."id" and o.status <> 'canceled' and o.is_draft = false and o.deleted_at is null and o.currency_code = ${currency}), 0)::int`
const orderCount = sql<number>`(select count(*) from ${t.order} o where o.customer_id = "customer"."id" and o.is_draft = false and o.deleted_at is null)::int`

export async function listCustomers(db: DbLike, q: CustomerListQuery, currency: string) {
  const f: (SQL | undefined)[] = [isNull(t.customer.deletedAt)]
  if (q.q) {
    const like = `%${q.q}%`
    f.push(or(ilike(t.customer.email, like), ilike(sql`coalesce(${t.customer.firstName}, '') || ' ' || coalesce(${t.customer.lastName}, '')`, like), ilike(t.customer.phone, like)))
  }
  if (q.hasAccount) f.push(eq(t.customer.hasAccount, q.hasAccount === 'true'))
  if (q.groupId) f.push(sql`exists (select 1 from ${t.customerGroupMember} m where m.customer_id = "customer"."id" and m.group_id = ${q.groupId})`)
  const where = and(...f)
  const spent = spentIn(currency)
  const order = { newest: [desc(t.customer.createdAt)], oldest: [asc(t.customer.createdAt)], name: [asc(t.customer.firstName), asc(t.customer.lastName)], spent: [sql`${spent} desc`] }[q.order]
  const [rows, [total]] = await Promise.all([
    db
      .select({ id: t.customer.id, email: t.customer.email, firstName: t.customer.firstName, lastName: t.customer.lastName, phone: t.customer.phone, hasAccount: t.customer.hasAccount, createdAt: t.customer.createdAt, orderCount, spent })
      .from(t.customer)
      .where(where)
      .orderBy(...order)
      .limit(q.limit)
      .offset(q.offset),
    db.select({ value: count() }).from(t.customer).where(where),
  ])
  const ids = rows.map((r) => r.id)
  const groups = ids.length
    ? await db.select({ customerId: t.customerGroupMember.customerId, id: t.customerGroup.id, name: t.customerGroup.name }).from(t.customerGroupMember).innerJoin(t.customerGroup, eq(t.customerGroup.id, t.customerGroupMember.groupId)).where(inArray(t.customerGroupMember.customerId, ids))
    : []
  return { data: rows.map((r) => ({ ...r, currencyCode: currency, groups: groups.filter((g) => g.customerId === r.id).map(({ id, name }) => ({ id, name })) })), count: total?.value ?? 0 }
}

export async function getCustomerDetail(db: DbLike, id: string) {
  const [c] = await db.select().from(t.customer).where(and(eq(t.customer.id, id), isNull(t.customer.deletedAt)))
  if (!c) throw notFound('Customer')
  const [addresses, groups, orders, totals] = await Promise.all([
    db.select().from(t.customerAddress).where(and(eq(t.customerAddress.customerId, id), isNull(t.customerAddress.deletedAt))),
    db.select({ id: t.customerGroup.id, name: t.customerGroup.name }).from(t.customerGroupMember).innerJoin(t.customerGroup, eq(t.customerGroup.id, t.customerGroupMember.groupId)).where(eq(t.customerGroupMember.customerId, id)),
    db
      .select({ id: t.order.id, displayId: t.order.displayId, createdAt: t.order.createdAt, paymentStatus: t.order.paymentStatus, fulfillmentStatus: t.order.fulfillmentStatus, total: t.order.total, currencyCode: t.order.currencyCode, status: t.order.status })
      .from(t.order)
      .where(and(eq(t.order.customerId, id), eq(t.order.isDraft, false), isNull(t.order.deletedAt)))
      .orderBy(desc(t.order.createdAt))
      .limit(50),
    db
      .select({ currencyCode: t.order.currencyCode, spent: sql<number>`sum(${t.order.total} - ${t.order.refundedTotal})::int`, orders: sql<number>`count(*)::int` })
      .from(t.order)
      .where(and(eq(t.order.customerId, id), eq(t.order.isDraft, false), isNull(t.order.deletedAt), sql`${t.order.status} <> 'canceled'`))
      .groupBy(t.order.currencyCode),
  ])
  const { passwordHash: _p, ...safe } = c
  return { ...safe, addresses, groups, orders, totals }
}
