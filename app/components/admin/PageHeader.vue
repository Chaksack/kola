<script setup lang="ts">
export interface Crumb {
  label: string
  to?: string
}
defineProps<{
  title?: string
  subtitle?: string
  crumbs?: Crumb[]
  mono?: boolean
  back?: { label: string; to: string }
  search?: boolean
}>()

const router = useRouter()
const searchInput = ref<HTMLInputElement | null>(null)
const q = ref('')

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchInput.value?.focus()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

function submitSearch() {
  const term = q.value.trim()
  if (!term) return
  if (/^#?\d+$/.test(term)) router.push({ path: '/admin/orders', query: { q: term.replace('#', '') } })
  else router.push({ path: '/admin/products', query: { q: term } })
}
</script>

<template>
  <header class="page-header">
    <div class="page-header__bar">
      <nav v-if="crumbs?.length" aria-label="Breadcrumb" class="crumbs">
        <ol>
          <li v-for="(c, i) in crumbs" :key="i">
            <NuxtLink v-if="c.to" :to="c.to">{{ c.label }}</NuxtLink>
            <span v-else :aria-current="i === crumbs.length - 1 ? 'page' : undefined">{{ c.label }}</span>
          </li>
        </ol>
      </nav>
      <NuxtLink v-else-if="back" :to="back.to" class="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        {{ back.label }}
      </NuxtLink>
      <form v-if="search !== false" class="cmdk" role="search" @submit.prevent="submitSearch">
        <label for="global-search" class="sr-only">Search orders and products</label>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input id="global-search" ref="searchInput" v-model="q" type="search" placeholder="Search">
        <kbd>⌘K</kbd>
      </form>
    </div>
    <div v-if="title || $slots.title || $slots.actions" class="page-header__main">
      <div class="page-header__titles">
        <slot name="title">
          <h1 class="page-title" :class="{ mono }">{{ title }}</h1>
        </slot>
        <p v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</p>
        <slot name="meta" />
      </div>
      <div v-if="$slots.actions" class="page-header__actions"><slot name="actions" /></div>
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.crumbs ol {
  list-style: none;
  display: flex;
  gap: 6px;
  margin: 0;
  padding: 0;
  font-size: var(--fs-ui);
  color: var(--ink-3);
}
.crumbs li + li::before {
  content: '/';
  margin-right: 6px;
  color: var(--outline);
}
.crumbs a {
  color: var(--ink-3);
}
.crumbs [aria-current] {
  color: var(--ink);
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-ui);
  color: var(--ink-2);
}
.cmdk {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px 0 10px;
  min-width: 220px;
  background: var(--paper);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-pill);
  color: var(--ink-3);
}
.cmdk:focus-within {
  border-color: var(--ink-3);
}
.cmdk input {
  flex: 1;
  border: 0;
  background: transparent;
  outline: none;
  font-size: var(--fs-ui);
  color: var(--ink);
  min-width: 0;
}
.cmdk kbd {
  font-size: 11px;
  padding: 1px 5px;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--putty);
}
.page-header__main {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.page-header__titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.page-header__subtitle {
  color: var(--ink-2);
  font-size: var(--fs-body);
}
.page-header__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.mono {
  font-family: var(--font-mono);
  letter-spacing: -0.01em;
}
@media (max-width: 600px) {
  .cmdk {
    min-width: 0;
    width: 100%;
    height: 44px;
  }
}
</style>
