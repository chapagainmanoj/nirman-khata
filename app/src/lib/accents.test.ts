import { describe, expect, it } from 'vitest'
import { ACCENT_KEYS, ACCENTS } from './accents'

// WCAG relative luminance and contrast ratio.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('accents', () => {
  it.each(ACCENT_KEYS)('%s reads at AA everywhere it is used', (key) => {
    const a = ACCENTS[key]
    expect(contrast('#ffffff', a.brand)).toBeGreaterThanOrEqual(4.5) // text on the solid button
    expect(contrast(a.brand, '#ffffff')).toBeGreaterThanOrEqual(4.5) // links on the page
    expect(contrast(a.brand, '#faf9f6')).toBeGreaterThanOrEqual(4.5) // links and counts in the sidebar
    expect(contrast(a.dark, a.soft)).toBeGreaterThanOrEqual(4.5) // selected nav, soft buttons
    expect(contrast(a.dark, a.tint)).toBeGreaterThanOrEqual(4.5) // soft button hover
  })

  it('matches the database list', () => {
    // supabase/migrations/20261019000100_branding.sql check constraint
    expect(ACCENT_KEYS).toEqual(['teal', 'ocean', 'indigo', 'plum', 'pine', 'charcoal'])
  })

  it('default matches index.css', () => {
    expect(ACCENTS.teal.brand).toBe('#2a6a6e')
  })
})
