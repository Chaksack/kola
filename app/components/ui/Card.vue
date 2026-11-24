<script setup lang="ts">
withDefaults(defineProps<{ title?: string; flush?: boolean; tag?: string }>(), { tag: 'section' })
</script>

<template>
  <component :is="tag" class="ui-card" :class="{ 'ui-card--flush': flush }">
    <header v-if="title || $slots.header || $slots.actions" class="ui-card__head">
      <slot name="header">
        <h2 class="ui-card__title">{{ title }}</h2>
      </slot>
      <div v-if="$slots.actions" class="ui-card__actions"><slot name="actions" /></div>
    </header>
    <div class="ui-card__body"><slot /></div>
    <footer v-if="$slots.footer" class="ui-card__foot"><slot name="footer" /></footer>
  </component>
</template>

<style scoped>
.ui-card {
  background: var(--putty);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  min-width: 0;
}
.ui-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 16px;
  border-bottom: 1px solid var(--rule);
}
.ui-card__title {
  font-size: var(--fs-body);
  font-weight: 500;
  letter-spacing: 0;
}
.ui-card__actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.ui-card__body {
  padding: 16px;
}
.ui-card--flush .ui-card__body {
  padding: 0;
}
.ui-card__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 16px;
  border-top: 1px solid var(--rule);
}
</style>
