<script setup lang="ts">
const route = useRoute()
const groups = [
  {
    label: 'General',
    items: [
      { to: '/admin/settings/store', label: 'Store' },
      { to: '/admin/settings/regions', label: 'Regions' },
      { to: '/admin/settings/sales-channels', label: 'Sales channels' },
      { to: '/admin/settings/locations', label: 'Locations & shipping' },
      { to: '/admin/settings/tax-regions', label: 'Tax regions' },
      { to: '/admin/settings/return-reasons', label: 'Return reasons' },
      { to: '/admin/settings/product-types', label: 'Product types & tags' },
    ],
  },
  {
    label: 'Developer',
    items: [
      { to: '/admin/settings/publishable-keys', label: 'Publishable API keys' },
      { to: '/admin/settings/secret-keys', label: 'Secret API keys' },
      { to: '/admin/settings/webhooks', label: 'Webhooks' },
      { to: '/admin/settings/workflows', label: 'Workflows' },
    ],
  },
  {
    label: 'Team',
    items: [
      { to: '/admin/settings/users', label: 'Users & roles' },
      { to: '/admin/settings/profile', label: 'Profile' },
    ],
  },
]
const isActive = (to: string) => route.path === to || route.path.startsWith(`${to}/`)
</script>

<template>
  <div class="admin-shell">
    <aside class="settings-side">
      <NuxtLink to="/admin/orders" class="back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        Back to store
      </NuxtLink>
      <nav aria-label="Settings">
        <div v-for="g in groups" :key="g.label" class="group">
          <p class="eyebrow group__label">{{ g.label }}</p>
          <ul>
            <li v-for="i in g.items" :key="i.to">
              <NuxtLink :to="i.to" class="nav-item" :class="{ 'is-active': isActive(i.to) }">{{ i.label }}</NuxtLink>
            </li>
          </ul>
        </div>
      </nav>
    </aside>
    <main id="admin-main" class="admin-content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.admin-shell {
  display: flex;
  flex-wrap: wrap;
  min-height: 100vh;
}
.settings-side {
  flex: 1 1 232px;
  max-width: 260px;
  border-right: 1px solid var(--rule);
  background: var(--putty);
  padding: 16px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  color: var(--ink-2);
  font-size: var(--fs-ui);
}
.group__label {
  padding: 14px 10px 6px;
}
ul {
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
.admin-content {
  flex: 999 1 560px;
  min-width: 0;
  padding: 20px clamp(16px, 3vw, 40px) 48px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
@media (max-width: 800px) {
  .settings-side {
    max-width: none;
    flex-basis: 100%;
    border-right: 0;
    border-bottom: 1px solid var(--rule);
  }
  .nav-item {
    min-height: 44px;
  }
}
</style>
