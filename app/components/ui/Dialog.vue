<script setup lang="ts">
const props = defineProps<{ title: string; description?: string; width?: string }>()
const open = defineModel<boolean>('open', { default: false })
const dialogRef = ref<HTMLDialogElement | null>(null)
const titleId = useId()

watch(
  open,
  (v) => {
    const el = dialogRef.value
    if (!el) return
    if (v && !el.open) el.showModal()
    if (!v && el.open) el.close()
  },
  { flush: 'post' },
)
onMounted(() => {
  if (open.value) dialogRef.value?.showModal()
})
function onClose() {
  open.value = false
}
function onBackdrop(e: MouseEvent) {
  if (e.target === dialogRef.value) open.value = false
}
void props
</script>

<template>
  <dialog
    ref="dialogRef"
    class="ui-dialog"
    :aria-labelledby="titleId"
    :style="{ width: width ?? '480px' }"
    @close="onClose"
    @click="onBackdrop"
  >
    <div class="ui-dialog__inner">
      <header class="ui-dialog__head">
        <div>
          <h2 :id="titleId" class="ui-dialog__title">{{ title }}</h2>
          <p v-if="description" class="meta">{{ description }}</p>
        </div>
        <UiButton variant="ghost" size="sm" icon aria-label="Close dialog" @click="open = false">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </UiButton>
      </header>
      <div class="ui-dialog__body"><slot /></div>
      <footer v-if="$slots.footer" class="ui-dialog__foot"><slot name="footer" /></footer>
    </div>
  </dialog>
</template>

<style scoped>
.ui-dialog {
  max-width: calc(100vw - 32px);
  padding: 0;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--paper);
  color: var(--ink);
  box-shadow: var(--shadow-float);
}
.ui-dialog::backdrop {
  background: var(--scrim);
}
.ui-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--rule);
}
.ui-dialog__title {
  font-size: 16px;
  letter-spacing: -0.005em;
}
.ui-dialog__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ui-dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--rule);
  background: var(--putty);
}
</style>
