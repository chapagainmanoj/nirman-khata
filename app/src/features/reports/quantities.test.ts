import { describe, expect, it } from 'vitest'
import { quantityText, type HeadingQty } from './quantities'

const row = (heading: string, kind: string, unit: string | null, qty: number): HeadingQty =>
  ({ project_id: 'p', heading_id: heading, kind, unit, qty })

describe('quantityText', () => {
  it('shows one unit of material', () => {
    expect(quantityText([row('cement', 'material', 'bag', 60)]).get('p:cement')).toBe('60 bag')
  })

  it('keeps different units apart, never adding them', () => {
    const text = quantityText([row('baluwa', 'material', 'trip', 2), row('baluwa', 'material', 'cft', 150)])
    expect(text.get('p:baluwa')).toBe('2 trip · 150 cft')
  })

  it('shows nothing for more than two units of material', () => {
    const text = quantityText([row('hw', 'material', 'kg', 10), row('hw', 'material', 'piece', 50), row('hw', 'material', 'bundle', 2)])
    expect(text.has('p:hw')).toBe(false)
  })

  it('shows labour hours, then person-days', () => {
    const text = quantityText([row('jyala', 'person_days', null, 10.625), row('jyala', 'hours', null, 85)])
    expect(text.get('p:jyala')).toBe('85 h · 10.63 person-days')
  })

  it('says one person-day', () => {
    expect(quantityText([row('jyala', 'person_days', null, 1)]).get('p:jyala')).toBe('1 person-day')
  })

  it('formats large quantities the Nepali way', () => {
    expect(quantityText([row('rod', 'material', 'kg', 125000.5)]).get('p:rod')).toBe('1,25,000.5 kg')
  })

  it('keeps projects apart', () => {
    const text = quantityText([row('cement', 'material', 'bag', 5), { ...row('cement', 'material', 'bag', 7), project_id: 'q' }])
    expect([text.get('p:cement'), text.get('q:cement')]).toEqual(['5 bag', '7 bag'])
  })
})
