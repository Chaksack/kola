# Decisions

Choices made where `kola.md` was ambiguous or where a dependency forced a change. Newest last.

## M1: Scaffold

- **Session secret is `NUXT_APP_SECRET`, not `NUXT_SESSION_PASSWORD`.** nuxt-auth-utils 0.6 ignores
  `runtimeConfig.session.password` and derives its sealing key from Nuxt's `appSecret`. `.env.example`
  lists `NUXT_APP_SECRET`; in development Nuxt generates one automatically.
- **Icons come from `@lucide/vue`** (the renamed successor of `lucide-vue-next`), with
  `:stroke-width="1.8"`.
- **One session cookie, two actors.** Admin users and customers both use the nuxt-auth-utils session,
  typed with `actor: 'admin' | 'customer'` (`shared/types/auth.d.ts`). `requireAdmin` and
  `requireCustomer` reject the wrong actor, so a customer session can never reach admin routes.
- **`vue/require-default-prop` is off.** Optional TypeScript props are `undefined` by default, so the rule
  only adds noise.
- **Vitest has three projects:** `unit` (pure TS in node, no Nuxt runtime), `api` (integration against a
  real Postgres via `DATABASE_URL`, run serially), and `nuxt` (component tests in the Nuxt environment).
- **Admin pages are client-rendered** (`/admin/** { ssr: false }`). They're behind auth, so SSR adds no SEO
  value and a client-only admin avoids serializing session data into HTML.

## M2: Data layer

- **Two drivers behind one `Db` type.** `server/db/client.ts` uses `neon-http` when `DATABASE_URL` points
  at `*.neon.tech` and `node-postgres` for anything else (local Postgres, CI). Both are typed as the
  shared `PgDatabase` surface, so services never branch on the driver.
- **Transactions via `useTx()`.** `neon-http` can't run interactive transactions. Multi-statement writes
  call `useTx(fn)`, which on Neon opens a `neon-serverless` WebSocket pool for that call only and closes
  it in `finally`, so nothing outlives the invocation. Hot paths that must be atomic without a
  transaction (inventory reservation) use single conditional `UPDATE … WHERE stocked - reserved >= n`.
- **Migrations and the seed use `node-postgres`** for every environment. Neon accepts ordinary Postgres
  connections, so one migrator covers local, CI and production.
- **Framework-agnostic code uses relative imports.** `server/services/**` and `server/db/**` don't use
  the `#shared` alias, so they run under `tsx` (seed, migrate) and plain Vitest without Nuxt.
- **Totals semantics.** Prices are shown as entered: tax-inclusive lines already contain tax, exclusive
  lines get tax added on top. Discounts reduce the gross amount and are capped at the line amount. Tax is
  computed per line on the discounted amount and rounded half away from zero, so order totals are exact
  sums of line totals. `subtotal` = items + shipping before discounts; `itemSubtotal` = items only.
- **Tax rates are basis points** (`1500` = 15%), and percentage promotions use basis points too
  (`1000` = 10%).
