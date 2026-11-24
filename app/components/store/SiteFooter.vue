<script setup lang="ts">
const { region } = useRegion()
const year = new Date().getFullYear()
const columns = [
  { title: 'Shop', links: [{ to: '/shop', label: 'All products' }, { to: '/collections/harmattan-edit', label: 'Harmattan Edit' }, { to: '/collections/home-and-table', label: 'Home & Table' }, { to: '/collections/pantry', label: 'Pantry' }] },
  { title: 'Categories', links: [{ to: '/categories/apparel', label: 'Apparel' }, { to: '/categories/home', label: 'Home' }, { to: '/categories/beauty', label: 'Beauty' }, { to: '/categories/accessories', label: 'Accessories' }] },
  { title: 'Help', links: [{ to: '/account', label: 'Your account' }, { to: '/order/lookup', label: 'Find an order' }, { to: '/about#delivery', label: 'Delivery' }, { to: '/about#returns', label: 'Returns' }] },
  { title: 'Company', links: [{ to: '/about', label: 'About us' }, { to: '/about#makers', label: 'Our makers' }, { to: '/about#contact', label: 'Contact' }] },
]
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__inner">
      <div class="footer-brand">
        <p class="wordmark">Kola Market</p>
        <p class="muted">Goods made in Ghana, from Bonwire looms to Bolga weavers. Shipped from Tema.</p>
      </div>
      <nav v-for="c in columns" :key="c.title" class="footer-col" :aria-label="c.title">
        <p class="eyebrow">{{ c.title }}</p>
        <ul>
          <li v-for="l in c.links" :key="l.to"><NuxtLink :to="l.to">{{ l.label }}</NuxtLink></li>
        </ul>
      </nav>
    </div>
    <div class="utility">
      <span>© {{ year }} Kola Market</span>
      <span v-if="region" class="mono">{{ region.name }} · {{ region.currencyCode }}</span>
      <span class="spacer" />
      <NuxtLink to="/about#terms">Terms</NuxtLink>
      <NuxtLink to="/about#privacy">Privacy</NuxtLink>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  background: var(--putty);
  border-top: 1px solid var(--rule);
  margin-top: var(--section-gap);
}
.site-footer__inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 48px clamp(16px, 3vw, 40px) 32px;
  display: grid;
  grid-template-columns: 2fr repeat(4, 1fr);
  gap: 32px;
}
.footer-brand {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 320px;
}
.wordmark {
  font-size: 18px;
  letter-spacing: -0.02em;
}
.footer-col ul {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.footer-col a {
  color: var(--ink-2);
  font-size: var(--fs-ui);
}
.footer-col a:hover {
  color: var(--ink);
}
.utility {
  max-width: 1280px;
  margin: 0 auto;
  padding: 14px clamp(16px, 3vw, 40px);
  border-top: 1px solid var(--rule);
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: var(--fs-meta);
  color: var(--ink-3);
}
.utility a {
  color: var(--ink-3);
}
@media (max-width: 900px) {
  .site-footer__inner {
    grid-template-columns: repeat(2, 1fr);
  }
  .footer-brand {
    grid-column: 1 / -1;
  }
}
</style>
