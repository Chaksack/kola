/**
 * Builds the app once as a plain node server, starts it against DATABASE_URL, and hands the base
 * URL to the API tests. Set KOLA_TEST_URL to test an already-running server instead (for example
 * `pnpm dev`), or KOLA_TEST_SKIP_BUILD=1 to reuse the last build in .output-test.
 */
import './env'
import { spawn, execSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    baseURL: string
  }
}


async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, () => {
      const addr = srv.address()
      srv.close(() => (typeof addr === 'object' && addr ? resolve(addr.port) : reject(new Error('no port'))))
    })
  })
}

export default async function setup(project: TestProject) {
  if (!process.env.DATABASE_URL) {
    project.provide('baseURL', '')
    return
  }
  if (process.env.KOLA_TEST_URL) {
    project.provide('baseURL', process.env.KOLA_TEST_URL)
    return
  }
  const outDir = '.output-test'
  const env = {
    ...process.env,
    NITRO_PRESET: 'node-server',
    NITRO_OUTPUT_DIR: outDir,
    NUXT_BUILD_DIR: '.nuxt-test',
    NUXT_APP_SECRET: process.env.NUXT_APP_SECRET || 'test-only-app-secret-that-is-at-least-32-chars',
    CRON_SECRET: process.env.CRON_SECRET || 'test-cron-secret',
  }
  delete env.NUXT_SESSION_PASSWORD
  if (!process.env.KOLA_TEST_SKIP_BUILD || !existsSync(`${outDir}/server/index.mjs`)) {
    execSync('pnpm exec nuxt build', { env, stdio: 'ignore' })
  }
  const port = await freePort()
  const baseURL = `http://127.0.0.1:${port}`
  const server: ChildProcess = spawn('node', [`${outDir}/server/index.mjs`], {
    env: { ...env, PORT: String(port), HOST: '127.0.0.1', NUXT_PUBLIC_STORE_URL: baseURL, NUXT_ALLOW_DATA_URL_UPLOADS: 'true', NUXT_ALLOW_INSECURE_WEBHOOKS: 'true', WEBHOOK_SIGNING_KEY: 'test-webhook-signing-key' },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  const deadline = Date.now() + 30_000
  for (;;) {
    try {
      const res = await fetch(`${baseURL}/api/_auth/session`)
      if (res.ok) break
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error('Test server did not start')
    await new Promise((r) => setTimeout(r, 200))
  }
  project.provide('baseURL', baseURL)
  return () => {
    server?.kill()
  }
}
