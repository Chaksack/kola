import { createDb } from '../../server/db/client'

export const DATABASE_URL = process.env.DATABASE_URL ?? ''
/** API tests need a migrated, seeded database. They skip cleanly without one. */
export const hasDb = Boolean(DATABASE_URL)
export const db = () => createDb(DATABASE_URL)
