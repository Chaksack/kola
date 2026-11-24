<script setup lang="ts">
import {
  Inbox,
  Tag,
  Boxes,
  Users,
  BadgePercent,
  ReceiptText,
  ChartLine,
  MessageSquareText,
  Settings,
} from '@lucide/vue'

const route = useRoute()
const { user } = useUserSession()
const { data: counts } = await useFetch<{ unfulfilled: number }>('/api/admin/stats/nav', {
  key: 'admin-nav-counts',
  default: () => ({ unfulfilled: 0 }),
  server: false,
})

const mobileOpen = ref(false)
watch(() => route.fullPath, () => (mobileOpen.value = false))

function isActive(to: string, exact = false) {
  return exact ? route.path === to : route.path === to || route.path.startsWith(`${to}/`)
}

const productChildren = [
  { to: '/admin/collections', label: 'Collections' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/gift-cards', label: 'Gift cards' },
]
const productsOpen = computed(
  () => isActive('/admin/products') || productChildren.some((c) => isActive(c.to)),
)
const ordersOpen = computed(() => ['/admin/orders', '/admin/draft-orders', '/admin/returns', '/admin/exchanges'].some((p) => isActive(p)))
const displayName = computed(() => {
  const u = user.value as { name?: string; email?: string } | null
  return u?.name || u?.email || 'Admin'
})
</script>

<template>
  <aside class="sidebar" :class="{ 'is-open': mobileOpen }">
    <div class="sidebar__top">
      <NuxtLink to="/admin/orders" class="store-switcher">
        <span class="store-switcher__mark" aria-hidden="true">K</span>
        <span class="store-switcher__text">
          <span class="store-switcher__name">Kola Market</span>
          <span class="meta">Production store</span>
        </span>
      </NuxtLink>
      <button
        type="button"
        class="sidebar__toggle"
        :aria-expanded="mobileOpen"
        aria-controls="admin-nav"
        aria-label="Toggle navigation"
        @click="mobileOpen = !mobileOpen"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
    </div>

    <nav id="admin-nav" class="sidebar__nav" aria-label="Admin">
      <ul class="nav-list">
        <li>
          <NuxtLink to="/admin/orders" class="nav-item" :class="{ 'is-active': isActive('/admin/orders') }">
            <Inbox :size="16" :stroke-width="1.8" aria-hidden="true" />
            <span>Orders</span>
            <span v-if="counts.unfulfilled" class="nav-marker" :aria-label="`${counts.unfulfilled} unfulfilled`">{{ counts.unfulfilled }}</span>
          </NuxtLink>
          <ul v-if="ordersOpen" class="nav-sub">
            <li><NuxtLink to="/admin/draft-orders" class="nav-item nav-item--sub" :class="{ 'is-active': isActive('/admin/draft-orders') }">Drafts</NuxtLink></li>
            <li><NuxtLink to="/admin/returns" class="nav-item nav-item--sub" :class="{ 'is-active': isActive('/admin/returns') }">Returns</NuxtLink></li>
            <li><NuxtLink to="/admin/exchanges" class="nav-item nav-item--sub" :class="{ 'is-active': isActive('/admin/exchanges') }">Exchanges</NuxtLink></li>
          </ul>
        </li>
        <li>
          <NuxtLink to="/admin/products" class="nav-item" :class="{ 'is-active': isActive('/admin/products') }">
            <Tag :size="16" :stroke-width="1.8" aria-hidden="true" />
            <span>Products</span>
          </NuxtLink>
          <ul v-if="productsOpen" class="nav-sub">
            <li v-for="c in productChildren" :key="c.to">
              <NuxtLink :to="c.to" class="nav-item nav-item--sub" :class="{ 'is-active': isActive(c.to) }">{{ c.label }}</NuxtLink>
            </li>
          </ul>
        </li>
        <li>
          <NuxtLink to="/admin/inventory" class="nav-item" :class="{ 'is-active': isActive('/admin/inventory') }">
            <Boxes :size="16" :stroke-width="1.8" aria-hidden="true" /><span>Inventory</span>
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/admin/customers" class="nav-item" :class="{ 'is-active': isActive('/admin/customers') }">
            <Users :size="16" :stroke-width="1.8" aria-hidden="true" /><span>Customers</span>
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/admin/promotions" class="nav-item" :class="{ 'is-active': isActive('/admin/promotions') }">
            <BadgePercent :size="16" :stroke-width="1.8" aria-hidden="true" /><span>Promotions</span>
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/admin/price-lists" class="nav-item" :class="{ 'is-active': isActive('/admin/price-lists') }">
            <ReceiptText :size="16" :stroke-width="1.8" aria-hidden="true" /><span>Price lists</span>
          </NuxtLink>
        </li>
      </ul>

      <p class="eyebrow nav-eyebrow">Extensions</p>
      <ul class="nav-list">
        <li>
          <NuxtLink to="/admin/analytics" class="nav-item" :class="{ 'is-active': isActive('/admin/analytics') }">
            <ChartLine :size="16" :stroke-width="1.8" aria-hidden="true" /><span>Analytics</span>
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/admin/reviews" class="nav-item" :class="{ 'is-active': isActive('/admin/reviews') }">
            <MessageSquareText :size="16" :stroke-width="1.8" aria-hidden="true" /><span>Reviews</span>
          </NuxtLink>
        </li>
      </ul>

      <div class="sidebar__bottom">
        <ul class="nav-list">
          <li>
            <NuxtLink to="/admin/settings" class="nav-item" :class="{ 'is-active': isActive('/admin/settings') }">
              <Settings :size="16" :stroke-width="1.8" aria-hidden="true" /><span>Settings</span>
            </NuxtLink>
          </li>
        </ul>
        <NuxtLink to="/admin/settings/profile" class="sidebar__user">
          <UiAvatar :name="displayName" :size="26" />
          <span class="sidebar__user-name">{{ displayName }}</span>
        </NuxtLink>
      </div>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  flex: 1 1 232px;
  border-right: 1px solid var(--rule);
  background: var(--putty);
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
  gap: 12px;
}
@media (min-width: 801px) {
  .sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    max-width: 260px;
    overflow-y: auto;
  }
}
.sidebar__top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.store-switcher {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px;
  border-radius: var(--radius);
  color: var(--ink);
  flex: 1;
  min-width: 0;
}
.store-switcher:hover {
  background: var(--putty-inset);
  text-decoration: none;
}
.store-switcher__mark {
  width: 28px;
  height: 28px;
  border-radius: var(--radius);
  background: var(--ink);
  color: var(--paper);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  flex: none;
}
.store-switcher__text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}
.store-switcher__name {
  font-size: var(--fs-ui);
  font-weight: 500;
}
.sidebar__toggle {
  display: none;
  border: 1px solid var(--rule-strong);
  background: var(--paper);
  border-radius: var(--radius-pill);
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  padding: 0 10px;
  border-radius: var(--radius);
  color: var(--ink-2);
  font-size: var(--fs-ui);
}
.nav-item:hover {
  background: var(--putty-inset);
  color: var(--ink);
  text-decoration: none;
}
.nav-item.is-active {
  background: var(--control);
  color: var(--ink);
}
.nav-item--sub {
  padding-left: 36px;
  height: 30px;
}
.nav-sub {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-marker {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--orange-text);
}
.nav-eyebrow {
  padding: 16px 10px 6px;
}
.sidebar__bottom {
  margin-top: auto;
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sidebar__user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: var(--radius);
  color: var(--ink);
  font-size: var(--fs-ui);
  border-top: 1px solid var(--rule);
  padding-top: 12px;
}
.sidebar__user:hover {
  text-decoration: none;
  background: var(--putty-inset);
}
.sidebar__user-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 800px) {
  .sidebar {
    flex-basis: 100%;
    border-right: 0;
    border-bottom: 1px solid var(--rule);
  }
  .sidebar__toggle {
    display: inline-flex;
  }
  .sidebar__nav {
    display: none;
  }
  .sidebar.is-open .sidebar__nav {
    display: flex;
  }
  .nav-item {
    min-height: 44px;
  }
}
</style>
