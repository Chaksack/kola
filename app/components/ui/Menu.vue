<script setup lang="ts">
export interface MenuItem {
  label: string
  value: string
  danger?: boolean
  disabled?: boolean
}
defineProps<{ items: MenuItem[]; label?: string; align?: 'left' | 'right' }>()
const emit = defineEmits<{ select: [value: string] }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const menuId = useId()

function choose(item: MenuItem) {
  if (item.disabled) return
  open.value = false
  emit('select', item.value)
}
function onDoc(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('click', onDoc)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDoc)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="ui-menu">
    <slot name="trigger" :open="open" :toggle="() => (open = !open)">
      <UiButton
        variant="secondary"
        icon
        :aria-label="label ?? 'More actions'"
        :aria-expanded="open"
        :aria-controls="menuId"
        aria-haspopup="menu"
        @click="open = !open"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
      </UiButton>
    </slot>
    <ul v-if="open" :id="menuId" class="ui-menu__list" role="menu" :data-align="align ?? 'right'">
      <li v-for="item in items" :key="item.value" role="none">
        <button
          type="button"
          role="menuitem"
          class="ui-menu__item"
          :class="{ 'is-danger': item.danger }"
          :disabled="item.disabled"
          @click="choose(item)"
        >
          {{ item.label }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ui-menu {
  position: relative;
  display: inline-flex;
}
.ui-menu__list {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  min-width: 180px;
  list-style: none;
  margin: 0;
  padding: 4px;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  box-shadow: var(--shadow-float);
}
.ui-menu__list[data-align='left'] {
  right: auto;
  left: 0;
}
.ui-menu__item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  border-radius: var(--radius);
  font-size: var(--fs-ui);
  color: var(--ink);
  cursor: pointer;
}
.ui-menu__item:hover:not(:disabled) {
  background: var(--putty-inset);
}
.ui-menu__item:disabled {
  color: var(--ink-3);
  cursor: not-allowed;
}
.ui-menu__item.is-danger {
  color: var(--danger-text);
}
</style>
