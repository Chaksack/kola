import { expect, test } from '@playwright/test'

/**
 * Core Web Vitals on the production build under Lighthouse-style mobile throttling
 * (4x CPU, ~1.6 Mbps / 150ms RTT). Budgets match Lighthouse's "good" thresholds.
 */
for (const path of ['/', '/products/adinkra-linen-shirt']) {
  test(`web vitals ${path} @perf`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP throttling is Chromium-only')
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    // Warm the ISR cache so we measure what visitors get.
    await page.request.get(path)

    await page.addInitScript(() => {
      const w = window as unknown as { __lcp: number; __cls: number }
      w.__lcp = 0
      w.__cls = 0
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true })
      new PerformanceObserver((l) =>
        l.getEntries().forEach((e) => {
          const s = e as PerformanceEntry & { hadRecentInput: boolean; value: number }
          if (!s.hadRecentInput) w.__cls += s.value
        }),
      ).observe({ type: 'layout-shift', buffered: true })
    })
    await page.goto(path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const m = await page.evaluate(() => {
      const w = window as unknown as { __lcp: number; __cls: number }
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      const js = performance.getEntriesByType('resource').filter((r) => (r as PerformanceResourceTiming).initiatorType === 'script' || r.name.endsWith('.js'))
      return { lcp: Math.round(w.__lcp), cls: Number(w.__cls.toFixed(3)), ttfb: Math.round(nav.responseStart), jsKb: Math.round(js.reduce((a, r) => a + ((r as PerformanceResourceTiming).transferSize || 0), 0) / 1024) }
    })
    console.log(path, m)
    expect(m.lcp).toBeLessThan(2500)
    expect(m.cls).toBeLessThan(0.1)
  })
}
