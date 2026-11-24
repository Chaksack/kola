<script setup lang="ts" generic="T extends Record<string, unknown>">
export interface TableColumn {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  width?: string
  mono?: boolean
}

defineProps<{
  columns: TableColumn[]
  rows: T[]
  rowKey?: string
  loading?: boolean
  caption?: string
  clickable?: boolean
}>()
const emit = defineEmits<{ rowClick: [row: T] }>()
</script>

<template>
  <div class="ui-table-wrap">
    <table class="ui-table">
      <caption v-if="caption" class="sr-only">{{ caption }}</caption>
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            scope="col"
            :style="{ textAlign: col.align ?? 'left', width: col.width }"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td :colspan="columns.length" class="ui-table__state">Loading…</td>
        </tr>
        <tr v-else-if="!rows.length">
          <td :colspan="columns.length" class="ui-table__state">
            <slot name="empty">Nothing here yet.</slot>
          </td>
        </tr>
        <tr
          v-for="(row, i) in rows"
          v-else
          :key="String(rowKey ? row[rowKey] : i)"
          :class="{ 'is-clickable': clickable }"
          @click="clickable && emit('rowClick', row)"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            :class="{ mono: col.mono, num: col.align === 'right' }"
            :style="{ textAlign: col.align ?? 'left' }"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
              {{ row[col.key] ?? '—' }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.ui-table-wrap {
  width: 100%;
  overflow-x: auto;
}
.ui-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-ui);
}
.ui-table th {
  font-size: var(--fs-meta);
  font-weight: 500;
  color: var(--ink-3);
  padding: 9px 16px;
  border-bottom: 1px solid var(--rule);
  white-space: nowrap;
}
.ui-table td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--rule);
  vertical-align: middle;
  white-space: nowrap;
}
.ui-table tbody tr:last-child td {
  border-bottom: 0;
}
.ui-table tbody tr:hover td {
  background: var(--putty-inset);
}
.ui-table tr.is-clickable {
  cursor: pointer;
}
.ui-table__state {
  text-align: center !important;
  color: var(--ink-3);
  padding: 32px 16px !important;
}
.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}
</style>
