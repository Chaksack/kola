import { and, eq, isNull } from 'drizzle-orm'
import { createDb } from '../../server/db/client'
import * as t from '../../server/db/schema'
import { hashPasswordStandalone } from '../../server/db/password'
import type { USER_ROLES } from '../../shared/utils/roles'
import { Client } from './client'

export const DATABASE_URL = process.env.DATABASE_URL ?? ''
/** API tests need a migrated, seeded database. They skip cleanly without one. */
export const hasDb = Boolean(DATABASE_URL)
export const db = () => createDb(DATABASE_URL)

export const ADMIN_EMAIL = (process.env.ADMIN_SEED_EMAIL ?? '').toLowerCase()
export const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? ''

export async function adminClient(): Promise<Client> {
  const c = new Client()
  const res = await c.post('/api/admin/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  if (res.status !== 200) throw new Error(`Admin login failed: ${res.status} ${JSON.stringify(res.body)}`)
  return c
}

const TEST_PASSWORD = 'test-password-1234'

/** Create (or reuse) a test user with the given role and return a signed-in client. */
export async function clientWithRole(role: (typeof USER_ROLES)[number]): Promise<Client> {
  const email = `test-${role}@kola.test`
  const [existing] = await db().select({ id: t.user.id }).from(t.user).where(and(eq(t.user.email, email), isNull(t.user.deletedAt)))
  if (!existing) {
    await db().insert(t.user).values({ email, role, firstName: 'Test', lastName: role, passwordHash: await hashPasswordStandalone(TEST_PASSWORD) })
  } else {
    await db().update(t.user).set({ role }).where(eq(t.user.id, existing.id))
  }
  const c = new Client()
  const res = await c.post('/api/admin/auth/login', { email, password: TEST_PASSWORD })
  if (res.status !== 200) throw new Error(`Login as ${role} failed: ${res.status}`)
  return c
}

export async function publishableKey(): Promise<string> {
  const [row] = await db()
    .select({ token: t.apiKey.token })
    .from(t.apiKey)
    .where(and(eq(t.apiKey.type, 'publishable'), isNull(t.apiKey.revokedAt), isNull(t.apiKey.deletedAt)))
    .limit(1)
  if (!row) throw new Error('No publishable key; run pnpm db:seed')
  return row.token
}

export function uniqueEmail(prefix = 'cus') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@kola.test`
}
