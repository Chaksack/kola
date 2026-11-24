<script setup lang="ts">
import { ShoppingBag, User, Menu, X } from '@lucide/vue'

const cartStore = useCartStore()
const { session } = useUserSession()
const route = useRoute()
const menuOpen = ref(false)
watch(() => route.fullPath, () => (menuOpen.value = false))
const nav = [
  { to: '/shop', label: 'Shop' },
  { to: '/collections', label: 'Collections' },
  { to: '/about', label: 'About' },
]
const isActive = (to: string) => route.path === to || route.path.startsWith(`${to}/`)
</script>

<template>
  <header class="site-header">
    <div class="site-header__inner">
      <NuxtLink to="/" class="wordmark" aria-label="Kola Market home">Kola Market</NuxtLink>
      <nav class="site-nav" aria-label="Main">
        <NuxtLink v-for="n in nav" :key="n.to" :to="n.to" class="site-nav__link" :class="{ 'is-active': isActive(n.to) }">{{ n.label }}</NuxtLink>
      </nav>
      <div class="site-header__actions">
        <StoreRegionSelect class="hide-sm" />
        <NuxtLink :to="session?.customer ? '/account' : '/account/login'" class="icon-link hide-sm" :aria-label="session?.customer ? 'Your account' : 'Sign in'">
          <User :size="18" :stroke-width="1.8" aria-hidden="true" />
        </NuxtLink>
        <button type="button" class="cart-btn" :aria-label="`Cart, ${cartStore.count} items`" @click="cartStore.drawerOpen = true">
          <ShoppingBag :size="18" :stroke-width="1.8" aria-hidden="true" />
          <span class="num">{{ cartStore.count }}</span>
        </button>
        <button type="button" class="icon-link show-sm" :aria-expanded="menuOpen" aria-controls="mobile-menu" :aria-label="menuOpen ? 'Close menu' : 'Open menu'" @click="menuOpen = !menuOpen">
          <X v-if="menuOpen" :size="20" :stroke-width="1.8" aria-hidden="true" />
          <Menu v-else :size="20" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div v-if="menuOpen" id="mobile-menu" class="mobile-menu">
      <NuxtLink v-for="n in nav" :key="n.to" :to="n.to" class="mobile-menu__link">{{ n.label }}</NuxtLink>
      <NuxtLink :to="session?.customer ? '/account' : '/account/login'" class="mobile-menu__link">{{ session?.customer ? 'Account' : 'Sign in' }}</NuxtLink>
      <StoreRegionSelect />
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--paper);
  border-bottom: 1px solid var(--rule);
}
.site-header__inner {
  max-width: 1280px;
  margin: 0 auto;
  height: 60px;
  padding: 0 clamp(16px, 3vw, 40px);
  display: flex;
  align-items: center;
  gap: 32px;
}
.wordmark {
  font-size: 18px;
  letter-spacing: -0.02em;
  color: var(--ink);
  text-decoration: none;
}
.site-nav {
  display: flex;
  gap: 4px;
}
.site-nav__link {
  padding: 6px 10px;
  border-radius: var(--radius);
  color: var(--ink-2);
  font-size: var(--fs-body);
  text-decoration: none;
}
.site-nav__link:hover,
.site-nav__link.is-active {
  color: var(--ink);
  background: var(--putty-inset);
}
.site-header__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.icon-link {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: var(--ink);
  background: none;
  border: 0;
  cursor: pointer;
}
.icon-link:hover {
  background: var(--putty-inset);
}
.cart-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--rule-strong);
  background: var(--paper);
  color: var(--ink);
  font-size: var(--fs-ui);
  cursor: pointer;
}
.cart-btn:hover {
  background: var(--putty-inset);
}
.show-sm {
  display: none;
}
.mobile-menu {
  display: flex;
  flex-direction: column;
  padding: 8px clamp(16px, 3vw, 40px) 16px;
  border-top: 1px solid var(--rule);
  gap: 4px;
}
.mobile-menu__link {
  min-height: 44px;
  display: flex;
  align-items: center;
  color: var(--ink);
  border-bottom: 1px solid var(--rule);
}
@media (max-width: 767px) {
  .site-nav,
  .hide-sm {
    display: none;
  }
  .show-sm {
    display: inline-grid;
  }
  .cart-btn {
    height: 44px;
  }
  .icon-link {
    width: 44px;
    height: 44px;
  }
}
</style>
