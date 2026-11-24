import { describe, expect, it } from 'vitest'
import { statusLabel, statusTone } from '#shared/utils/status'

describe('status tones follow the design spec', () => {
  it.each([
    ['captured', 'ok'],
    ['delivered', 'ok'],
    ['published', 'ok'],
    ['awaiting', 'warn'],
    ['not_fulfilled', 'warn'],
    ['proposed', 'warn'],
    ['shipped', 'info'],
    ['partially_fulfilled', 'info'],
    ['refunded', 'neutral'],
    ['returned', 'neutral'],
    ['draft', 'neutral'],
    ['something_unknown', 'neutral'],
  ])('%s → %s', (status, tone) => expect(statusTone(status)).toBe(tone))

  it('labels', () => {
    expect(statusLabel('not_fulfilled')).toBe('Not fulfilled')
    expect(statusLabel('captured')).toBe('Captured')
  })
})
