# Build prompt: Kola Commerce — headless ecommerce platform (Nuxt 4 + Nitro, Vercel)

You are building a production-grade, Medusa-style headless commerce platform as a single Nuxt 4 application. It has three surfaces:

1. **Admin dashboard** (`/admin/**`): the back office for orders, products, inventory, customers, promotions, price lists and settings.
2. **Storefront** (`/`): the default customer-facing shop, so the platform works out of the box.
3. **HTTP API** (`/api/admin/**` and `/api/store/**`): a Nitro server that both UIs use and that third-party frontends can also use.

Work in milestones (bottom of this file). After each milestone: run typecheck, lint and tests, commit, and give a short summary of what you built. Don't move on while anything is red. If something here is ambiguous, pick the simplest option that fits the architecture, write the decision in `docs/decisions.md`, and keep going.

---

## 1. Stack (non-negotiable)

- **Nuxt 4** (latest 4.x) with the default Nuxt 4 layout: `app/` holds the frontend (pages, components, composables, layouts, middleware), `server/` holds Nitro, and `shared/` holds code and types used by both. Set `compatibilityDate` in `nuxt.config.ts`.
- **TypeScript** in strict mode everywhere. No `any` unless a comment explains why. `nuxi typecheck` must pass.
- **Nitro** for every backend route (`server/api/**`, `server/routes/**`, `server/middleware/**`, `server/utils/**`, `server/tasks/**`).
- **Hosting: Vercel.** Use Nitro's `vercel` preset (it's auto-detected on Vercel; also set `nitro.preset = 'vercel'` explicitly). Everything must work on serverless and edge-friendly patterns: no long-lived in-memory state, no local filesystem writes, and connection pooling that is safe for serverless.
- **Database:** PostgreSQL (Neon via Vercel Marketplace) with **Drizzle ORM** and `drizzle-kit` migrations. Use the Neon serverless driver (`@neondatabase/serverless`) with `drizzle-orm/neon-http` for request paths.
- **Validation:** `zod` schemas in `shared/schemas/**`, reused for API input validation (`readValidatedBody`, `getValidatedQuery`) and for frontend forms.
- **Auth:** `nuxt-auth-utils` for sealed cookie sessions. Two separate actor types: **admin users** (email + password; roles `owner`, `admin`, `member`) and **customers** (email + password; guest checkout allowed). Hash passwords with `hashPassword` / `verifyPassword` from nuxt-auth-utils.
- **File storage:** Vercel Blob (`@vercel/blob`) for product images and CSV imports.
- **Payments:** a provider interface with two implementations, **Paystack** (cards and mobile money, for GHS) and **Stripe** (for EUR, GBP and USD), plus a **manual / cash-on-delivery** provider. Payment webhooks are verified by signature.
- **Email:** a notification-provider interface with a Resend implementation and a console fallback for development.
- **Scheduled jobs:** Nitro tasks triggered by Vercel Cron (via `vercel.json` crons calling protected routes), for example expiring abandoned carts and releasing stale inventory reservations.
- **State and data fetching:** `useFetch` / `$fetch` with typed responses, and Pinia only where state truly spans pages (the cart).
- **Styling:** plain CSS with custom properties (design tokens below), plus scoped component styles. No Tailwind, no component library. Build a small in-house UI kit in `app/components/ui/`.
- **Testing:** Vitest with `@nuxt/test-utils` for unit and API tests, and Playwright for smoke end-to-end tests of checkout and admin order fulfillment.
- **Tooling:** pnpm, ESLint (`@nuxt/eslint`), Prettier, and GitHub Actions CI (install → typecheck → lint → test → build).

## 2. Design system — "Warm paper" (follow exactly)

The look is a warm, light, technical style: cream and putty surfaces, brown-black ink, regular-weight grotesk type, thin rules, small corners, and burnt orange used **only** for small links and markers. Put the tokens in `app/assets/css/tokens.css` and use them everywhere. **Never hard-code a hex value in a component.**

