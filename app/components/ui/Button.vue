<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'dashed' | 'danger'
    size?: 'sm' | 'md'
    type?: 'button' | 'submit' | 'reset'
    to?: RouteLocationRaw
    href?: string
    loading?: boolean
    disabled?: boolean
    block?: boolean
    icon?: boolean
  }>(),
  { variant: 'secondary', size: 'md', type: 'button' },
)

const isLink = computed(() => Boolean(props.to || props.href))
const classes = computed(() => [
  'ui-btn',
  `ui-btn--${props.variant}`,
  `ui-btn--${props.size}`,
  { 'ui-btn--block': props.block, 'ui-btn--icon': props.icon, 'is-loading': props.loading },
])
</script>

<template>
  <NuxtLink v-if="isLink" :to="to ?? href" :class="classes" :aria-disabled="disabled || undefined">
    <slot />
  </NuxtLink>
  <button v-else :type="type" :class="classes" :disabled="disabled || loading" :aria-busy="loading || undefined">
    <span v-if="loading" class="ui-btn__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  font-size: var(--fs-body);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 0.12s ease, border-color 0.12s ease;
}
.ui-btn:hover {
  text-decoration: none;
}
.ui-btn--sm {
  height: 30px;
  padding: 0 12px;
  font-size: var(--fs-ui);
}
.ui-btn--primary {
  background: var(--ink);
  color: var(--paper);
}
.ui-btn--primary:hover:not(:disabled) {
  background: var(--ink-2);
}
.ui-btn--secondary {
  background: var(--paper);
  color: var(--ink);
  border-color: var(--rule-strong);
}
.ui-btn--secondary:hover:not(:disabled) {
  background: var(--putty-inset);
}
.ui-btn--ghost {
  background: transparent;
  color: var(--ink-2);
}
.ui-btn--ghost:hover:not(:disabled) {
  background: var(--putty-inset);
  color: var(--ink);
}
.ui-btn--dashed {
  background: transparent;
  color: var(--ink-2);
  border: 1px dashed var(--outline);
  font-weight: 400;
}
.ui-btn--dashed:hover:not(:disabled) {
  background: var(--putty-inset);
}
.ui-btn--danger {
  background: var(--paper);
  color: var(--danger-text);
  border-color: var(--rule-strong);
}
.ui-btn--danger:hover:not(:disabled) {
  background: var(--putty-inset);
}
.ui-btn--block {
  width: 100%;
}
.ui-btn--icon {
  width: 36px;
  padding: 0;
}
.ui-btn--icon.ui-btn--sm {
  width: 30px;
}
.ui-btn:disabled,
.ui-btn[aria-disabled='true'] {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-btn__spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 768px) {
  .ui-btn {
    min-height: 44px;
  }
  .ui-btn--icon {
    min-width: 44px;
  }
}
</style>
