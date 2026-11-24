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