```css
:root {
  /* Ink */
  --ink: #26251e;            /* headings, body, filled primary buttons */
  --ink-2: #4a4943;          /* secondary text, nav items */
  --ink-3: #6b6a64;          /* muted labels (darkened from spec #7a7974 for 4.5:1 contrast) */
  /* Surfaces */
  --paper: #f7f7f4;          /* main canvas; reversed text on primary buttons */
  --putty: #f2f1ed;          /* cards, panels, app chrome, footer */
  --putty-inset: #ebeae5;    /* hover rows, badges, inset panels */
  --control: #e6e5e0;        /* active nav item, secondary pills, avatars */
  --stage-warm: #d9d5cf;     /* media / thumbnail backings */
  --stage-stone: #cac6be;
  --stage-sage: #cfcebc;
  --stage-blue: #b6b9be;
  /* Lines */
  --rule: #e2e2df;           /* = rgba(38,37,30,.10): table rules, card borders */
  --rule-strong: #d9d8d3;    /* input and button borders */
  --outline: #cdcdc9;        /* = 20% ink: pill outlines, dashed "add filter" */
  /* Accent — small links and markers only, never a filled button or a background */
  --orange: #f54e00;         /* dots and markers only */
  --orange-text: #c94000;    /* link text (accessible on paper) */
  /* Status */
  --ok: #3f8f5a;  --ok-text: #2f7a4a;
  --warn: #f54e00; --warn-text: #c94000;
  --info: #5b7aa8;
  --danger-text: #b42318;
  --neutral-dot: #a8a7a1;
  /* Shape and rhythm */
  --radius: 4px;             /* cards, inputs, thumbnails */
  --radius-pill: 999px;      /* buttons, filter tabs */
  --gutter: 10px;
  --font-sans: "Inter", system-ui, sans-serif;           /* substitute for CursorGothic */
  --font-mono: "JetBrains Mono", ui-monospace, monospace; /* IDs, SKUs, codes, keys */
}
```

Typography: weights **400 and 500 only**. Headings are 400 with tight tracking. Scale:

| Role | Size / line-height | Tracking |
|---|---|---|
| Closing / hero display (storefront only) | 72px / 1.1 | -0.03em |
| Section heading | 36px / 1.2 | -0.02em |
| Page title (admin) | 26px / 1.2 | -0.02em |
| Feature lead | 22px / 1.3 | -0.005em |
| Body | 14px / 1.5 | 0.01em |
| UI / table | 13px | — |
| Labels, meta | 12px | — |
| Section eyebrow | 11px, uppercase | 0.06em |

Rules:
- **Do:** use warm paper, never pure white, as the canvas. Use 4px corners on cards, panels and media. Use pill buttons. Use thin horizontal rules for tables and comparison grids. Use generous section spacing (about 67px) on storefront marketing sections and compact interiors inside cards. Use 60% ink for the second line of a heading pair. Use tabular numerals for money.
- **Don't:** use orange as a filled conversion button or a background. Don't round cards more than 4px. Don't put drop shadows on cards (only floating windows, menus and modals get elevation). Don't make headings bold. Don't render tables as stacks of floating cards. Don't use emoji. Icons are inline 1.8px-stroke SVGs (use `lucide-vue-next`).

Buttons:
- **Primary:** `--ink` background, `--paper` text, pill shape, 36px tall, 14px horizontal padding, weight 500.
- **Secondary:** `--paper` background, `1px --rule-strong` border, pill shape. Hover: `--putty-inset`.
- **Ghost / dashed:** "Add filter" style with a dashed `--outline` border.
- Touch targets are at least 44px on mobile.

Status badge: inline-flex, 22px tall, `--putty-inset` background, `--rule` border, 4px radius, a 6px coloured dot plus `--ink` text. Dot colours: captured / delivered / published = `--ok`; awaiting / not fulfilled / proposed = `--warn`; shipped / partially fulfilled = `--info`; refunded / returned / draft = `--neutral-dot`.

Accessibility: real `<button>`, `<a>` and `<label>` elements, `aria-label` on icon-only buttons, a visible focus ring (2px `--ink` outline, 2px offset), text contrast of at least 4.5:1, and layouts that work at 375px wide (the sidebar stacks above the content, toolbars wrap, wide tables scroll horizontally inside their card).

