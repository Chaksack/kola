import './env'
import { afterAll, beforeEach } from 'vitest'
import { closeDb, createDb } from '../../server/db/client'
import { rateLimit } from '../../server/db/schema'

// Tests sign in many times from one IP; start every test with a clean rate-limit window.
beforeEach(async () => {
  if (process.env.DATABASE_URL) await createDb(process.env.DATABASE_URL).delete(rateLimit)
})

afterAll(async () => {
  await closeDb()
})
