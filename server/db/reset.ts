import 'dotenv/config'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DB_RESET) {
  throw new Error('Refusing to reset a production database (set ALLOW_DB_RESET=1 to override)')
}

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;')
  console.log('Database reset')
} finally {
  await client.end()
}
