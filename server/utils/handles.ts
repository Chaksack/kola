import { and, eq, ne } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import { toHandle } from '#shared/schemas/catalog'

/** Resolve a handle (explicit or from the title) and reject it if another row already uses it. */
export async function uniqueHandle(table: PgTable & { id: PgColumn; handle: PgColumn }, handle: string | undefined, title: string, excludeId?: string): Promise<string> {
  const value = handle || toHandle(title)
  if (!value) throw badRequest('Could not derive a handle', [{ path: 'handle', message: 'Enter a handle' }])
  const [taken] = await useDb()
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.handle, value), excludeId ? ne(table.id, excludeId) : undefined))
  if (taken) throw conflict(`The handle "${value}" is already in use`, [{ path: 'handle', message: 'Handle is taken' }])
  return value
}
