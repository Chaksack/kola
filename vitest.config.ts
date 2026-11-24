import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  test: {
    projects: [
      {
        // Pure TypeScript: shared utils, services, schemas. Fast, no Nuxt runtime.
        resolve: { alias: { '#shared': r('./shared'), '~~': r('./'), '#server': r('./server') } },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        // Integration tests against a real Postgres (DATABASE_URL). Skipped when unset.
        resolve: { alias: { '#shared': r('./shared'), '~~': r('./'), '#server': r('./server') } },
        test: {
          name: 'api',
          environment: 'node',
          include: ['tests/api/**/*.test.ts'],
          setupFiles: ['tests/api/setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          environment: 'nuxt',
          include: ['tests/nuxt/**/*.test.ts'],
          environmentOptions: { nuxt: { domEnvironment: 'happy-dom' } },
        },
      }),
    ],
  },
})
