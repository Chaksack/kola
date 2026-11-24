/**
 * Database clients. Framework-agnostic: no Nitro imports, so scripts and tests can use it.
 *
 * - Neon URLs (`*.neon.tech`): `neon-http` for request paths (one HTTP round trip per query, no
 *   connection to hold open), and a short-lived `neon-serverless` WebSocket pool for the few
 *   multi-statement writes that need a real transaction.
 * - Any other Postgres URL (local dev, CI): `node-postgres`. A small pool per process.
 *
 * Every client is typed as `Db`, the shared `PgDatabase` surface, so services don't care which
 * driver is underneath. See docs/decisions.md.
 */
import { neon, neonConfig, Pool as NeonPool } from '@neondatabase/serverless'
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http'
import { drizzle as drizzleNeonWs } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import pg from 'pg'
import ws from 'ws'
import * as schema from './schema'

export type Schema = typeof schema
export type Db = PgDatabase<PgQueryResultHKT, Schema>
/** The handle passed to `withTx` callbacks. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Anything that can run queries: the root client or a transaction. */
export type DbLike = Db | Tx

export function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.neon.tech')
  } catch {
    return false
  }
}

const nodePools = new Map<string, pg.Pool>()

function nodePool(url: string): pg.Pool {
  let pool = nodePools.get(url)
  if (!pool) {
    pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 })
    nodePools.set(url, pool)
  }
  return pool
}

const httpClients = new Map<string, Db>()

/** Query client for request paths. Cheap to call repeatedly. */
export function createDb(url: string): Db {
  let db = httpClients.get(url)
  if (db) return db
  db = isNeonUrl(url)
    ? (drizzleNeonHttp({ client: neon(url), schema }) as unknown as Db)
    : (drizzleNodePg({ client: nodePool(url), schema }) as unknown as Db)
  httpClients.set(url, db)
  return db
}

/**
 * Run `fn` inside a real transaction. On Neon this opens a WebSocket pool for the duration of the
 * call and closes it afterwards, so nothing outlives the serverless invocation.
 */
export async function withTx<T>(url: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!isNeonUrl(url)) return createDb(url).transaction(fn)
  if (typeof globalThis.WebSocket === 'undefined') neonConfig.webSocketConstructor = ws
  const pool = new NeonPool({ connectionString: url })
  try {
    const db = drizzleNeonWs({ client: pool, schema }) as unknown as Db
    return await db.transaction(fn)
  } finally {
    await pool.end()
  }
}

/** Close node-postgres pools (scripts and tests). */
export async function closeDb(): Promise<void> {
  await Promise.all([...nodePools.values()].map((p) => p.end()))
  nodePools.clear()
  httpClients.clear()
}

export { schema }
