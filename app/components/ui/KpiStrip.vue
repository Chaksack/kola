<script setup lang="ts">
export interface Kpi {
  label: string
  value: string
  delta?: string
  tone?: 'ok' | 'warn' | 'muted'
}
defineProps<{ items: Kpi[] }>()
</script>

<template>
  <dl class="ui-kpis">
    <div v-for="k in items" :key="k.label" class="ui-kpi">
      <dt class="meta">{{ k.label }}</dt>
      <dd class="ui-kpi__value num">{{ k.value }}</dd>
      <dd v-if="k.delta" class="ui-kpi__delta" :class="k.tone === 'ok' ? 'text-ok' : k.tone === 'warn' ? 'text-warn' : 'muted'">
        {{ k.delta }}
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.ui-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1px;
  margin: 0;
  background: var(--rule);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  overflow: hidden;
}
.ui-kpi {
  min-width: 0;
  background: var(--putty);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ui-kpi dd {
  margin: 0;
}
.ui-kpi__value {
  /* Scales down in narrow cells so long currency values never clip */
  font-size: clamp(18px, 2.2vw + 10px, 24px);
  overflow-wrap: anywhere;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.ui-kpi__delta {
  font-size: var(--fs-meta);
}
</style>
