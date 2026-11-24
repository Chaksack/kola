<script setup lang="ts">
import { parseCsvObjects, stringifyCsv } from '#shared/utils/csv'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Import products · Kola' })

interface Result {
  handle: string
  action: 'created' | 'updated' | 'skipped' | 'error'
  message?: string
}

const toast = useToast()
const exporter = useCsvExport()
const groups = ref<Record<string, string>[][]>([])
const fileName = ref('')
const results = ref<Result[]>([])
const running = ref(false)
const progress = ref(0)
const parseError = ref('')
const CHUNK = 25

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  results.value = []
  parseError.value = ''
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    parseError.value = 'Files up to 5MB. Split larger catalogs into several files.'
    return
  }
  fileName.value = file.name
  const rows = parseCsvObjects(await file.text())
  if (!rows.length || !('handle' in rows[0]!)) {
    parseError.value = 'The first row must be a header with at least a "handle" column. Download the template to see the format.'
    return
  }
  // Group variant rows by product handle, keeping file order.
  const byHandle = new Map<string, Record<string, string>[]>()
  for (const r of rows) {
    const key = r.handle?.toLowerCase() ?? ''
    if (!byHandle.has(key)) byHandle.set(key, [])
    byHandle.get(key)!.push(r)
  }
  groups.value = [...byHandle.values()]
}

async function run(dryRun: boolean) {
  running.value = true
  results.value = []
  progress.value = 0
  try {
    for (let i = 0; i < groups.value.length; i += CHUNK) {
      const res = await $fetch<{ results: Result[] }>('/api/admin/imports/products', { method: 'POST', body: { products: groups.value.slice(i, i + CHUNK), dryRun } })
      results.value.push(...res.results)
      progress.value = Math.min(groups.value.length, i + CHUNK)
    }
    const errors = results.value.filter((r) => r.action === 'error').length
    if (dryRun) toast.info(errors ? `${errors} product(s) have problems` : 'Everything looks good')
    else toast.success(`Imported ${results.value.length - errors} product(s)${errors ? `, ${errors} failed` : ''}`)
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Import failed'))
  } finally {
    running.value = false
  }
}

function downloadTemplate() {
  const csv = stringifyCsv([
    ['handle', 'title', 'subtitle', 'description', 'status', 'collection', 'type', 'tags', 'option1_name', 'option1_value', 'option2_name', 'option2_value', 'sku', 'manage_inventory', 'price_ghs', 'price_usd', 'stock'],
    ['kente-scarf', 'Kente Scarf', 'Handwoven', 'A narrow strip scarf.', 'draft', 'harmattan-edit', 'Accessories', 'kente, handmade', 'Colour', 'Gold', '', '', 'KS-GOLD', 'true', '180.00', '16.00', '12'],
    ['kente-scarf', '', '', '', '', '', '', '', 'Colour', 'Green', '', '', 'KS-GREEN', 'true', '180.00', '16.00', '8'],
  ])
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = 'kola-products-template.csv'
  a.click()
}
const counts = computed(() => ({ created: results.value.filter((r) => r.action === 'created').length, updated: results.value.filter((r) => r.action === 'updated').length, errors: results.value.filter((r) => r.action === 'error').length }))
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :back="{ label: 'Products', to: '/admin/products' }" title="Import products" subtitle="One row per variant; rows with the same handle form one product. Existing products (by handle) are updated and variants are matched by SKU." :search="false">
      <template #actions>
        <UiButton :loading="Boolean(exporter.progress.value)" @click="exporter.run('/api/admin/exports/products', 'kola-products.csv', 200)">Export current catalog</UiButton>
        <UiButton @click="downloadTemplate">Download template</UiButton>
      </template>
    </AdminPageHeader>

    <UiCard title="1 · Choose a file">
      <div class="stack" style="--stack-gap: 10px">
        <label class="file">
          <input type="file" accept=".csv,text/csv" @change="onFile">
          <span class="meta">CSV up to 5MB. Prices in major units (e.g. 120.00), one column per currency: price_ghs, price_usd…</span>
        </label>
        <p v-if="parseError" class="text-danger" role="alert">{{ parseError }}</p>
        <p v-else-if="groups.length" class="ink-2">{{ fileName }} · {{ groups.length }} products · {{ groups.reduce((a, g) => a + g.length, 0) }} variants</p>
      </div>
    </UiCard>

    <UiCard v-if="groups.length" title="2 · Check, then import">
      <div class="stack" style="--stack-gap: 12px">
        <div class="row">
          <UiButton :disabled="running" @click="run(true)">Validate</UiButton>
          <UiButton variant="primary" :loading="running" @click="run(false)">Import {{ groups.length }} products</UiButton>
          <span v-if="running" class="meta num">{{ progress }} / {{ groups.length }}</span>
        </div>
        <div v-if="running" class="bar" role="progressbar" :aria-valuenow="progress" :aria-valuemax="groups.length"><span :style="{ width: `${(progress / groups.length) * 100}%` }" /></div>
      </div>
    </UiCard>

    <UiCard v-if="results.length" flush :title="`Results · ${counts.created} new, ${counts.updated} updated, ${counts.errors} errors`">
      <table class="results">
        <caption class="sr-only">Import results</caption>
        <tbody>
          <tr v-for="r in results" :key="r.handle">
            <td class="mono">{{ r.handle }}</td>
            <td><UiStatusBadge :status="r.action === 'error' ? 'failed' : r.action === 'created' ? 'published' : 'shipped'" :label="r.action" /></td>
            <td :class="r.action === 'error' ? 'text-danger' : 'meta'">{{ r.message }}</td>
          </tr>
        </tbody>
      </table>
    </UiCard>
  </div>
</template>

<style scoped>
.file {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bar {
  height: 4px;
  background: var(--putty-inset);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--ink);
  transition: width 0.2s;
}
.results {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-ui);
}
.results td {
  padding: 8px 16px;
  border-bottom: 1px solid var(--rule);
}
</style>
