<script setup lang="ts">
const { toasts, dismiss } = useToast()
</script>

<template>
  <div class="ui-toasts" role="region" aria-label="Notifications" aria-live="polite">
    <TransitionGroup name="ui-toast">
      <div v-for="t in toasts" :key="t.id" class="ui-toast" :data-tone="t.tone">
        <span class="ui-toast__dot" aria-hidden="true" />
        <p class="ui-toast__msg">{{ t.message }}</p>
        <button type="button" class="ui-toast__close" aria-label="Dismiss notification" @click="dismiss(t.id)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.ui-toasts {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: calc(100vw - 32px);
}
.ui-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 260px;
  padding: 10px 12px;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  box-shadow: var(--shadow-float);
  font-size: var(--fs-ui);
}
.ui-toast__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--neutral-dot);
  flex: none;
}
[data-tone='ok'] .ui-toast__dot {
  background: var(--ok);
}
[data-tone='danger'] .ui-toast__dot {
  background: var(--danger-text);
}
[data-tone='warn'] .ui-toast__dot {
  background: var(--warn);
}
.ui-toast__msg {
  flex: 1;
}
.ui-toast__close {
  border: 0;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius);
}
.ui-toast-enter-active,
.ui-toast-leave-active {
  transition: all 0.18s ease;
}
.ui-toast-enter-from,
.ui-toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
