import 'dotenv/config'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

// Neon accepts standard Postgres connections, so one migrator covers local, CI and production.
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await migrate(drizzle({ client }), { migrationsFolder: new URL('./migrations', import.meta.url).pathname })
  console.log('Migrations applied')
} finally {
  await client.end()
}
