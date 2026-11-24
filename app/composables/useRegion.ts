export interface StoreRegion {
  id: string
  name: string
  currencyCode: string
  taxInclusive: boolean
  countries: { iso2: string; name: string }[]
  paymentProviders: string[]
}

/**
 * The shopper's region. Catalog pages are cached (ISR) for everyone, so the server always renders
 * the store's default region; the browser switches to the saved region after hydration
 * (plugins/region.client.ts) and refetches prices.
 */
export function useRegion() {
  const cookie = useCookie<string | null>('kola_region', { sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  const selectedId = useState<string | null>('region-id', () => null)
  const { data } = useStoreFetch<{ defaultRegionId: string | null; data: StoreRegion[] }>('/api/store/regions', {
    key: 'store-regions',
    default: () => ({ defaultRegionId: null, data: [] }),
  })
  const regions = computed(() => data.value?.data ?? [])
  const region = computed(() => regions.value.find((r) => r.id === selectedId.value) ?? regions.value.find((r) => r.id === data.value?.defaultRegionId) ?? regions.value[0] ?? null)
  /** Region id to send to the API: undefined means "store default" (keeps SSR output cacheable). */
  const regionQuery = computed(() => (selectedId.value && selectedId.value !== data.value?.defaultRegionId ? selectedId.value : undefined))

  function setRegion(id: string) {
    cookie.value = id
    selectedId.value = id
  }

  return { regions, region, regionQuery, setRegion, savedRegionId: cookie, selectedId }
}
