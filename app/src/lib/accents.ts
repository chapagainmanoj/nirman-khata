// The accent colours a company can choose (Settings › Logo and colour). Each is checked for
// contrast in accents.test.ts. Red, yellow and green are not offered: they mean error, pending
// and paid. Only the accent changes; page, text and status colours are the same for everyone.
// The default ("teal") matches the values in index.css, so nothing changes until one is chosen.

export const ACCENTS = {
  teal: { label: 'accent.teal', brand: '#2a6a6e', dark: '#1d4f52', soft: '#e3efef', tint: '#d3e6e6' },
  ocean: { label: 'accent.ocean', brand: '#25609a', dark: '#1a4673', soft: '#e3edf7', tint: '#d0e1f1' },
  indigo: { label: 'accent.indigo', brand: '#45509a', dark: '#323a75', soft: '#e8eaf6', tint: '#d8dcef' },
  plum: { label: 'accent.plum', brand: '#7a3f78', dark: '#5c2e5a', soft: '#f3e8f2', tint: '#e8d6e6' },
  pine: { label: 'accent.pine', brand: '#2f6650', dark: '#224b3b', soft: '#e3efe9', tint: '#d1e5db' },
  charcoal: { label: 'accent.charcoal', brand: '#44403c', dark: '#292524', soft: '#eeecea', tint: '#e0dcd8' },
} as const

export type AccentKey = keyof typeof ACCENTS
export const DEFAULT_ACCENT: AccentKey = 'teal'
export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[]

const CACHE_KEY = 'nk.accent'

export const isAccent = (k: unknown): k is AccentKey => typeof k === 'string' && k in ACCENTS

// The variables an accent sets on <html>: the accent tokens and their slate aliases.
function variables(key: unknown): Array<[string, string]> {
  const a = ACCENTS[isAccent(key) ? key : DEFAULT_ACCENT]
  return [
    ['brand', a.brand], ['brand-dark', a.dark], ['brand-soft', a.soft], ['brand-tint', a.tint],
    ['slate', a.brand], ['slate-dark', a.dark], ['slate-soft', a.soft],
  ]
}

/**
 * Recolours the app and remembers the colours on this device, so the next load paints in the
 * company's colour before React starts (the inline script in index.html reads CACHE_KEY).
 * The default is not stored: signing out, or a company on teal, leaves nothing behind.
 */
export function applyAccent(key: unknown) {
  const vars = variables(key)
  const s = document.documentElement.style
  for (const [name, value] of vars) s.setProperty(`--color-${name}`, value)
  try {
    if (isAccent(key) && key !== DEFAULT_ACCENT) localStorage.setItem(CACHE_KEY, JSON.stringify(vars))
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    // Private mode or blocked storage: the colour still applies once the company loads.
  }
}
