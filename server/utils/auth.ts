import type { H3Event } from 'h3'
import { and, eq, isNull } from 'drizzle-orm'
import type { UserSession } from '#auth-utils'
import { apiKey, apiKeySalesChannel, customer, salesChannel, user } from '../db/schema'
import { hasRole, type UserRole } from '#shared/utils/roles'

export type AdminActor =
  | { type: 'user'; id: string; email: string; name: string | null; role: UserRole }
  | { type: 'api_key'; id: string; role: UserRole }

export interface CustomerActor {
  id: string
  email: string
  name: string | null
}

export interface PublishableScope {
  keyId: string
  salesChannelIds: string[]
}

declare module 'h3' {
  interface H3EventContext {
    admin?: AdminActor
    customer?: CustomerActor | null
    publishable?: PublishableScope
  }
}

/** Secret API keys act as `admin`: they can manage the store but not users or other keys' owners. */
const SECRET_KEY_ROLE: UserRole = 'admin'

function bearer(event: H3Event): string | null {
  const header = getHeader(event, 'authorization')
  const m = header && /^Bearer\s+(\S+)$/i.exec(header)
  return m ? m[1]! : null
}

async function adminFromSecretKey(token: string): Promise<AdminActor | null> {
  const db = useDb()
  const [key] = await db
    .select({ id: apiKey.id })
    .from(apiKey)
    .where(and(eq(apiKey.token, sha256(token)), eq(apiKey.type, 'secret'), isNull(apiKey.revokedAt), isNull(apiKey.deletedAt)))
  if (!key) return null
  await db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, key.id))
  return { type: 'api_key', id: key.id, role: SECRET_KEY_ROLE }
}

async function adminFromSession(event: H3Event): Promise<AdminActor | null> {
  const session = await getUserSession(event)
  if (!session.admin) return null
  // Re-read the user so role changes and deletions take effect immediately.
  const [row] = await useDb()
    .select({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role })
    .from(user)
    .where(and(eq(user.id, session.admin.id), isNull(user.deletedAt)))
  if (!row) return null
  return { type: 'user', id: row.id, email: row.email, name: fullName(row.firstName, row.lastName), role: row.role }
}

/**
 * Require an admin session or a secret API key (`Authorization: Bearer sk_…`), with at least
 * `minRole`. Throws 401 when unauthenticated and 403 when the role is too low.
 */
export async function requireAdmin(event: H3Event, minRole: UserRole = 'member'): Promise<AdminActor> {
  let actor = event.context.admin
  if (!actor) {
    const token = bearer(event)
    actor = (token ? await adminFromSecretKey(token) : await adminFromSession(event)) ?? undefined
    if (!actor) throw apiError(401, 'unauthorized', 'Sign in to continue')
    event.context.admin = actor
  }
  if (!hasRole(actor.role, minRole)) {
    throw apiError(403, 'forbidden', `This action needs the ${minRole} role`)
  }
  return actor
}

/** The signed-in customer, or null. */
export async function getCustomer(event: H3Event): Promise<CustomerActor | null> {
  if (event.context.customer !== undefined) return event.context.customer
  const session = await getUserSession(event)
  let actor: CustomerActor | null = null
  if (session.customer) {
    const [row] = await useDb()
      .select({ id: customer.id, email: customer.email, firstName: customer.firstName, lastName: customer.lastName })
      .from(customer)
      .where(and(eq(customer.id, session.customer.id), eq(customer.hasAccount, true), isNull(customer.deletedAt)))
    if (row) actor = { id: row.id, email: row.email, name: fullName(row.firstName, row.lastName) }
  }
  event.context.customer = actor
  return actor
}

export async function requireCustomer(event: H3Event): Promise<CustomerActor> {
  const actor = await getCustomer(event)
  if (!actor) throw apiError(401, 'unauthorized', 'Sign in to continue')
  return actor
}

/**
 * Every `/api/store/**` request must carry `x-publishable-api-key`. The key scopes which sales
 * channels (and therefore which products) the caller can see and buy from.
 */
export async function requirePublishableKey(event: H3Event): Promise<PublishableScope> {
  if (event.context.publishable) return event.context.publishable
  const token = getHeader(event, 'x-publishable-api-key')
  if (!token) throw apiError(401, 'publishable_key_required', 'Missing x-publishable-api-key header')
  const rows = await useDb()
    .select({ keyId: apiKey.id, salesChannelId: apiKeySalesChannel.salesChannelId, disabled: salesChannel.isDisabled })
    .from(apiKey)
    .leftJoin(apiKeySalesChannel, eq(apiKeySalesChannel.apiKeyId, apiKey.id))
    .leftJoin(salesChannel, eq(salesChannel.id, apiKeySalesChannel.salesChannelId))
    .where(and(eq(apiKey.token, token), eq(apiKey.type, 'publishable'), isNull(apiKey.revokedAt), isNull(apiKey.deletedAt)))
  if (!rows.length) throw apiError(401, 'invalid_publishable_key', 'Publishable API key is invalid or revoked')
  const scope: PublishableScope = {
    keyId: rows[0]!.keyId,
    salesChannelIds: rows.filter((r) => r.salesChannelId && !r.disabled).map((r) => r.salesChannelId!),
  }
  if (!scope.salesChannelIds.length) throw apiError(400, 'no_sales_channel', 'Publishable key has no enabled sales channel')
  event.context.publishable = scope
  return scope
}

export function fullName(first?: string | null, last?: string | null): string | null {
  const n = [first, last].filter(Boolean).join(' ').trim()
  return n || null
}

/** Update one actor in the shared session without touching the other. */
export async function setSessionActor<K extends 'admin' | 'customer'>(event: H3Event, key: K, value: UserSession[K] | null) {
  const current = await getUserSession(event)
  const next: Record<string, unknown> = { admin: current.admin, customer: current.customer, [key]: value ?? undefined }
  if (!next.admin && !next.customer) {
    await clearUserSession(event)
    return
  }
  await replaceUserSession(event, { admin: next.admin as UserSession['admin'], customer: next.customer as UserSession['customer'], loggedInAt: Date.now() })
}
