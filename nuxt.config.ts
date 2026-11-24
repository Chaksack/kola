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

  runtimeConfig: {
    databaseUrl: '',
    blobReadWriteToken: '',
    paystackSecretKey: '',
    stripeSecretKey: '',
    stripeWebhookSecret: '',
    resendApiKey: '',
    emailFrom: 'Kola Market <orders@kola.market>',
    cronSecret: '',
    adminSeedEmail: '',
    adminSeedPassword: '',
    // Sessions are sealed with a key derived from Nuxt's appSecret (NUXT_APP_SECRET).
    session: {
      name: 'kola-session',
      cookie: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
      maxAge: 60 * 60 * 24 * 7,
    },
    public: {
      storeUrl: 'http://localhost:3000',
      publishableKey: '',
      // Publishable keys are safe to inline at build time.
      paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY ?? '',
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    },
  },

  nitro: {
    preset: 'vercel',
    experimental: { tasks: true, openAPI: false },
    scheduledTasks: {},
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
    '/account/**': { ssr: false },
    '/admin/**': { ssr: false },
    '/api/**': { cors: false, headers: { 'Cache-Control': 'no-store' } },
  },

  eslint: {
    config: { stylistic: false },
  },
})
