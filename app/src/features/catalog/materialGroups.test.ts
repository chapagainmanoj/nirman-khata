import { describe, expect, it } from 'vitest'
import { materialGroups, materialLabel } from './materialGroups'

const headings = [
  { id: 'cement', name: 'Cement', sort_order: 1 },
  { id: 'steel', name: 'Rod/Steel', sort_order: 2 },
  { id: 'sand', name: 'Baluwa/Gitti/Dhunga', sort_order: 3 },
]
const m = (id: string, name: string, heading: string | null, local_name: string | null = null, active = true) =>
  ({ id, name, local_name, default_heading_id: heading, active })
const materials = [
  m('rod', 'Rod (TMT rebar)', 'steel', 'Chhad'),
  m('ms', 'MS pipe', 'steel'),
  m('cem', 'Cement', 'cement', 'Cement'),
  m('ms2', 'Sand (masino)', 'sand', 'Masino baluwa'),
  m('agg', 'Aggregate', 'sand', 'Gitti'),
  m('misc', 'Bamboo', null),
  m('old', 'Old item', 'cement', null, false),
]

describe('materialLabel', () => {
  it('adds the local name only when it says something new', () => {
    expect(materialLabel({ name: 'Rod (TMT rebar)', local_name: 'Chhad' })).toBe('Rod (TMT rebar) · Chhad')
    expect(materialLabel({ name: 'Color (putty)', local_name: 'Putty' })).toBe('Color (putty)')
    expect(materialLabel({ name: 'Tile', local_name: ' ' })).toBe('Tile')
  })
})

describe('materialGroups', () => {
  it('groups by heading in heading order, A–Z inside, inactive left out, no heading last', () => {
    expect(materialGroups(materials, headings).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Cement', ['cem']],
      ['Rod/Steel', ['ms', 'rod']],
      ['Baluwa/Gitti/Dhunga', ['agg', 'ms2']],
      [null, ['misc']],
    ])
  })
  it('puts the headings used most recently first, each material once', () => {
    const groups = materialGroups(materials, headings, ['ms2', 'rod', 'cem'])
    expect(groups.map((g) => g.label)).toEqual(['Baluwa/Gitti/Dhunga', 'Rod/Steel', 'Cement', null])
    expect(groups.flatMap((g) => g.items).length).toBe(6)
  })
})
