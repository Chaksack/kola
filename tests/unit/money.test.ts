import { describe, expect, it } from 'vitest'
import { allocate, applyBps, divRound, fromMinor, inclusiveTax, toMinor } from '#shared/utils/money'

describe('divRound', () => {
  it.each([
    [5, 2, 3],
    [-5, 2, -3],
    [4, 3, 1],
    [5, 3, 2],
    [0, 7, 0],
  ])('divRound(%i, %i) = %i', (n, d, expected) => {
    expect(divRound(n, d)).toBe(expected)
  })
  it('throws on zero denominator', () => expect(() => divRound(1, 0)).toThrow(RangeError))
})

describe('applyBps / inclusiveTax', () => {
  it('applies basis points with half-up rounding', () => {
    expect(applyBps(1000, 1500)).toBe(150)
    expect(applyBps(333, 1000)).toBe(33)
    expect(applyBps(335, 1000)).toBe(34)
  })
  it('extracts inclusive tax so net + tax = gross', () => {
    expect(inclusiveTax(11500, 1500)).toBe(1500)
    const gross = 9999
    const tax = inclusiveTax(gross, 1500)
    expect(tax).toBe(1304)
  })
  it('rejects non-integers', () => expect(() => applyBps(10.5, 100)).toThrow(TypeError))
})

describe('allocate', () => {
  it('always sums to the total', () => {
    const parts = allocate(100, [1, 1, 1])
    expect(parts).toEqual([34, 33, 33])
    expect(parts.reduce((a, b) => a + b)).toBe(100)
  })
  it('handles zero weights', () => expect(allocate(50, [0, 0])).toEqual([50, 0]))
  it('handles empty weights', () => expect(allocate(50, [])).toEqual([]))
  it('is proportional', () => expect(allocate(1000, [3000, 1000])).toEqual([750, 250]))
})

describe('toMinor / fromMinor', () => {
  it.each([
    ['12.50', 'GHS', 1250],
    ['12.5', 'USD', 1250],
    ['0.005', 'EUR', 1],
    ['1,234.56', 'GBP', 123456],
    ['-3.10', 'GHS', -310],
    ['500', 'XOF', 500],
  ])('toMinor(%s, %s) = %i', (major, cur, minor) => {
    expect(toMinor(major, cur)).toBe(minor)
  })
  it('round-trips', () => {
    expect(fromMinor(1250, 'GHS')).toBe('12.50')
    expect(fromMinor(-5, 'USD')).toBe('-0.05')
    expect(fromMinor(500, 'XOF')).toBe('500')
  })
  it('rejects garbage', () => expect(() => toMinor('abc', 'GHS')).toThrow(TypeError))
})