- **Mobile money is its own provider id (`paystack-momo`)**, backed by the Paystack provider with the
  `mobile_money` channel. That way regions can list it separately ("Paystack, Mobile money, Cash on
  delivery").
- **Seed passwords** are hashed with `@adonisjs/hash` scrypt using default options, which is the same
  hasher nuxt-auth-utils uses, so `verifyPassword` accepts them at runtime. Demo customers use
  `kola-demo-1234`.
- **The seed's publishable key** uses `NUXT_PUBLIC_PUBLISHABLE_KEY` when it's set, so the storefront and
  the database agree. Otherwise it generates one and prints it.

## M3: Auth

- **The session holds two keys, `admin` and `customer`**, instead of nuxt-auth-utils' single `user`, so
  one browser can be signed into both surfaces. `setSessionActor()` updates one without touching the
  other. Server helpers re-read the user or customer row on every request, so role changes and
  deletions apply immediately.
- **Errors come from a handler wrapper, not a global error handler.** Nitro allows only one error
  handler and Nuxt uses it for the error page. `defineApiHandler` / `defineValidatedHandler` catch
  everything and return `{ code, message, details }`. `server/api/[...path].ts` returns a JSON 404 for
  unknown API routes.
- **Env vars keep their spec names** (`DATABASE_URL`, `CRON_SECRET`, …) through Nitro `envExpansion`
  (`'{{DATABASE_URL}}'` in `runtimeConfig`), resolved at runtime and never inlined at build. Server code
  reads them via `useServerConfig()`, which treats unexpanded placeholders as unset.
- **Role rules.** owner > admin > member. Members can read users and keys but can't invite, change roles
  or create/revoke keys. Admins can't create, promote to or modify owners. The last owner can't be
  demoted. Secret API keys act as `admin` and can't mint more secret keys.
- **Invites return the accept URL once** in the API response (only a SHA-256 of the token is stored).
  An email is sent too once notifications land in M8.
- **Keys must be revoked before they can be deleted.** Publishable tokens are stored in plaintext (they
  are public by design); secret tokens are stored only as SHA-256 hashes, with a redacted
  `sk_…last4` for display.
- **Rate limiting is a fixed window in Postgres** (`rate_limit` table, one upsert per check), keyed by IP
  and, for logins, also by email.
- **CSRF:** SameSite=Lax cookies plus an Origin/Referer host check on unsafe `/api` requests that carry
  the session cookie. Bearer-key, webhook and cron requests are exempt.
- **API tests run over real HTTP.** A Vitest global setup builds a `node-server` copy of the app into
  `.output-test` (with its own `.nuxt-test` build dir, so it never clobbers `nuxt dev`) and starts it
  against the seeded DB. `KOLA_TEST_URL` points the tests at a running server instead;
  `KOLA_TEST_SKIP_BUILD=1` reuses the last build.
- **Customer login/register pages ship with the storefront in M7.** M3 delivers the customer auth API.

## M4: Catalog

- **Products are saved whole.** `POST /api/admin/products/:id` takes the full product (options,
  variants, prices, stock, media, links), matching the full-page editor. Options are matched by title
  and values by value; variants by id. Removed variants are soft-deleted with their SKU cleared, so
  order history keeps its references and the SKU can be reused. The whole save runs in one `useTx`
  transaction.
- **Updates use POST** (Medusa convention) rather than PUT/PATCH.
- **Variant generation.** With options but no variants, the server builds the full option matrix; with
  neither, one `Default` variant. The editor regenerates the matrix live and keeps existing variants
  whose combination still exists, including across option renames.
- **Prices in the editor are per currency**, with optional per-region override columns. Inputs are
  major units converted with `toMinor` (string parsing, no floats). Price-list prices are never touched
  by the product save.
- **Stock** is only written for locations sent in `inventory`; omitting it leaves levels unchanged.
- **Soft-deleted products and collections get their handle suffixed** (`-deleted-<id>`) so the unique
  handle can be reused. Categories, types and tags are hard-deleted; links cascade.
- **Uploads are identified by magic bytes** (JPEG, PNG, WebP, AVIF, GIF), never by the client's content
  type or file name; 5MB per file, 10 files per request. With no `BLOB_READ_WRITE_TOKEN`, uploads fall
  back to `data:` URLs (capped at 1MB): always in dev, or with `NUXT_ALLOW_DATA_URL_UPLOADS=true`
  (tests). In production without a token, uploads return 503.
- **Tests use `TEST_DATABASE_URL`** when it's set (`pnpm test:db` resets, migrates and seeds it), so API
  tests never write into the dev database.

## M5: Inventory and fulfillment setup

- **Every stock change is one conditional UPDATE** (`services/inventory.ts`), so it's atomic on neon-http
  without a transaction: `reserved += n WHERE stocked − reserved ≥ n`. A concurrency test proves eight
  parallel reservations of one unit against stock 3 yield exactly three.
- **Stocked can't be set below reserved**, so committed orders always stay fulfillable (409
  `insufficient_stock`).
- **Reservation picks one location per line**: the preferred location first, then whichever has the most
  available. A line is never split across locations.
- **Locations can't be deleted** while they're the store default or hold/reserve stock.
- **Built-in shipping profiles** (`default`, `gift_card`) can't be deleted; custom profiles can, once
  unused.
- **Service zone countries come from region countries**, so a location only ships where a region sells.
- **Shipping option prices are replaced wholesale on save**, like product prices.

## M6: Regions, sales channels and taxes

- **A country belongs to at most one region** (the `region_country.iso2` primary key). Saving a region
  that claims another region's country returns 409; deleting a region releases its countries.
- **The country list is a compact array of ISO codes**, with names from `Intl.DisplayNames`, so there's
  no country table to maintain.