## 3. Admin layouts (match these screens)

**Shell** (`app/layouts/admin.vue`): a flex-wrap row. The sidebar is `flex: 1 1 232px`, has a right border of `--rule`, and contains:
- a store switcher at the top (an ink square showing the initial "K", "Kola Market", and "Production store" in muted text)
- the main nav with 34px items and 4px radius; the active item is `--control` background with `--ink` text: Orders (with an unfulfilled count marker in `--orange-text`, mono font), Products (sub-items Collections, Categories, Gift cards), Inventory, Customers, Promotions, Price lists
- an "Extensions" eyebrow group: Analytics, Reviews
- pinned at the bottom: Settings, then the current user's avatar and name

The content area is `flex: 999 1 560px; min-width: 0`, padded `20px clamp(16px, 3vw, 40px) 48px`, with a 24px vertical gap. Each page header has a breadcrumb (`Commerce / Orders`), a ⌘K search field, and the page's actions on the right.

**Orders list** (`/admin/orders`):
- Title "Orders" with the subtitle "Payments, fulfillments, returns and exchanges across every sales channel."
- A KPI strip: 4 cells in one bordered grid separated by 1px gaps (gross sales for 30 days, orders, average order value, awaiting fulfillment), each with a delta line in ok or warn text.
- The table card has a toolbar with pill filter tabs (All, Unfulfilled, Unpaid, Refunds & returns, each with a count), "Add filter" and "Sort: Newest".
- Columns: Order (mono link) · Date · Customer (name plus muted email) · Sales channel · Payment badge · Fulfillment badge · Total (right-aligned, tabular).
- Server-side pagination ("Showing X of N", Previous / Next).
- Tabs, search and filters sync to URL query params.

**Order detail** (`/admin/orders/[id]`): a back link to Orders; actions Request return, Edit order and a ⋯ menu. The title is the mono order number, with placement meta and payment and fulfillment badges. Two columns that wrap on small screens:
- **Main column:**
  - Unfulfilled items card: thumbnail, title, variant and SKU, unit price × quantity, line total. Buttons "Allocate stock" and "Create fulfillment".
  - Summary card as a definition list: subtotal, discount with mono code, shipping method, tax (included), total, paid by customer. A "Refund" button.
  - Activity card: a note input and a timeline of events with coloured dots.
- **Side column:**
  - Customer card: avatar, link, order count, email, phone, group tags.
  - Shipping address card: address and shipping method.
  - Details card: sales channel, region, cart ID in mono.

**Products** (`/admin/products`): title "Products" with the subtitle "Variants, options, pricing per region and stock across locations." Actions: Import CSV and Create product. Toolbar: search (title, SKU, handle), filter pills for Status, Collection and Sales channel, and a total count. Columns: Product (40px thumbnail on a stage colour, title, mono handle) · Collection · Sales channels · Variants · Inventory (ink, warn text when low, danger text when out of stock, muted for "Not tracked") · Status badge. Build product create/edit as a full page: general info, media upload to Blob, options to variants matrix, prices per currency and region, inventory per location, sales channels, collection, category, tags, SEO.

**Settings** (`/admin/settings/**`): its own sidebar with a "Back to store" link and grouped nav:
- **General:** Store, Regions, Sales channels, Locations & shipping, Tax regions, Return reasons, Product types & tags
- **Developer:** Publishable API keys, Secret API keys, Webhooks, Workflows
- **Team:** Users & roles, Profile

The Regions page has an explainer subtitle and a table (Region · Countries · Currency in a mono chip · Payment providers · Tax · ⋯ menu). Below it is a 3-up card grid: Store defaults, Sales channels with enabled/disabled state, and a Publishable API key shown masked with a Copy button.

Build the remaining admin sections in the same visual language: Inventory, Customers (with groups), Promotions, Price lists, Draft orders, Returns, Exchanges, Gift cards, Users.

## 4. Storefront — the default look

Same tokens and type, but in an editorial marketing rhythm. Layout: `app/layouts/default.vue`.

