import { describe, expect, it } from 'vitest'
import { projectChoices, resolveCurrentProject } from './current'

const p = (id: string, status = 'active') => ({ id, code: id.toUpperCase(), name: id, status })

describe('resolveCurrentProject', () => {
  it('keeps the stored choice while it can still be worked on', () => {
    expect(resolveCurrentProject('a', [p('a'), p('b')])).toBe('a')
  })
  it('drops a choice that is closed or no longer visible', () => {
    expect(resolveCurrentProject('a', [p('a', 'closed'), p('b'), p('c')])).toBeNull()
    expect(resolveCurrentProject('gone', [p('b'), p('c')])).toBeNull()
  })
  it('falls back to the only workable project', () => {
    expect(resolveCurrentProject(null, [p('a'), p('b', 'completed')])).toBe('a')
    expect(resolveCurrentProject('gone', [p('a')])).toBe('a')
  })
  it('keeps the stored id while projects are still loading', () => {
    expect(resolveCurrentProject('a', undefined)).toBe('a')
  })
})

describe('projectChoices', () => {
  const all = ['active', 'on_hold', 'completed', 'closed', 'cancelled'].map((s) => p(s, s))
  const ids = (list: Array<{ id: string }>) => list.map((x) => x.id)

  it('lists Active and On hold for site work', () => {
    expect(ids(projectChoices(all, 'site'))).toEqual(['active', 'on_hold'])
  })
  it('adds Completed for money: final bills come after the work ends', () => {
    expect(ids(projectChoices(all, 'money'))).toEqual(['active', 'on_hold', 'completed'])
  })
  it('keeps the projects already on a record being edited', () => {
    expect(ids(projectChoices(all, 'site', ['completed', null]))).toEqual(['active', 'on_hold', 'completed'])
  })
})
