import { describe, expect, it } from 'vitest'
import { ID_PREFIX, newId } from '#shared/utils/id'

describe('newId', () => {
  it('prefixes a 26-char ULID', () => {
    expect(newId(ID_PREFIX.product)).toMatch(/^prod_[0-9A-HJKMNP-TV-Z]{26}$/)
  })
  it('is unique and sortable by creation time', () => {
    const a = newId('order')
    const b = newId('order')
    expect(a).not.toBe(b)
    expect([b, a].sort()).toEqual([a, b].sort())
  })
})
