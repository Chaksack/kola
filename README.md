# Kola Commerce

A headless commerce platform in one Nuxt 4 app: an **admin dashboard** (`/admin`), a default
**storefront** (`/`), and an **HTTP API** (`/api/store/**`, `/api/admin/**`) that both use and that other
frontends can use too. It runs on Vercel with Neon Postgres.

- Catalog: products with an option → variant matrix, prices per currency and region, collections, a
  nested category tree, media on Vercel Blob, CSV import/export
- Inventory across locations, with reservations that can't oversell
- Regions, taxes (inclusive or exclusive), sales channels and publishable keys
- Checkout with Paystack (cards and mobile money, GHS), Stripe (EUR/GBP/USD) and cash on delivery,
  idempotent completion and compensation on failure
- Orders: fulfill, ship, deliver, capture, refund, returns, exchanges, versioned edits, draft orders
- Promotions with rules, buy-get, stacking and campaign budgets; price lists by customer group; gift cards
- Signed outgoing webhooks with retries, cron jobs, an audit log, and OpenAPI docs at `/api/docs`

Design decisions (and the reasons behind them) are logged in [`docs/decisions.md`](docs/decisions.md).
Deploying is covered in [`docs/deploy.md`](docs/deploy.md).

## Requirements

- Node 22+ and pnpm 11 (`corepack enable`)
- PostgreSQL 15+ (local, Docker, or a Neon branch)

## Local setup

```bash
pnpm install
cp .env.example .env            # then edit the values below
createdb kola                   # or point DATABASE_URL at any Postgres
pnpm db:migrate
pnpm db:seed                    # prints the publishable key; put it in NUXT_PUBLIC_PUBLISHABLE_KEY
pnpm dev                        # http://localhost:3000
```

Sign in to `/admin` with `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`. Demo customers (for example
`ama.owusu@example.com`) sign in at `/account/login` with `kola-demo-1234`.

The seed creates the Kola Market demo store: four regions (Ghana GHS with 15% inclusive VAT, West
Africa USD, Europe EUR, UK GBP), five sales channels, two locations, eight products, customers, orders
in every status, and the `HARMATTAN10` promotion. `pnpm db:reset` drops everything and reseeds.

### Environment variables

| Variable | Needed for |
|---|---|
| `DATABASE_URL` | Postgres. Neon URLs use the serverless driver automatically. |
| `NUXT_APP_SECRET` | Seals session cookies (32+ characters). Required in production. |
| `NUXT_PUBLIC_STORE_URL` | Public base URL (emails, CSRF origin check, OpenAPI server). |
| `NUXT_PUBLIC_PUBLISHABLE_KEY` | The storefront's publishable key (printed by the seed). |
| `BLOB_READ_WRITE_TOKEN` | Product image uploads. In dev, uploads fall back to data URLs. |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` | Paystack card and mobile money checkout. |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe checkout and webhooks. |
| `RESEND_API_KEY` | Transactional email. Without it, emails are logged to the console. |
| `CRON_SECRET` | Protects `/api/cron/*` (Vercel Cron, or the GitHub Actions cron workflow on Hobby, sends it as a Bearer token). |
| `WEBHOOK_SIGNING_KEY` | Derives outgoing webhook signing secrets (falls back to `CRON_SECRET`). |
| `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` | The owner account the seed creates. |
| `TEST_DATABASE_URL` | Optional separate database for `pnpm test` and `pnpm test:e2e`. |

Payment providers only appear at checkout when their keys are set **and** they're enabled for the
region. Without any keys, Ghana checkout works with cash on delivery.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build (Vercel preset) |
| `pnpm typecheck` / `pnpm lint` | `nuxt typecheck` / ESLint |
| `pnpm test` | Unit, component and API tests (Vitest) |
| `pnpm test:e2e` | Playwright: guest checkout, admin fulfillment, accessibility, web vitals |
| `pnpm db:generate` | Generate a migration after changing `server/db/schema/**` |
| `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:reset` | Apply migrations / seed the demo store / reset |
| `pnpm test:db` | Reset, migrate and seed `TEST_DATABASE_URL` |

### Tests

- **Unit** (`tests/unit`): totals engine, promotion engine, pricing, money, statuses, CSV, webhooks, OpenAPI.
- **API** (`tests/api`): a Vitest global setup builds a node-server copy of the app into
  `.output-test`, starts it against `TEST_DATABASE_URL` (or `DATABASE_URL`) and drives it over HTTP,
  covering auth and roles, catalog, inventory concurrency, checkout, orders, marketing, webhooks and crons.
  `KOLA_TEST_SKIP_BUILD=1` reuses the last build; `KOLA_TEST_URL` targets a running server.
- **E2E** (`tests/e2e`): Playwright against a production build with a seeded database. Locally,
  `PW_CHANNEL=chrome pnpm test:e2e` uses your installed Chrome instead of downloading Chromium.

Run `pnpm test:db` once before the API and E2E suites so they never touch your dev data.

## Payments in test mode

**Paystack** (GHS): create a test account, copy the test secret and public keys into `.env`, and enable
`paystack` and/or `paystack-momo` on the Ghana region (Settings › Regions). Use Paystack's test cards or
test mobile money numbers at checkout. For webhooks, expose your dev server (for example
`cloudflared tunnel --url http://localhost:3000`) and set the Paystack webhook URL to
`https://<tunnel>/api/webhooks/paystack`. Paystack signs with your secret key, so nothing else is needed.

**Stripe** (EUR/GBP/USD): set the test keys, then forward webhooks with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe   # prints whsec_… → STRIPE_WEBHOOK_SECRET
```

Stripe payments are authorized at checkout and captured from the order page (Capture payment).

## Project map

```
app/                  Nuxt frontend
  components/ui       In-house UI kit (Button, Table, Dialog, KpiStrip…); see /admin/_kit
  components/admin    Admin building blocks (Sidebar, ProductEditor, PromotionEditor…)
  components/store    Storefront (SiteHeader, ProductCard, Listing, CartDrawer, CheckoutStep…)
  pages/admin/**      Admin dashboard
  pages/**            Storefront
server/
  api/{store,admin,webhooks,cron}/**   HTTP API (Nitro)
  services/**         Framework-agnostic business logic (totals, cart, checkout, orders, promotions…)
  providers/**        Payment (Paystack, Stripe, manual), notification (Resend, console), storage (Blob)
  db/                 Drizzle schema, migrations, seed
  utils/**            requireAdmin, requireCustomer, requirePublishableKey, useDb, defineValidatedHandler…
shared/               zod schemas and utilities used by both sides
tests/{unit,api,e2e}  Test suites
```

## API conventions

- Store routes need `x-publishable-api-key`; the key decides which sales channels you can see.
- Admin routes accept the admin session cookie or `Authorization: Bearer sk_…` (secret API key).
- Money is always integer minor units plus a currency code.
- Lists take `?limit=&offset=&order=&q=` and return `{ data, count, limit, offset }`.
- Errors return `{ code, message, details }` with a matching HTTP status.
- `POST /api/store/carts/:id/complete` accepts an `Idempotency-Key` header.
- The full reference is generated from the validation schemas at **`/api/docs`** (OpenAPI 3.1).
