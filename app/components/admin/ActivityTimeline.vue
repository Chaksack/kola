<script setup lang="ts">
export interface TimelineEvent {
  id: string
  type: string
  message: string
  tone: 'ok' | 'warn' | 'info' | 'neutral'
  actorName: string | null
  createdAt: string | Date
}
defineProps<{ events: TimelineEvent[] }>()
const fmt = (d: string | Date) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <ol class="timeline">
    <li v-for="e in events" :key="e.id" class="timeline__item" :class="{ 'is-note': e.type === 'note' }">
      <span class="timeline__dot" :data-tone="e.tone" aria-hidden="true" />
      <div class="timeline__body">
        <p class="timeline__msg">{{ e.message }}</p>
        <p class="meta">
          <time :datetime="new Date(e.createdAt).toISOString()">{{ fmt(e.createdAt) }}</time>
          <template v-if="e.actorName"> · {{ e.actorName }}</template>
        </p>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  position: relative;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 8px;
  bottom: 8px;
  width: 1px;
  background: var(--rule);
}
.timeline__item {
  position: relative;
  display: flex;
  gap: 14px;
  padding: 8px 0;
}
.timeline__dot {
  position: relative;
  flex: none;
  width: 7px;
  height: 7px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--neutral-dot);
  box-shadow: 0 0 0 3px var(--putty);
}
.timeline__dot[data-tone='ok'] {
  background: var(--ok);
}
.timeline__dot[data-tone='warn'] {
  background: var(--warn);
}
.timeline__dot[data-tone='info'] {
  background: var(--info);
}
.timeline__msg {
  font-size: var(--fs-ui);
}
.is-note .timeline__msg {
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 8px 10px;
}
</style>
