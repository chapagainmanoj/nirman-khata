import { describe, expect, it } from 'vitest'
import { t, translated } from './i18n'

describe('t', () => {
  it('fills each placeholder, once per pass', () => {
    expect(t('daily.sent.paid', { number: 'PAY-0007' })).toBe('paid now (PAY-0007).')
    // A name that looks like a placeholder is shown as typed, not filled in again.
    expect(t('photo.removeNamed', { name: '{name}' })).toBe('Remove {name}')
  })

  it('shows a missing value as nothing, and leaves unknown placeholders alone', () => {
    expect(t('crew.summary', { name: undefined })).toBe('Summary for ')
    expect(t('crew.summary', {})).toBe('Summary for {name}')
  })
})

describe('translated', () => {
  it('reads each label through t() and still lists them all', () => {
    const labels = translated({ a: 'common.save', b: 'common.cancel' })
    expect(labels.a).toBe('Save')
    expect(Object.entries(labels)).toEqual([['a', 'Save'], ['b', 'Cancel']])
  })
})
