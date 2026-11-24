# Deploying to Vercel

Kola Commerce deploys as a single Vercel project using Nitro's `vercel` preset. Use this checklist for
a fresh deploy.

## 1. Project and database

- [ ] Import the Git repository into Vercel. The framework preset is detected as Nuxt; keep the default
      build command (`pnpm build`) and output settings.
- [ ] Add **Neon** from the Vercel Marketplace (Storage › Neon) and connect it to the project. This sets
      `DATABASE_URL`. Request paths then use the Neon HTTP driver automatically, and transactions use
      a short-lived WebSocket pool.
- [ ] Add **Vercel Blob** (Storage › Blob) for product images. This sets `BLOB_READ_WRITE_TOKEN`.

## 2. Environment variables (Production, and Preview if used)

- [ ] `NUXT_APP_SECRET`: `openssl rand -base64 32`. Required; production builds don't generate one.
- [ ] `NUXT_PUBLIC_STORE_URL`: your production URL, e.g. `https://shop.example.com`.
- [ ] `CRON_SECRET`: `openssl rand -hex 32`. Vercel Cron sends it automatically.
- [ ] `WEBHOOK_SIGNING_KEY`: `openssl rand -hex 32`. Don't change it later; it derives every webhook
      endpoint's signing secret.
- [ ] `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD`: only needed when you run the seed.
- [ ] Payments (optional, per region): `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `STRIPE_SECRET_KEY`,
      `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.
- [ ] Email (optional): `RESEND_API_KEY`. Verify your sending domain in Resend.
- [ ] `NUXT_PUBLIC_PUBLISHABLE_KEY`: set after seeding (step 3) and redeploy.

## 3. Migrate and seed

Run from your machine with the production `DATABASE_URL`, or add `pnpm db:migrate` before the build:

```bash
vercel env pull .env.production.local     # or export DATABASE_URL=… manually
DATABASE_URL=… pnpm db:migrate
DATABASE_URL=… ADMIN_SEED_EMAIL=… ADMIN_SEED_PASSWORD=… pnpm db:seed   # demo store; skip for a blank store
```

- [ ] To migrate on every deploy, set the build command to `pnpm db:migrate && pnpm build`. Migrations are
      idempotent, and Neon accepts the standard Postgres connection the migrator uses.
- [ ] Copy the publishable key the seed prints into `NUXT_PUBLIC_PUBLISHABLE_KEY`, or create one in
      Settings › Publishable API keys, then redeploy.

## 4. Webhooks from payment providers

- [ ] Stripe: Developers › Webhooks › add `https://<domain>/api/webhooks/stripe` with
      `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`,
      `payment_intent.payment_failed` and `charge.refunded`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
- [ ] Paystack: Settings › API Keys & Webhooks › webhook URL `https://<domain>/api/webhooks/paystack`.

## 5. Crons

`vercel.json` schedules the jobs; they're active once deployed to Production:

| Path | Schedule |
|---|---|
| `/api/cron/cart-expiry` | hourly |
| `/api/cron/reservation-release` | hourly at :30 |
| `/api/cron/webhook-retry` | every 15 minutes |

- [ ] Check that runs appear under Settings › Workflows › Scheduled jobs after the first hour. Vercel's Hobby
      plan only runs cron jobs once a day, so use Pro for these schedules, or change them to daily (webhook
      retries then wait up to a day).

## 6. Smoke test

- [ ] `/` renders products with prices; `/api/docs` returns the OpenAPI document.
- [ ] Sign in at `/admin` and change the seeded owner password (Settings › Profile).
- [ ] Place a test order: a GHS cash-on-delivery order, then a Stripe or Paystack test-mode payment.
- [ ] Fulfill and ship it from the admin; the shipping email arrives (or appears in logs without Resend).
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/webhook-retry` returns `{ job: … }`.
- [ ] Response headers include `Content-Security-Policy`, `Strict-Transport-Security` and `X-Frame-Options: DENY`.

## Notes

- Catalog pages (`/`, `/shop`, `/products/**`, `/collections/**`, `/categories/**`) use ISR (5 minutes).
  Cart, checkout, account and admin are never cached.
- Nothing writes to the local filesystem and no state lives in memory between requests, so any number
  of function instances is safe.
- `pnpm db:reset` refuses to run when `NODE_ENV=production` unless `ALLOW_DB_RESET=1` is set.