- **Header:** paper background with a bottom `--rule`. Logo wordmark on the left. Nav: Shop, Collections, About. On the right: a region/currency selector, account, and a cart button with a count. Collapses to a menu button below 768px.
- **Home** (`/`):
  - Hero with a 26px opening line and a 72px display heading reserved for one statement. The second line of the heading pair is in 60% ink. Primary pill "Shop now" and secondary pill "Browse collections".
  - Featured collection rail: product cards on `--putty` with 4px radius, the image on a stage colour, title, and price in tabular numerals.
  - "New arrivals" grid with 10px gutters.
  - An editorial band on `--putty` with text and an image.
  - A five-column light footer and a restrained utility row (© year, currency, legal links).
- **Collection / category** (`/collections/[handle]`, `/categories/[...handle]`): filter sidebar (price, options, availability) plus a responsive grid, with sort and pagination in the URL.
- **Product detail** (`/products/[handle]`): gallery on a stage-colour backing; title (36px, weight 400) and price; option selectors as pills (the selected one is `--ink` filled); stock state; quantity; primary "Add to cart"; description and details shown as accordions separated by rules (not cards); related products.
- **Cart:** a drawer plus a `/cart` page with line items, quantity steppers, a promo code field, a totals definition list, and "Checkout".
- **Checkout** (`/checkout`): a single page with progressive steps (Contact → Shipping address → Delivery method → Payment → Review) and the order summary pinned on the right. Supports guest checkout. Uses Paystack inline or Stripe Payment Element depending on the region's provider.
- **Order confirmation** (`/order/confirmed/[id]`) and **Account** (`/account`: profile, addresses, order history, order detail).
- Use `useSeoMeta`, structured data (`Product`, `BreadcrumbList`), `@nuxt/image` with Vercel image optimization, and ISR / route rules for catalog pages (`routeRules: { '/products/**': { isr: 300 }, '/collections/**': { isr: 300 } }`). Cart, checkout and account are always SSR or client-side with no caching.

## 5. Domain model (Drizzle schema in `server/db/schema/**`)

Use prefixed ULID string IDs, Medusa-style (`prod_`, `variant_`, `order_`, `cart_`, `cus_`, `reg_`, `sc_`, `promo_` …), plus `createdAt`, `updatedAt` and a soft-delete `deletedAt`. Store money as **integer minor units** together with a `currencyCode`. Never use floats.

- **Store:** store (name, default currency, default region, default location), currencies.
- **Regions:** region (name, currency, tax-inclusive flag, automatic taxes), countries of each region, payment providers enabled per region, tax rates.
- **Sales channels:** sales channel (name, description, enabled), publishable API keys scoped to channels.
- **Catalog:**
  - product (title, subtitle, handle, description, status `draft | proposed | published | rejected`, thumbnail, weight and dimensions, metadata)
  - product options and option values; product variants (SKU, barcode, option values, manage inventory, allow backorder)
  - images, collections, categories (a nested tree), tags, types
  - product ↔ sales channel links
- **Pricing:** price sets per variant, prices (amount, currency, optional region, min/max quantity), price lists (`sale | override`, status, starts/ends, customer-group rules).
- **Inventory:** stock locations (with address), inventory items (one per variant), inventory levels per location (stocked, reserved, incoming), reservations linked to order line items.
- **Fulfillment:** shipping profiles, service zones per location, shipping options (flat or calculated, price per currency, rules), fulfillments and fulfillment items, tracking numbers.
- **Customers:** customer (email, name, phone, has account), addresses, customer groups and memberships.
- **Carts:** cart (region, sales channel, customer or email, currency, addresses), line items, shipping methods, applied promotions, payment collection and sessions.
- **Orders:** order (display ID as an incrementing number such as `#10482`, status, payment status, fulfillment status, totals snapshot), order items with a price snapshot, shipping methods, transactions, order changes and versions (edits), notes and activity events, returns and return items, exchanges, claims, refunds.
- **Promotions:** promotion (code, `standard | buyget`, automatic flag), application method (percentage or fixed, target `items | shipping | order`, allocation `each | across`), rules (by product, collection, customer group, region, minimum subtotal), campaigns with budgets and usage limits.
- **Users and access:** admin users, invites, roles; secret API keys (hashed, last 4 digits shown).
- **Platform:** webhooks (URL, events, hashed signing secret, delivery log with retries), idempotency keys, audit log.

