// Apply the saved region after hydration so server-rendered (cached) HTML always matches.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    const { savedRegionId, selectedId } = useRegion()
    if (savedRegionId.value && !selectedId.value) selectedId.value = savedRegionId.value
  })
})
