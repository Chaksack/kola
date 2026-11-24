import { describe, expect, it } from 'vitest'
import { parseCsv, parseCsvObjects, stringifyCsv } from '#shared/utils/csv'

describe('csv', () => {
  it('round-trips quotes, commas and newlines', () => {
    const rows = [['handle', 'description'], ['tote', 'Woven, "kente" tote\nwith lining']]
    expect(parseCsv(stringifyCsv(rows))).toEqual(rows)
  })
  it('neutralizes formula injection on export', () => {
    expect(stringifyCsv([['=HYPERLINK("x")', '+1', '-2', '@SUM(A1)', 'safe']])).toBe(`"'=HYPERLINK(""x"")",'+1,'-2,'@SUM(A1),safe\r\n`)
  })
  it('parses CRLF, BOM and blank lines', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n\r\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
  })
  it('maps rows to objects by header', () => {
    expect(parseCsvObjects('Handle,SKU\ntote,KWT-1\n')).toEqual([{ handle: 'tote', sku: 'KWT-1' }])
  })
})
