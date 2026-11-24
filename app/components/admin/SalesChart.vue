<script setup lang="ts">
import { formatMoney } from '#shared/utils/money'

/**
 * Daily sales bars. One series, so no legend: the card title names it. Single muted ink hue,
 * rounded data-ends on the baseline, 2px surface gaps, recessive grid, hover tooltip, and a table
 * view for screen readers and anyone who prefers numbers.
 */
const props = defineProps<{ series: { day: string; sales: number; orders: number }[]; currencyCode: string }>()

const W = 720
const H = 220
const PAD = { top: 12, right: 8, bottom: 26, left: 56 }
const max = computed(() => Math.max(1, ...props.series.map((s) => s.sales)))
/** Round the axis top to a tidy number. */
const top = computed(() => {
  const m = max.value
  const step = 10 ** Math.floor(Math.log10(m))
  return Math.ceil(m / step) * step
})
const ticks = computed(() => [0, 0.5, 1].map((f) => Math.round(top.value * f)))
const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom
const slot = computed(() => plotW / Math.max(1, props.series.length))
const barW = computed(() => Math.max(2, slot.value - 2))
const y = (v: number) => PAD.top + plotH - (v / top.value) * plotH
const short = (n: number) => {
  const major = n / 100
  return major >= 1000 ? `${Math.round(major / 100) / 10}k` : String(Math.round(major))
}
const label = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

const hover = ref<number | null>(null)
const showTable = ref(false)
const active = computed(() => (hover.value === null ? null : props.series[hover.value]))
/** Bar path with 4px rounded top corners and a square base on the baseline. */
function bar(i: number, v: number) {
  const x = PAD.left + i * slot.value + 1
  const h = Math.max(v > 0 ? 2 : 0, PAD.top + plotH - y(v))
  const r = Math.min(4, barW.value / 2, h)
  const yt = PAD.top + plotH - h
  const yb = PAD.top + plotH
  return `M${x},${yb} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + barW.value - r} Q${x + barW.value},${yt} ${x + barW.value},${yt + r} V${yb} Z`
}
</script>

<template>
  <div class="chart">
    <div class="chart__plot" @mouseleave="hover = null">
      <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="`Daily sales over ${series.length} days`">
        <g class="grid">
          <g v-for="tk in ticks" :key="tk">
            <line :x1="PAD.left" :x2="W - PAD.right" :y1="y(tk)" :y2="y(tk)" />
            <text :x="PAD.left - 8" :y="y(tk) + 4" text-anchor="end">{{ short(tk) }}</text>
          </g>
        </g>
        <g>
          <path v-for="(s, i) in series" :key="s.day" :d="bar(i, s.sales)" class="bar" :class="{ 'is-active': hover === i }" />
        </g>
        <g class="axis">
          <text v-for="i in [0, Math.floor(series.length / 2), series.length - 1]" :key="i" :x="PAD.left + i * slot + slot / 2" :y="H - 6" text-anchor="middle">{{ series[i] ? label(series[i]!.day) : '' }}</text>
        </g>
        <!-- Hit targets wider than the bars -->
        <rect v-for="(s, i) in series" :key="`hit-${s.day}`" :x="PAD.left + i * slot" :y="PAD.top" :width="slot" :height="plotH" fill="transparent" @mouseenter="hover = i" />
      </svg>
      <div v-if="active && hover !== null" class="tooltip" :style="{ left: `${((PAD.left + hover * slot + slot / 2) / W) * 100}%` }" role="status">
        <span class="meta">{{ label(active.day) }}</span>
        <span class="num">{{ formatMoney(active.sales, currencyCode) }}</span>
        <span class="meta num">{{ active.orders }} order{{ active.orders === 1 ? '' : 's' }}</span>
      </div>
    </div>
    <button type="button" class="table-toggle" :aria-expanded="showTable" @click="showTable = !showTable">{{ showTable ? 'Hide' : 'Show' }} data table</button>
    <table v-if="showTable" class="data">
      <caption class="sr-only">Daily sales</caption>
      <thead><tr><th scope="col">Day</th><th scope="col" class="num">Orders</th><th scope="col" class="num">Sales</th></tr></thead>
      <tbody>
        <tr v-for="s in series" :key="s.day"><td>{{ label(s.day) }}</td><td class="num">{{ s.orders }}</td><td class="num">{{ formatMoney(s.sales, currencyCode) }}</td></tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.chart__plot {
  position: relative;
}
svg {
  width: 100%;
  height: auto;
  display: block;
}
.grid line {
  stroke: var(--rule);
  stroke-width: 1;
}
.grid text,
.axis text {
  fill: var(--ink-3);
  font-size: 11px;
  font-family: var(--font-sans);
}
.bar {
  fill: var(--ink-2);
  opacity: 0.55;
}
.bar.is-active {
  opacity: 1;
}
.tooltip {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 10px;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  box-shadow: var(--shadow-float);
  pointer-events: none;
  white-space: nowrap;
  font-size: var(--fs-ui);
}
.table-toggle {
  margin-top: 8px;
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: var(--fs-meta);
  color: var(--orange-text);
  cursor: pointer;
}
.data {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-ui);
  margin-top: 8px;
}
.data th,
.data td {
  padding: 6px 0;
  border-bottom: 1px solid var(--rule);
  text-align: left;
}
.data .num {
  text-align: right;
}
</style>