## 6. Business logic (in `server/services/**`, framework-agnostic and unit-tested)

- **Totals engine:** one pure function computes line, discount, shipping, tax (inclusive and exclusive) and grand total in minor units, with deterministic rounding. Covered by table-driven tests.
- **Cart → order completion** as a workflow: validate stock → reserve inventory → authorize payment → create order → emit `order.placed`. Each step has a compensation step (release the reservation, cancel the payment) if a later step fails. Make it idempotent with an `Idempotency-Key` header.
- **Payment capture, refund and void** through the provider interface. Webhook handlers update payment status and are idempotent.
- **Fulfillment:** create, mark shipped with tracking, mark delivered; each step decrements stock or moves reserved stock.
- **Returns and exchanges:** request → receive → refund; restock to a chosen location.
- **Order edits:** propose → confirm, which creates a new order version and settles the price difference.
- **Promotions:** rule evaluation, stacking rules, usage counting, campaign budget checks.
- **Domain events:** an internal event bus (`order.placed`, `order.fulfilled`, `payment.captured`, `product.updated`, …) that fans out to notifications and outgoing webhooks. Webhooks are signed with HMAC-SHA256 and delivered with retries (backoff tracked in the DB; retried by the cron task).

## 7. API surface

- `/api/store/**` (storefront; requires the `x-publishable-api-key` header to scope the sales channel):
  - regions; products (list, filter, by handle); collections; categories
  - carts: create, update, line items CRUD, shipping options, add shipping method, promotions, payment sessions, complete
  - customers: register, login, me, addresses, orders
  - order lookup by ID plus email
- `/api/admin/**` (admin session or secret API key as a Bearer token; role checked):
  - full CRUD for every domain above
  - order actions: capture, refund, fulfill, ship, cancel, return, exchange, edit
  - CSV import and export (products, orders), run in chunks so each request stays within serverless limits
  - stats for the KPI strip
- `/api/webhooks/paystack` and `/api/webhooks/stripe`: verify the signature, then process idempotently.
- Lists use consistent pagination: `?limit=&offset=&order=&q=`, returning `{ data, count, limit, offset }`. Errors return `{ code, message, details }` with correct HTTP status codes.
- Use `server/utils/` helpers: `requireAdmin(event, role?)`, `requireCustomer(event)`, `requirePublishableKey(event)`, `useDb()`, `defineValidatedHandler(schema, fn)`.
- Generate an OpenAPI document from the zod schemas and serve it at `/api/docs`.

## 8. Project structure

```
app/
  assets/css/{tokens.css,base.css}
  components/ui/        # Button, Badge, StatusBadge, Card, Table, Tabs, Input, Select, Dialog, Drawer, Menu, Toast, EmptyState, Pagination, KpiStrip
  components/admin/     # Sidebar, PageHeader, OrderTable, ProductTable, ActivityTimeline, ...
  components/store/     # SiteHeader, SiteFooter, ProductCard, ProductGallery, OptionPills, CartDrawer, CheckoutSteps, ...
  composables/          # useCart, useRegion, useAdminList, useMoney, ...
  layouts/{default,admin,settings,auth}.vue
  middleware/{admin-auth,customer-auth}.ts
  pages/                # storefront at the root, admin under pages/admin/**
server/
  api/{store,admin,webhooks}/**
  db/{schema,migrations,seed.ts}
  services/**           # totals, cart, order, payment, fulfillment, inventory, promotion, pricing, events, webhooks
  providers/{payment,notification,storage}/**
  tasks/**              # cart-expiry, reservation-release, webhook-retry
  utils/**
shared/{schemas,types,utils}/**
tests/{unit,api,e2e}/**
```

## 9. Seed data and environment

