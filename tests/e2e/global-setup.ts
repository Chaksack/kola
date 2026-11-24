import 'dotenv/config'
import { execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import pg from 'pg'

/** Sign the owner in once and save the session for admin tests (avoids the login rate limit). */
async function saveAdminState(baseURL: string) {
  const res = await fetch(`${baseURL}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ email: process.env.ADMIN_SEED_EMAIL, password: process.env.ADMIN_SEED_PASSWORD }),
  })
  if (!res.ok) throw new Error(`Admin login for E2E failed: ${res.status}`)
  const host = new URL(baseURL).hostname
  const cookies = res.headers.getSetCookie().map((c) => {
    const [pair] = c.split(';')
    const [name, ...rest] = pair!.split('=')
    return { name: name!.trim(), value: rest.join('='), domain: host, path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' as const }
  })
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/.admin-state.json', JSON.stringify({ cookies, origins: [] }))
}

export default async function globalSetup() {
  if (process.env.E2E_BASE_URL) {
    await saveAdminState(process.env.E2E_BASE_URL)
    return
  }
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('Set TEST_DATABASE_URL (or DATABASE_URL) to a migrated, seeded database')

  // The storefront needs the database's publishable key.
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  // Start with a clean rate-limit window (earlier runs sign in many times from one IP).
  await client.query('delete from rate_limit')
  const { rows } = await client.query<{ token: string }>("select token from api_key where type = 'publishable' and revoked_at is null and deleted_at is null order by created_at limit 1")
  await client.end()
  if (!rows[0]) throw new Error('No publishable key in the database; run pnpm test:db')

  const outDir = '.output-test'
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NITRO_PRESET: 'node-server',
    NITRO_OUTPUT_DIR: outDir,
    NUXT_BUILD_DIR: '.nuxt-test',
    DATABASE_URL: databaseUrl,
    NUXT_APP_SECRET: process.env.NUXT_APP_SECRET || 'test-only-app-secret-that-is-at-least-32-chars',
  }
  delete env.NUXT_SESSION_PASSWORD
  if (!process.env.KOLA_TEST_SKIP_BUILD || !existsSync(`${outDir}/server/index.mjs`)) execSync('pnpm exec nuxt build', { env, stdio: 'ignore' })

  const port = 4010
  const baseURL = `http://127.0.0.1:${port}`
  const server = spawn('node', [`${outDir}/server/index.mjs`], {
    env: { ...env, PORT: String(port), HOST: '127.0.0.1', NUXT_PUBLIC_STORE_URL: baseURL, NUXT_PUBLIC_PUBLISHABLE_KEY: rows[0].token, NUXT_ALLOW_DATA_URL_UPLOADS: 'true' },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  for (const deadline = Date.now() + 30_000; ; ) {
    try {
      if ((await fetch(`${baseURL}/api/_auth/session`)).ok) break
    } catch {
      // starting
    }
    if (Date.now() > deadline) throw new Error('E2E server did not start')
    await new Promise((r) => setTimeout(r, 250))
  }
  process.env.E2E_BASE_URL = baseURL
  await saveAdminState(baseURL)
  return () => {
    server.kill()
  }
}
