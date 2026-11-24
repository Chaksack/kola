<script setup lang="ts">
import { formatMoney } from '#shared/utils/money'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Analytics · Kola' })

interface Analytics {
  currencyCode: string
  days: number
  series: { day: string; sales: number; orders: number }[]
  topProducts: { productId: string | null; title: string; units: number; revenue: number }[]
  channels: { name: string; orders: number; sales: number }[]
}
const days = ref('30')
const { data } = await useFetch<Analytics>('/api/admin/stats/analytics', { server: false, query: computed(() => ({ days: days.value })) })
const totals = computed(() => {
  const s = data.value?.series ?? []
  const sales = s.reduce((a, x) => a + x.sales, 0)
  const orders = s.reduce((a, x) => a + x.orders, 0)
  return { sales, orders, aov: orders ? Math.round(sales / orders) : 0, best: s.reduce((b, x) => (x.sales > (b?.sales ?? -1) ? x : b), s[0]) }
})
const m = (n: number) => formatMoney(n, data.value?.currencyCode ?? 'GHS')
const channelMax = computed(() => Math.max(1, ...(data.value?.channels ?? []).map((c) => c.sales)))
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Extensions' }, { label: 'Analytics' }]" title="Analytics" :subtitle="`Net sales in ${data?.currencyCode ?? 'the default currency'}, after refunds, excluding canceled orders.`">
      <template #actions>
        <UiSelect v-model="days" label="Period" hide-label pill :options="[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]" />
      </template>
    </AdminPageHeader>
    <template v-if="data">
      <UiKpiStrip
        :items="[
          { label: 'Net sales', value: m(totals.sales) },
          { label: 'Orders', value: String(totals.orders) },
          { label: 'Average order value', value: m(totals.aov) },
          { label: 'Best day', value: totals.best && totals.best.sales ? m(totals.best.sales) : '—', delta: totals.best && totals.best.sales ? new Date(`${totals.best.day}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : undefined, tone: 'muted' },
        ]"
      />
      <UiCard :title="`Daily net sales · last ${data.days} days`">
        <AdminSalesChart :series="data.series" :currency-code="data.currencyCode" />
      </UiCard>
      <div class="cards-2">
        <UiCard flush title="Top products">
          <table class="rank">
            <caption class="sr-only">Top products by revenue</caption>
            <thead><tr><th scope="col">Product</th><th scope="col" class="num">Units</th><th scope="col" class="num">Revenue</th></tr></thead>
            <tbody>
              <tr v-for="p in data.topProducts" :key="p.title">
                <td><NuxtLink v-if="p.productId" :to="`/admin/products/${p.productId}`" style="color: var(--ink)">{{ p.title }}</NuxtLink><span v-else>{{ p.title }}</span></td>
                <td class="num">{{ p.units }}</td>
                <td class="num">{{ m(p.revenue) }}</td>
              </tr>
              <tr v-if="!data.topProducts.length"><td colspan="3" class="meta">No sales in this period.</td></tr>
            </tbody>
          </table>
        </UiCard>
        <UiCard flush title="Sales by channel">
          <table class="rank">
            <caption class="sr-only">Sales by channel</caption>
            <thead><tr><th scope="col">Channel</th><th scope="col" class="num">Orders</th><th scope="col" class="num">Sales</th></tr></thead>
            <tbody>
              <tr v-for="c in data.channels" :key="c.name">
                <td>
                  {{ c.name }}
                  <span class="meter" aria-hidden="true"><span :style="{ width: `${(c.sales / channelMax) * 100}%` }" /></span>
                </td>
                <td class="num">{{ c.orders }}</td>
                <td class="num">{{ m(c.sales) }}</td>
              </tr>
            </tbody>
          </table>
        </UiCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cards-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  align-items: start;
}
.rank {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-ui);
}
.rank th,
.rank td {
  padding: 9px 16px;
  border-bottom: 1px solid var(--rule);
  text-align: left;
}
.rank th {
  font-size: var(--fs-meta);
  color: var(--ink-3);
  font-weight: 500;
}
.rank .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.rank tbody tr:last-child td {
  border-bottom: 0;
}
.meter {
  display: block;
  height: 4px;
  margin-top: 6px;
  background: var(--putty-inset);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.meter span {
  display: block;
  height: 100%;
  background: var(--ink-2);
  opacity: 0.55;
}
</style>
