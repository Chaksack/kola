<script setup lang="ts">
defineProps<{ title: string; side?: 'right' | 'left' }>()
const open = defineModel<boolean>('open', { default: false })
const titleId = useId()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="ui-drawer">
      <div v-if="open" class="ui-drawer-root" :data-side="side ?? 'right'">
        <div class="ui-drawer__scrim" aria-hidden="true" @click="open = false" />
        <aside class="ui-drawer" role="dialog" aria-modal="true" :aria-labelledby="titleId">
          <header class="ui-drawer__head">
            <h2 :id="titleId" class="ui-drawer__title">{{ title }}</h2>
            <UiButton variant="ghost" size="sm" icon aria-label="Close" @click="open = false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </UiButton>
          </header>
          <div class="ui-drawer__body"><slot /></div>
          <footer v-if="$slots.footer" class="ui-drawer__foot"><slot name="footer" /></footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-drawer-root {
  position: fixed;
  inset: 0;
  z-index: 50;
}
.ui-drawer__scrim {
  position: absolute;
  inset: 0;
  background: var(--scrim);
}
.ui-drawer {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: min(420px, 100vw);
  background: var(--paper);
  box-shadow: var(--shadow-float);
  display: flex;
  flex-direction: column;
}
[data-side='left'] .ui-drawer {
  right: auto;
  left: 0;
}
.ui-drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--rule);
}
.ui-drawer__title {
  font-size: 16px;
}
.ui-drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.ui-drawer__foot {
  padding: 16px;
  border-top: 1px solid var(--rule);
  background: var(--putty);
}
.ui-drawer-enter-active,
.ui-drawer-leave-active {
  transition: opacity 0.18s ease;
}
.ui-drawer-enter-active .ui-drawer,
.ui-drawer-leave-active .ui-drawer {
  transition: transform 0.18s ease;
}
.ui-drawer-enter-from,
.ui-drawer-leave-to {
  opacity: 0;
}
.ui-drawer-enter-from .ui-drawer,
.ui-drawer-leave-to .ui-drawer {
  transform: translateX(100%);
}
[data-side='left'].ui-drawer-enter-from .ui-drawer,
[data-side='left'].ui-drawer-leave-to .ui-drawer {
  transform: translateX(-100%);
}
</style>
