// How the code may depend on itself. A feature's pages and helpers are its own; other code uses only
// the files it lists in PUBLIC (its data hooks, and parts other screens show). lib/ and platform/
// stay below everything else. App.tsx loads pages for the routes, so it is the one exception.
import { describe, expect, it } from 'vitest'

/** What each feature offers the rest of the app. Add a file here only when another feature needs it. */
const PUBLIC: Record<string, string[]> = {
  calendar: ['events'],
  catalog: ['api', 'MaterialOptions'],
  clients: ['api', 'ClientTab'],
  costs: ['api', 'CostLists'],
  dashboard: ['api', 'parts'],
  labour: ['api', 'CrewBoard', 'WorkerCrews', 'WorkerForm'],
  lists: ['ListFilters'],
  parties: ['api', 'kinds', 'PartyParts'],
  photos: ['PhotosWaitingNotice'],
  platform: ['api'],
  projects: ['api', 'current', 'crumbs', 'ProjectFilter'],
  refunds: ['RefundCard'],
  site: ['api', 'SiteSection'],
  subcontract: ['api'],
  supply: ['api', 'BillRow', 'DeliveryList'],
}

// Layers that must not reach up: lib/ and platform/ are plain helpers and device access.
const BELOW: Record<string, string[]> = {
  lib: ['features', 'components', 'data', 'auth', 'routes'],
  platform: ['features', 'components', 'data', 'auth', 'routes', 'lib'],
  data: ['features', 'components', 'routes'],
}

const SOURCES = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** "./features/supply/api.ts" importing "../projects/current" gives "features/projects/current". */
function resolve(from: string, spec: string): string {
  const parts = from.replace(/^\.\//, '').split('/').slice(0, -1)
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

function imports(): Array<{ file: string; target: string }> {
  const out: Array<{ file: string; target: string }> = []
  for (const [path, text] of Object.entries(SOURCES)) {
    for (const m of text.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+'(\.[^']+)'/gm)) {
      out.push({ file: path.replace(/^\.\//, ''), target: resolve(path, m[1]) })
    }
  }
  return out
}

describe('architecture', () => {
  it('reads the source files (the check still sees the code)', () => {
    expect(imports().length).toBeGreaterThan(500)
  })

  it('a feature is used from outside only through its public files (PUBLIC)', () => {
    const wrong = imports().filter(({ file, target }) => {
      const [top, feature, name] = target.split('/')
      if (top !== 'features' || file === 'App.tsx') return false
      if (file.startsWith(`features/${feature}/`)) return false
      return !PUBLIC[feature]?.includes(name)
    }).map(({ file, target }) => `${file} -> ${target}`)
    expect(wrong, 'Import its api.ts or a public part instead, or add the file to PUBLIC if other features truly need it').toEqual([])
  })

  it('lib/, platform/ and data/ do not reach up into screens', () => {
    const wrong = imports().filter(({ file, target }) => {
      const layer = file.split('/')[0]
      return BELOW[layer]?.includes(target.split('/')[0])
    }).map(({ file, target }) => `${file} -> ${target}`)
    expect(wrong).toEqual([])
  })

  it('every public file exists', () => {
    const missing = Object.entries(PUBLIC).flatMap(([feature, names]) =>
      names.filter((n) => !SOURCES[`./features/${feature}/${n}.ts`] && !SOURCES[`./features/${feature}/${n}.tsx`]).map((n) => `${feature}/${n}`))
    expect(missing).toEqual([])
  })
})