- **One default tax rate per region.** Product-type rates are overrides and never the default. Rates
  are basis points.
- **Store defaults are protected:** the default region, location and sales channel can't be deleted (and
  the default channel can't be disabled) until another default is chosen.
- **Payment provider availability** is shown per provider (`configured` = credentials present), but
  regions may enable a provider before its keys are set; checkout hides unconfigured providers.
- **`api()` helper (app/utils/api.ts)** wraps `$fetch` for dynamic URLs to avoid Nitro typed-route
  inference hitting TypeScript's depth limit.

## M7: Store API and storefront

- **The promotion engine was built now rather than in M10**, because cart totals need it. It's a pure
  function (`services/promotion.ts`): automatic promotions first, then codes in the order added. Each
  promotion discounts what's left, at most one non-stackable promotion applies, and campaign spend
  budgets cap the amount. Table-driven tests cover rules, allocation, buy-get and stacking.
- **Pricing** (`services/pricing.ts`): a region-specific price beats a currency-wide one, quantity tiers
  must match, an `override` list replaces the base price, and a `sale` list applies only when cheaper.
  Customer-group price lists apply to signed-in members.
- **Sorting and filtering by price use SQL**, over base prices plus price lists that apply to everyone.
  The displayed price is the fully calculated one (which also includes customer-group lists).
- **Catalog pages are ISR-cached for everyone, so the server always renders the store's default
  region.** The browser applies the saved region (`kola_region` cookie) after hydration and refetches.
  This keeps cached HTML correct and avoids hydration mismatches.
- **Cart ids are unguessable ULIDs kept in a `kola_cart` cookie.** A cart is only usable through a key
  for its sales channel. A cart owned by a customer can't be read by a different signed-in customer.
- **Line prices are snapshots**, re-priced when the region or customer changes. Lines with no price in
  the new currency are removed and reported (`removedItems`). Shipping methods are cleared on region
  change.
- **Stock is checked when items are added or changed**, against available = stocked − reserved across
  locations. Reservation itself happens at checkout (M8).
- **`useStoreFetch`** wraps `useFetch` with the publishable key header and is registered in
  `optimization.keyedComposables`, so call sites still get unique auto keys.
