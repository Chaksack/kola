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
