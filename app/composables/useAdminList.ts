import type { ListResponse } from '#shared/schemas/common'

interface Options {
  /** Query params (besides q/offset/order) to sync with the URL, e.g. ['status', 'collectionId']. */
  filters?: string[]
  limit?: number
  defaultOrder?: string
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

/**
 * Server-paginated admin list whose search, filters, sort and page live in the URL, so lists are
 * linkable and the back button works.
 */
export function useAdminList<T>(url: string, opts: Options = {}) {
  const route = useRoute()
  const router = useRouter()
  const limit = opts.limit ?? 20
  const filterKeys = opts.filters ?? []

  const state = reactive({
    q: str(route.query.q) ?? '',
    offset: Math.max(0, Number(route.query.offset ?? 0) || 0),
    order: str(route.query.order) ?? opts.defaultOrder,
    filters: Object.fromEntries(filterKeys.map((k) => [k, str(route.query[k])])) as Record<string, string | undefined>,
  })

  const query = computed(() => {
    const q: Record<string, string | number> = { limit, offset: state.offset }
    if (state.q.trim()) q.q = state.q.trim()
    if (state.order) q.order = state.order
    for (const [k, v] of Object.entries(state.filters)) if (v) q[k] = v
    return q
  })

  watch(query, (q) => {
    const { limit: _limit, offset, ...rest } = q
    const next: Record<string, string> = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v)]))
    if (Number(offset) > 0) next.offset = String(offset)
    if (rest.order === opts.defaultOrder) delete next.order
    router.replace({ query: next })
  })

  // Debounced search box
  const search = ref(state.q)
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(search, (v) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      state.q = v
      state.offset = 0
    }, 250)
  })

  function setFilter(key: string, value: string | null | undefined) {
    state.filters[key] = value || undefined
    state.offset = 0
  }
  function setOrder(value: string | null | undefined) {
    state.order = value || opts.defaultOrder
    state.offset = 0
  }
  function setOffset(offset: number) {
    state.offset = offset
  }

  const fetchResult = useFetch<ListResponse<T>>(url, {
    query,
    server: false,
    default: () => ({ data: [], count: 0, limit, offset: 0 }),
  })

  return { ...fetchResult, state, search, limit, setFilter, setOrder, setOffset }
}
