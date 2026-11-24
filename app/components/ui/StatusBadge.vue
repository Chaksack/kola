<script setup lang="ts">
import { statusTone, statusLabel } from '#shared/utils/status'

const props = defineProps<{ status: string; label?: string }>()
const tone = computed(() => statusTone(props.status))
</script>

<template>
  <span class="ui-status" :data-tone="tone">
    <span class="ui-status__dot" aria-hidden="true" />
    {{ label ?? statusLabel(status) }}
  </span>
</template>

<style scoped>
.ui-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 7px;
  background: var(--putty-inset);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  font-size: var(--fs-meta);
  color: var(--ink);
  white-space: nowrap;
}
.ui-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--neutral-dot);
  flex: none;
}
[data-tone='ok'] .ui-status__dot {
  background: var(--ok);
}
[data-tone='warn'] .ui-status__dot {
  background: var(--warn);
}
[data-tone='info'] .ui-status__dot {
  background: var(--info);
}
[data-tone='danger'] .ui-status__dot {
  background: var(--danger-text);
}
</style>