- `pnpm db:seed` creates the demo store "Kola Market":
  - regions: Ghana (GHS, VAT 15% inclusive, Paystack + mobile money + cash on delivery), West Africa (USD), Europe (EUR), United Kingdom (GBP)
  - sales channels: Web store, Mobile app, POS · Osu, POS · Tema, Wholesale (disabled)
  - locations: Tema warehouse (default) and Osu store
  - about 8 products: Kente Weave Tote, Shea Body Butter 250ml, Adinkra Linen Shirt, Ceramic Pour-Over Set, Single-Origin Cocoa Nibs, Batik Silk Scarf, Woven Market Basket, Holiday Gift Card
  - sample customers and orders in every status, a `HARMATTAN10` 10% promotion, and an owner admin user taken from env vars
- `.env.example` lists every variable: `DATABASE_URL`, `NUXT_SESSION_PASSWORD` (32+ characters), `BLOB_READ_WRITE_TOKEN`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`, `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, `NUXT_PUBLIC_STORE_URL`, `NUXT_PUBLIC_PUBLISHABLE_KEY`. Read them through `runtimeConfig`, never `process.env` scattered through the code.
- `vercel.json` defines crons (cart expiry hourly, webhook retry every 15 minutes) that call `/api/cron/*`, which check `Authorization: Bearer ${CRON_SECRET}`.
- `README.md` covers local setup, migrations, seeding, running Paystack and Stripe in test mode, and deploying to Vercel (connect the repo, add Neon from the Marketplace, set env vars, then run `pnpm db:migrate` as a build step or by hand).

## 10. Security

- Rate-limit auth and checkout routes.
- CSRF protection for cookie-authenticated mutations (same-site cookies plus an origin check).
- Store secret API keys and webhook secrets hashed.
- Never log card data, full keys or passwords.
- Security headers via route rules: CSP, HSTS, X-Frame-Options and Referrer-Policy.
- Role checks on every admin route, with tests proving that a `member` can't manage users or API keys.
- Validate and limit image uploads by type and size.

## 11. Milestones

1. **Scaffold:** Nuxt 4 + TypeScript strict + ESLint/Prettier + Vitest + CI + Vercel preset; tokens.css, base.css and the full `components/ui` kit, with a `/admin/_kit` page showing every component in every state.
2. **Data layer:** Drizzle schema for all domains, migrations, seed script, `useDb()`, ID helpers, the money utilities and the totals engine with tests.
3. **Auth:** admin login, invite and roles; customer register and login; middleware; publishable and secret API keys.
4. **Catalog:** product, variant, option, price, collection, category and media APIs plus the admin Products list and editor.
5. **Inventory and fulfillment setup:** locations, levels, shipping profiles and options; the admin Inventory and Settings › Locations & shipping pages.
6. **Regions, sales channels and taxes:** APIs plus Settings › Regions (matching the layout above), Sales channels and Tax.
7. **Store API and storefront:** home, collection, product detail, cart drawer and page.
8. **Checkout:** cart completion workflow, Paystack, Stripe and manual providers, webhooks, confirmation page, emails.
9. **Admin Orders:** list with KPI strip, tabs and filters, and the detail page with fulfill, ship, capture, refund, return, exchange and edit actions plus the activity timeline.
10. **Customers, Promotions and Price lists:** admin pages plus engine integration.
11. **Platform:** outgoing webhooks, crons, CSV import/export, OpenAPI docs, audit log.
12. **Hardening:** Playwright end-to-end tests (guest checkout in GHS with the manual provider; admin fulfills and ships that order), an accessibility pass, a performance pass (Lighthouse ≥ 90 on home and product pages), and a Vercel deploy checklist.

## 12. Definition of done

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass, and `pnpm test:e2e` passes against a seeded database.
- A fresh clone deploys to Vercel with only env vars set, the seed runs, and the storefront and admin both work.
- Every screen in sections 3 and 4 matches the layouts and the "Warm paper" tokens. Orange appears only on small links and markers. Cards have 4px corners and no shadows. Headings are weight 400.
- All money is integer minor units, all mutations are validated with zod, and every admin route is role-checked.