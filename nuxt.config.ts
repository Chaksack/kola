// https://nuxt.com/docs/api/configuration/nuxt-config
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.paystack.co https://js.stripe.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://paystack.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.stripe.com https://*.paystack.co",
    "connect-src 'self' https://api.paystack.co https://api.stripe.com https://*.paystack.co",
    'frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.paystack.com https://*.paystack.co',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
}

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: true },
  // API tests build into a separate dir so they never clobber a running `nuxt dev`.
  ...(process.env.NUXT_BUILD_DIR ? { buildDir: process.env.NUXT_BUILD_DIR } : {}),
  modules: ['@nuxt/eslint', '@pinia/nuxt', '@nuxt/image', 'nuxt-auth-utils'],

  css: ['~/assets/css/tokens.css', '~/assets/css/base.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap',
        },
      ],
    },
  },

  typescript: {
    strict: true,
  },

  optimization: {
    keyedComposables: [{ name: 'useStoreFetch', argumentLength: 3 }],
  },

  // Secrets use the plain env names from .env.example via Nitro env expansion ("{{VAR}}" is
  // resolved at runtime, never inlined at build). NUXT_* overrides still work. Read server values
  // through `useServerConfig()`, which treats unexpanded placeholders as unset.
  runtimeConfig: {
    databaseUrl: '{{DATABASE_URL}}',
    blobReadWriteToken: '{{BLOB_READ_WRITE_TOKEN}}',
    paystackSecretKey: '{{PAYSTACK_SECRET_KEY}}',
    stripeSecretKey: '{{STRIPE_SECRET_KEY}}',
    stripeWebhookSecret: '{{STRIPE_WEBHOOK_SECRET}}',
    resendApiKey: '{{RESEND_API_KEY}}',
    cronSecret: '{{CRON_SECRET}}',
    // Derives outgoing webhook signing secrets. Falls back to CRON_SECRET when unset.
    webhookSigningKey: '{{WEBHOOK_SIGNING_KEY}}',
    // Allow http:// and private hosts for webhook URLs (dev and tests only).
    allowInsecureWebhooks: false,
    emailFrom: 'Kola Market <orders@kola.market>',
    // Store uploads as data: URLs when no Blob token is set. Always on in dev; NUXT_ALLOW_DATA_URL_UPLOADS=true elsewhere.
    allowDataUrlUploads: false,
    // Sessions are sealed with a key derived from Nuxt's appSecret (NUXT_APP_SECRET).
    session: {
      name: 'kola-session',
      cookie: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
      maxAge: 60 * 60 * 24 * 7,
    },
    public: {
      storeUrl: 'http://localhost:3000',
      publishableKey: '',
      paystackPublicKey: '{{PAYSTACK_PUBLIC_KEY}}',
      stripePublishableKey: '{{STRIPE_PUBLISHABLE_KEY}}',
    },
  },

  nitro: {
    // NITRO_PRESET lets tests build a node server; Vercel is the default and the deploy target.
    preset: process.env.NITRO_PRESET || 'vercel',
    ...(process.env.NITRO_OUTPUT_DIR ? { output: { dir: process.env.NITRO_OUTPUT_DIR } } : {}),
    experimental: { tasks: true, openAPI: false, envExpansion: true },
    // Vercel Cron calls /api/cron/*; these tasks expose the same jobs to `nitro task run` locally.
    scheduledTasks: {},
    // Same schedule as vercel.json, written into .vercel/output/config.json so prebuilt deploys
    // (`vercel deploy --prebuilt`) get the crons too.
    vercel: {
      config: {
        crons: [
          { path: '/api/cron/cart-expiry', schedule: '0 * * * *' },
          { path: '/api/cron/reservation-release', schedule: '30 * * * *' },
          { path: '/api/cron/webhook-retry', schedule: '*/15 * * * *' },
        ],
      },
    },
  },

  image: {
    provider: process.env.VERCEL ? 'vercel' : 'ipx',
    domains: ['public.blob.vercel-storage.com'],
  },

  routeRules: {
    '/**': { headers: securityHeaders },
    '/products/**': { isr: 300 },
    '/collections/**': { isr: 300 },
    '/categories/**': { isr: 300 },
    '/cart': { ssr: true, isr: false },
    '/checkout': { ssr: false },
    '/account': { ssr: false },
    '/account/**': { ssr: false },
    '/order/**': { ssr: false },
    '/shop': { isr: 300 },
    '/': { isr: 300 },
    '/admin/**': { ssr: false },
    '/api/**': { cors: false, headers: { 'Cache-Control': 'no-store' } },
  },

  eslint: {
    config: { stylistic: false },
  },
})
