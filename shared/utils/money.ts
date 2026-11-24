/**
 * Money utilities. All amounts are integer minor units (e.g. pesewas, cents).
 * Never use floats for money: every helper here takes and returns integers.
 */

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'XOF', 'XAF', 'UGX', 'RWF'])

export function currencyDecimals(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2
}

export function assertMinor(amount: number, label = 'amount'): void {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError(`${label} must be a safe integer in minor units, got ${amount}`)
  }
}

/**
 * Integer division with round-half-away-from-zero. Deterministic for all safe integers.
 * divRound(5, 2) === 3, divRound(-5, 2) === -3.
 */
export function divRound(numerator: number, denominator: number): number {
  if (denominator === 0) throw new RangeError('Division by zero')
  const sign = Math.sign(numerator) * Math.sign(denominator)
  const n = Math.abs(numerator)
  const d = Math.abs(denominator)
  const q = Math.floor(n / d)
  const r = n - q * d
  return sign * (r * 2 >= d ? q + 1 : q)
}

/** amount × bps / 10_000, rounded half away from zero. 1500 bps = 15%. */
export function applyBps(amount: number, bps: number): number {
  assertMinor(amount)
  return divRound(amount * bps, 10_000)
}

/** Tax contained in a tax-inclusive amount: amount − amount / (1 + rate). */
export function inclusiveTax(amount: number, bps: number): number {
  assertMinor(amount)
  return amount - divRound(amount * 10_000, 10_000 + bps)
}

/**
 * Split `total` across `weights` proportionally so the parts always sum to `total`
 * (largest-remainder method; ties go to the earliest index).
 */
export function allocate(total: number, weights: number[]): number[] {
  assertMinor(total, 'total')
  const sum = weights.reduce((a, b) => a + b, 0)
  if (weights.length === 0) return []
  if (sum === 0) return weights.map((_, i) => (i === 0 ? total : 0))
  const raw = weights.map((w) => Math.floor((total * w) / sum))
  let remainder = total - raw.reduce((a, b) => a + b, 0)
  const order = weights
    .map((w, i) => ({ i, frac: (total * w) / sum - Math.floor((total * w) / sum) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; remainder > 0; k = (k + 1) % order.length) {
    raw[order[k]!.i]! += 1
    remainder -= 1
  }
  return raw
}

/** Parse a decimal string like "12.50" into minor units (1250) without float math. */
export function toMinor(major: string | number, currency: string): number {
  const decimals = currencyDecimals(currency)
  const str = typeof major === 'number' ? major.toFixed(decimals) : major.trim()
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(str.replace(/,/g, ''))
  if (!m) throw new TypeError(`Invalid money amount: ${major}`)
  const [, neg, whole, frac = ''] = m
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  // Round on the next digit (half away from zero)
  const nextDigit = Number(frac.charAt(decimals) || '0')
  let value = Number(whole) * 10 ** decimals + Number(padded || '0')
  if (nextDigit >= 5) value += 1
  return neg ? -value : value
}

/** Minor units → plain decimal string ("1250" GHS → "12.50"). */
export function fromMinor(amount: number, currency: string): string {
  assertMinor(amount)
  const decimals = currencyDecimals(currency)
  if (decimals === 0) return String(amount)
  const neg = amount < 0
  const abs = Math.abs(amount)
  const whole = Math.floor(abs / 10 ** decimals)
  const frac = String(abs % 10 ** decimals).padStart(decimals, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}

const formatters = new Map<string, Intl.NumberFormat>()

export function formatMoney(amount: number, currency: string, locale = 'en-GH'): string {
  const code = currency.toUpperCase()
  const key = `${locale}:${code}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'symbol',
      minimumFractionDigits: currencyDecimals(code),
      maximumFractionDigits: currencyDecimals(code),
    })
    formatters.set(key, f)
  }
  // Intl needs a major-unit number; division here is display-only.
  return f.format(amount / 10 ** currencyDecimals(code))
}

export function sumMinor(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}
