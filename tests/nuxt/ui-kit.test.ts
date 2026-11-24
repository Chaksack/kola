import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StatusBadge from '~/components/ui/StatusBadge.vue'
import Button from '~/components/ui/Button.vue'
import Money from '~/components/ui/Money.vue'

describe('ui kit', () => {
  it('StatusBadge renders the tone dot and label', async () => {
    const w = await mountSuspended(StatusBadge, { props: { status: 'not_fulfilled' } })
    expect(w.text()).toContain('Not fulfilled')
    expect(w.html()).toContain('warn')
  })
  it('Button renders a real <button> with type', async () => {
    const w = await mountSuspended(Button, { props: { variant: 'primary', type: 'submit' }, slots: { default: () => 'Save' } })
    const btn = w.find('button')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('type')).toBe('submit')
    expect(w.classes()).toContain('ui-btn--primary')
  })
  it('Money formats minor units', async () => {
    const w = await mountSuspended(Money, { props: { amount: 125000, currency: 'GHS' } })
    expect(w.text()).toMatch(/1,250\.00/)
  })
})
