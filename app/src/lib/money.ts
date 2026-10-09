// Money is integer paisa everywhere (design §4.1). Rs. 1,234.50 === 123450.
// Never use floats for amounts; parse user input straight to paisa.

const PAISA_PER_RUPEE = 100

// Indian/Nepali digit grouping: 12,34,567
function groupLakh(rupees: bigint): string {
  const s = rupees.toString()
  if (s.length <= 3) return s
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
}

/** "Rs. 12,34,567" or "Rs. 12,34,567.50". Negative: "-Rs. 500". */
export function formatNPR(paisa: number | null | undefined, opts: { symbol?: boolean } = {}): string {
  if (paisa === null || paisa === undefined) return 'Not available'
  assertPaisa(paisa)
  const symbol = opts.symbol === false ? '' : 'Rs. '
  const negative = paisa < 0
  const abs = BigInt(Math.abs(paisa))
  const rupees = abs / 100n
  const rem = Number(abs % 100n)
  const text = groupLakh(rupees) + (rem ? '.' + rem.toString().padStart(2, '0') : '')
  return (negative ? '-' : '') + symbol + text
}

/** Short form for summaries: "45,000", "12.35 lakh", "1.2 crore". */
export function formatNPRShort(paisa: number | null | undefined): string {
  if (paisa === null || paisa === undefined) return 'Not available'
  assertPaisa(paisa)
  const rupees = Math.abs(paisa) / PAISA_PER_RUPEE
  const sign = paisa < 0 ? '-' : ''
  const trim = (n: number, digits: number) => n.toFixed(digits).replace(/\.?0+$/, '')
  if (rupees >= 1_00_00_000) return `${sign}Rs. ${trim(rupees / 1_00_00_000, 2)} crore`
  if (rupees >= 1_00_000) return `${sign}Rs. ${trim(rupees / 1_00_000, 2)} lakh`
  return formatNPR(paisa)
}

/**
 * Parse what a user typed into paisa. Accepts "12,34,567", "1234567.5", "Rs. 500".
 * Returns null for empty or invalid input. More than 2 decimals is invalid.
 */
export function parseNPR(input: string): number | null {
  const cleaned = input.replace(/rs\.?/i, '').replace(/[,\s]/g, '')
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const negative = cleaned.startsWith('-')
  const [whole, frac = ''] = cleaned.replace('-', '').split('.')
  const paisa = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'))
  const value = Number(negative ? -paisa : paisa)
  return Number.isSafeInteger(value) ? value : null
}

/** Plain editable text for an input field: "1234567.5" style without grouping. */
export function paisaToInput(paisa: number | null | undefined): string {
  if (paisa === null || paisa === undefined) return ''
  return formatNPR(paisa, { symbol: false }).replace(/,/g, '')
}

/**
 * Split a total into parts proportional to weights, using the largest-remainder
 * method so the parts always add up exactly to the total (design §4.1).
 */
export function splitProRata(totalPaisa: number, weights: number[]): number[] {
  assertPaisa(totalPaisa)
  if (weights.length === 0) return []
  const weightSum = weights.reduce((a, b) => a + b, 0)
  if (weightSum <= 0) throw new Error('splitProRata needs positive weights')
  const total = BigInt(totalPaisa)
  const sum = BigInt(weightSum)
  const sign = total < 0n ? -1n : 1n
  const absTotal = total * sign
  const raw = weights.map((w) => absTotal * BigInt(w))
  const parts = raw.map((r) => r / sum)
  let left = absTotal - parts.reduce((a, b) => a + b, 0n)
  const order = raw
    .map((r, i) => ({ i, rem: r % sum }))
    .sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : a.i - b.i))
  for (const { i } of order) {
    if (left === 0n) break
    parts[i] += 1n
    left -= 1n
  }
  return parts.map((p) => Number(p * sign))
}

/** Percentage with "Not available" for a missing or zero denominator (req §19). */
export function percent(numerator: number, denominator: number | null | undefined): string {
  if (!denominator) return 'Not available'
  return `${((numerator / denominator) * 100).toFixed(1).replace(/\.0$/, '')}%`
}

function assertPaisa(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error(`Money must be integer paisa, got ${value}`)
}
