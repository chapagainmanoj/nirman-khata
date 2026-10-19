import { describe, expect, it } from 'vitest'
import { accessChanged, accessFingerprint } from './access'

const m = { id: 'm1', company_id: 'c1', roles: ['site_staff'], can_view_finance: false, can_record_payments: false, can_approve_slips: false }

describe('accessFingerprint', () => {
  it('is null when nobody is signed in', () => {
    expect(accessFingerprint(null, m)).toBeNull()
  })
  it('changes when roles or finance rights change', () => {
    const before = accessFingerprint('u1', m)
    expect(accessFingerprint('u1', { ...m, can_view_finance: true })).not.toBe(before)
    expect(accessFingerprint('u1', { ...m, roles: ['site_staff', 'accounts'] })).not.toBe(before)
    expect(accessFingerprint('u1', { ...m, can_record_payments: true })).not.toBe(before)
    expect(accessFingerprint('u2', m)).not.toBe(before)
    expect(accessFingerprint('u1', null)).not.toBe(before)
  })
  it('changes when a project is taken away or given', () => {
    const before = accessFingerprint('u1', m, ['p1', 'p2'])
    expect(accessFingerprint('u1', m, ['p1'])).not.toBe(before)
    expect(accessFingerprint('u1', m, ['p1', 'p2', 'p3'])).not.toBe(before)
  })
  it('ignores the order roles and projects come back in', () => {
    expect(accessFingerprint('u1', { ...m, roles: ['a', 'b'] })).toBe(accessFingerprint('u1', { ...m, roles: ['b', 'a'] }))
    expect(accessFingerprint('u1', m, ['p1', 'p2'])).toBe(accessFingerprint('u1', m, ['p2', 'p1']))
  })
})

describe('accessChanged', () => {
  it('does nothing on first load or sign-out', () => {
    expect(accessChanged(undefined, 'x')).toBe(false)
    expect(accessChanged(null, 'x')).toBe(false)
    expect(accessChanged('x', null)).toBe(false)
  })
  it('drops cached data when the rights change', () => {
    expect(accessChanged('x', 'x')).toBe(false)
    expect(accessChanged('x', 'y')).toBe(true)
  })
})