- **The storage util is `useFileStorage`** (`useStorage` is Nitro's KV API).

## M8: Checkout

- **Completion is a saga** (`services/workflow.ts`): validate → reserve inventory → authorize payment →
  create order (one transaction) → emit `order.placed` after commit. A failure compensates in reverse:
  reservations are released and deleted, and payments are voided (Stripe) or refunded (Paystack, which
  captures immediately).
- **Exactly one order per cart.** `order.cart_id` is unique, a completed cart returns its existing order,
  and the `Idempotency-Key` header stores and replays the response. A concurrent duplicate gets 409; a key
  reused for a different request gets 422; a failed attempt frees the key for a retry.
- **The payment session must match the current cart total and currency**, or completion returns 409
  `payment_session_stale` and the shopper confirms payment again.
- **Providers:** Paystack (`paystack` = card/bank/momo, `paystack-momo` = mobile money only) charges
  immediately, so verified means captured. Stripe uses manual capture, so checkout authorizes and the admin
  captures. Manual (cash on delivery) places the order with payment `awaiting`.
- **Checkout only offers providers that are enabled for the region and configured.** With no keys set,
  Ghana checkout works with cash on delivery out of the box.
- **Webhooks** verify signatures on the raw body (Paystack HMAC-SHA512, Stripe `constructEvent`), record
  each provider event id once, and always return 200 once verified. A paid cart that never completed
  (tab closed) is completed from the webhook.
- **Guests become customers with `has_account = false`**, so their history shows in the admin;
  registering later upgrades that record.
- **Order lookup** requires the order id plus email (or the owning signed-in customer), or the display
  number plus email. "Not found" and "wrong email" get the same 404, so ids can't be probed.
- **Emails go through a notification provider** (Resend, or a console logger that never prints bodies).
  Failures are logged in `notification` and never break checkout. Invite URLs hold a raw token, so they
  go straight to the email and are never stored in the domain event log.
- **Shipping methods are per shipping profile.** Picking another option for the same profile replaces
  it; every profile in the cart needs a method.
- **E2E runs in real Chrome.** `pnpm test:e2e` builds a node server against `TEST_DATABASE_URL` and
  injects that database's publishable key. `PW_CHANNEL=chrome` uses an installed Chrome instead of
  Playwright's bundled Chromium.

## M9: Admin Orders

- **Statuses are always derived, never set by hand.** `deriveFulfillmentStatus` (from item
  fulfilled/shipped/delivered quantities) and `derivePaymentStatus` (from authorized/captured/refunded
  amounts) run at the end of every order action. An order becomes `completed` when it's delivered and
  paid.
- **Stock moves when goods physically move.** Creating a fulfillment consumes the reservation at the
  chosen location (stocked and reserved both go down). A reservation held at another location is moved
  first. Cancelling an unshipped fulfillment restocks and re-reserves. Cancelling an order releases its
  reservations. Receiving a return restocks at the chosen location.
- **Roles:** members can fulfil, ship, deliver, capture, allocate, take notes and handle returns.
  Refunds, cancellations, exchanges, order edits and recorded payments need `admin`.
- **Refunds draw from the most recent payments first**, through each payment's provider. Cash on
  delivery refunds are recorded only.
- **Cancelling an order** is refused once anything has shipped (use a return). Otherwise authorizations
  are voided, captures refunded and reservations released.
- **Returns** can't exceed fulfilled − returned − already-requested quantities. The refund value
  defaults to the items' paid totals, pro rata.
- **Exchanges** create a linked return. When it's received, the replacements are added to the order and
  reserved, the order total moves by the difference, and a negative difference is refunded
  automatically. A positive difference is collected with "Record a payment".
- **Order edits are proposed, then confirmed.** Confirming snapshots the previous version into
  `order_version`, applies the changes (quantities can't drop below what's fulfilled), adjusts
  reservations, recomputes totals with the totals engine (keeping each line's original per-unit
  discount), and refunds any captured overpayment. Only one proposed edit at a time.
- **Draft orders** are orders with `is_draft = true`, priced and taxed like a cart (custom unit prices
  allowed). Converting reserves stock and records a manual payment, either as paid or as awaiting.
- **Anonymous requests never get a session cookie.** The session is read only when its cookie exists;
  otherwise nuxt-auth-utils would issue an empty cookie to every guest, putting them through CSRF
  checks and making responses uncacheable. Found by the admin end-to-end test.
- **The Orders KPI strip sums only orders in the store's default currency.** Other currencies are
  counted, but adding them up needs exchange rates.

## M10: Customers, Promotions and Price lists

- **Lifetime spend is per currency**: total minus refunds over non-canceled, non-draft orders. The list
  shows the store's default currency; the customer page shows every currency.
- **Deleting a customer is soft**: their login is removed and orders keep their contact snapshot.
- **Promotion codes are stored upper-case and matched case-insensitively.** Deleting a promotion suffixes
  its code so the code can be reused, while orders still reference the original.
- **Rules builder:** conditions (cart must match: product, collection, category, type, customer group,
  region, currency, minimum subtotal), targets (which items are discounted), and buy rules (buy-get
  qualifiers). Minimum subtotal is entered in major units and stored in minor units.
- **Price lists are edited as a variant × currency grid.** Saving replaces a variant's list prices;
  clearing every price on a row removes the variant from the list. Customer-group lists only apply to
  signed-in members of those groups.
- **Gift card codes are bearer credentials.** The full code is returned once, at creation; lists show
  the last 4 characters. Balances can be adjusted down but never above the card's value. Redeeming gift
  cards at checkout isn't wired yet (the totals engine already supports `giftCardBalance`).
- **Raw SQL subqueries reference outer columns as quoted literals** (`"customer"."id"`). In single-table
  selections Drizzle renders `${table.column}` unqualified, which would silently bind to the
  subquery's own `id` column.

## M11: Platform

- **Outgoing webhooks are signed with HMAC-SHA256** over `${timestamp}.${body}`, sent as
  `Kola-Signature: t=<unix>,v1=<hex>`, with `Kola-Event` and `Kola-Delivery` headers. Signing secrets
  are derived (`HMAC(WEBHOOK_SIGNING_KEY, salt)`), never stored. The row keeps the salt, a SHA-256 of the
  secret and its last 4 characters, and the secret is shown once. `WEBHOOK_SIGNING_KEY` was added to
  `.env.example` (falling back to `CRON_SECRET`); rotating it rotates every endpoint's secret.
- **Delivery:** events are queued in `webhook_delivery` and attempted right away (3s timeout), then
  retried by the `webhook-retry` cron with backoff of 1m, 5m, 30m, 2h, 6h, 12h, 24h (8 attempts in
  total). The schedule lives in the database, so retries survive cold starts.
- **SSRF:** webhook URLs must be https and must not point at loopback, private, link-local or
  `.internal` hosts. Redirects aren't followed. `NUXT_ALLOW_INSECURE_WEBHOOKS=true` relaxes this for dev
  and tests. (Literal-host checks only; a DNS-rebinding-proof check would need resolved-IP pinning.)
- **Crons** are `GET /api/cron/*` with `Authorization: Bearer $CRON_SECRET` (constant-time compare), as
  Vercel Cron sends. On Hobby, where Vercel Cron is daily-only, `.github/workflows/cron.yml` calls the
  same endpoints once a day for now, with hourly schedules commented out (opt-in via the
  `CRON_BASE_URL` repo variable). Each run is audit-logged (shown on Settings › Workflows). The same
  jobs are Nitro tasks (`cart:expiry`, `reservation:release`, `webhook:retry`) for `nitro task run`
  locally. Jobs are idempotent: rows are deleted before stock is released, so overlapping runs can't
  double-release.
- **CSV is chunked by the browser.** Exports return a page of rows plus `nextOffset`, and the client
  concatenates and downloads. Imports are parsed client-side, grouped by handle and sent 25 products per
  request; each product saves in its own transaction, so one bad row doesn't sink the file. Exports
  neutralize spreadsheet formulas (`=`, `+`, `-`, `@`). The CSV isn't uploaded to Blob: rows go
  straight to the API, which needs no storage round trip.
- **OpenAPI 3.1 at `/api/docs`** is generated from the same zod schemas the routes validate with
  (`z.toJSONSchema`), so input docs can't drift. Responses are described in prose.
- **Reviews** (Extensions) are held for moderation. Store submissions are rate-limited to 5 per hour
  per IP. **Analytics** reports net sales (total − refunds) in the default currency, as a single-series
  bar chart with a data-table view.

## M12: Hardening

- **Accessibility is tested, not eyeballed.** `tests/e2e/a11y.spec.ts` runs axe (WCAG 2.1 A/AA) on 8
  storefront and 10 admin screens and fails on any violation. Fixes it drove:
  - `--orange-text`/`--warn-text` darkened from `#c94000` to `#b83a00`, and `--ok-text` from `#2f7a4a`
    to `#2a6e43`, so they clear 4.5:1 on every surface (paper, putty, hover rows, active nav), not just
    the canvas.
  - The 60% ink "second line" stays for large headings (3:1 is enough there); lead-size and body copy
    use `--ink-3`.
  - Links inside running text are underlined.
  - Tab counts use `--ink-2`.
- **375px:** storefront and admin have no horizontal overflow at 375px (checked in Chrome). KPI values
  scale down instead of clipping.
- **Performance is measured with Playwright, not Lighthouse** (Lighthouse isn't installed in this
  environment). `tests/e2e/perf.spec.ts` measures LCP and CLS on the production build under
  Lighthouse-style mobile throttling (4x CPU, ~1.6 Mbps, 150ms RTT), with budgets of LCP < 2.5s and
  CLS < 0.1. Measured: home LCP ≈ 0.86s / CLS 0; product LCP ≈ 0.74s / CLS 0; ≈ 344KB of JS
  transferred. The home page's CLS was 0.21, caused by the Inter font swap on the 72px hero. A
  metric-matched `Inter Fallback` face (Arial with Inter's ascent/descent/size-adjust) brought it to 0.
  Run Lighthouse against the deployed site to confirm the ≥ 90 score.
- **E2E admin tests share one session.** The global setup signs in once via the API and saves the
  session, because logging in per test trips the login rate limiter. The setup also clears
  `rate_limit`.
- **Crons are declared once**, in `nitro.vercel.config.crons`, which lands in `.vercel/output/config.json`
  for Git and prebuilt deploys alike. They used to be in `vercel.json` too, but Vercel merges the two and
  rejects the duplicates. They're daily so Hobby deploys pass (Hobby rejects anything more frequent);
  Pro deploys should restore hourly / 15-minute schedules.
- **CI** runs `check` (typecheck, lint, migrate, seed, unit+API tests, build) and then `e2e`
  (Playwright with bundled Chromium against a freshly seeded Postgres service).
