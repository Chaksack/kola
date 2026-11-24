import { describe, expect, it } from 'vitest'
import { inventoryStatus } from '../../server/services/product'
import { toHandle } from '../../shared/schemas/catalog'

describe('inventoryStatus', () => {
  it.each([
    [{ managed: 0, available: 0, low: false }, 'not_tracked'],
    [{ managed: 2, available: 0, low: true }, 'out_of_stock'],
    [{ managed: 2, available: 3, low: true }, 'low_stock'],
    [{ managed: 2, available: 40, low: false }, 'in_stock'],
  ] as const)('%o → %s', (input, expected) => expect(inventoryStatus(input)).toBe(expected))
})

describe('toHandle', () => {
  it.each([
    ['Kente Weave Tote', 'kente-weave-tote'],
    ['  Shea Body Butter 250ml ', 'shea-body-butter-250ml'],
    ["Côte d'Ivoire Café", 'cote-d-ivoire-cafe'],
    ['---', ''],
  ])('%s → %s', (input, expected) => expect(toHandle(input)).toBe(expected))
})
