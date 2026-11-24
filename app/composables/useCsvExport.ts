/** Fetch a chunked CSV export page by page, then download it as one file. */
export function useCsvExport() {
  const toast = useToast()
  const progress = ref<{ done: number; total: number } | null>(null)

  async function run(endpoint: string, filename: string, pageSize = 500) {
    const parts: string[] = []
    let offset: number | null = 0
    progress.value = { done: 0, total: 0 }
    try {
      while (offset !== null) {
        const res: { csv: string; nextOffset: number | null; total: number } = await api(endpoint, { query: { offset, limit: pageSize } })
        parts.push(res.csv)
        progress.value = { done: res.nextOffset ?? res.total, total: res.total }
        offset = res.nextOffset
      }
      const blob = new Blob(['﻿', ...parts], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success(`Exported ${progress.value.total} rows`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Export failed'))
    } finally {
      progress.value = null
    }
  }
  return { run, progress }
}
