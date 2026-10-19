import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { draftSaver } from './drafts'

function fakeStorage(fail = false) {
  const writes: Array<{ key: string; values: unknown }> = []
  return {
    writes,
    set: vi.fn(async (key: string, value: unknown) => {
      if (fail) throw new Error('blocked')
      writes.push({ key, values: (value as { values: unknown }).values })
    }),
  }
}

describe('draftSaver', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('writes once, a moment after the last change', async () => {
    const storage = fakeStorage()
    const s = draftSaver('k', storage)
    s.schedule({ a: 1 })
    s.schedule({ a: 2 })
    await vi.advanceTimersByTimeAsync(399)
    expect(storage.writes).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(storage.writes).toEqual([{ key: 'k', values: { a: 2 } }])
  })

  it('flush writes a waiting change at once, so leaving the form keeps it', async () => {
    const storage = fakeStorage()
    const s = draftSaver('k', storage)
    s.schedule({ a: 1 })
    await s.flush()
    expect(storage.writes).toEqual([{ key: 'k', values: { a: 1 } }])
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.writes).toHaveLength(1)
  })

  it('flush with nothing waiting writes nothing', async () => {
    const storage = fakeStorage()
    await draftSaver('k', storage).flush()
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('after stop (the form was sent) nothing brings the draft back', async () => {
    const storage = fakeStorage()
    const s = draftSaver('k', storage)
    s.schedule({ a: 1 })
    s.stop()
    s.schedule({ a: 2 })
    await s.flush()
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('save writes now and replaces a waiting change', async () => {
    const storage = fakeStorage()
    const s = draftSaver('k', storage)
    s.schedule({ a: 1 })
    await s.save({ a: 9 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.writes).toEqual([{ key: 'k', values: { a: 9 } }])
  })

  it('a failed autosave is ignored (blocked storage)', async () => {
    const storage = fakeStorage(true)
    const s = draftSaver('k', storage)
    s.schedule({ a: 1 })
    await vi.advanceTimersByTimeAsync(400)
    s.schedule({ a: 2 })
    await expect(s.flush()).resolves.toBeUndefined()
    expect(storage.set).toHaveBeenCalledTimes(2)
  })

  it('save still reports a failure: the caller must not post without its draft', async () => {
    await expect(draftSaver('k', fakeStorage(true)).save({ a: 1 })).rejects.toThrow('blocked')
  })
})
