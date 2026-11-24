import { createDb, withTx, type Db, type Tx } from '../db/client'

export type { Db, Tx, DbLike } from '../db/client'
export * as tables from '../db/schema'

function databaseUrl(): string {
  const url = useRuntimeConfig().databaseUrl
  if (!url) throw createError({ statusCode: 500, message: 'DATABASE_URL is not configured' })
  return url
}

/** Drizzle client for the current request. */
export function useDb(): Db {
  return createDb(databaseUrl())
}

/** Run a multi-statement write atomically. */
export function useTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTx(databaseUrl(), fn)
}
