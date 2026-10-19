import { describe, expect, it } from 'vitest'
import { photoQueueStore } from './photoQueue'

/** A device store; `broken` makes every call fail the way blocked IndexedDB does. */
function device(broken = { get: false, set: false, keys: false }) {
  const data = new Map<string, unknown>()
  return {
    data,
    broken,
    get: async <T,>(k: string) => {
      if (broken.get) throw new Error('blocked')
      return data.get(k) as T | undefined
    },
    set: async (k: string, v: unknown) => {
      if (broken.set) throw new Error('blocked')
      data.set(k, v)
    },
    del: async (k: string) => {
      if (broken.set) throw new Error('blocked')
      data.delete(k)
    },
    keys: async (prefix: string) => {
      if (broken.keys) throw new Error('blocked')
      return [...data.keys()].filter((k) => k.startsWith(prefix))
    },
  }
}

describe('photoQueueStore', () => {
  it('keeps photos on the device when it can', async () => {
    const d = device()
    const q = photoQueueStore<string>(d)
    await q.write('p:a', ['one'])
    expect(d.data.get('p:a')).toEqual(['one'])
    expect(await q.read('p:a')).toEqual(['one'])
    expect(await q.keys('p:')).toEqual(['p:a'])
    await q.write('p:a', [])
    expect(d.data.has('p:a')).toBe(false)
    expect(await q.keys('p:')).toEqual([])
  })

  it('keeps photos in memory when the device refuses, so nothing is lost', async () => {
    const d = device({ get: true, set: true, keys: true })
    const q = photoQueueStore<string>(d)
    await expect(q.write('p:a', ['one', 'two'])).resolves.toBeUndefined()
    expect(await q.read('p:a')).toEqual(['one', 'two'])
    expect(await q.keys('p:')).toEqual(['p:a'])
    await q.write('p:a', ['two'])
    expect(await q.read('p:a')).toEqual(['two'])
  })

  it('a newer copy in memory wins over an older one on the device (device full)', async () => {
    const d = device()
    const q = photoQueueStore<string>(d)
    await q.write('p:a', ['one'])
    d.broken.set = true
    await q.write('p:a', ['one', 'two'])
    expect(await q.read('p:a')).toEqual(['one', 'two'])
    await q.write('p:a', [])
    expect(await q.read('p:a')).toEqual([])
    expect(await q.keys('p:')).toEqual([])
  })

  it('moves back to the device once it accepts writes again', async () => {
    const d = device({ get: false, set: true, keys: false })
    const q = photoQueueStore<string>(d)
    await q.write('p:a', ['one'])
    d.broken.set = false
    await q.write('p:a', ['one', 'two'])
    expect(d.data.get('p:a')).toEqual(['one', 'two'])
    expect(await q.read('p:a')).toEqual(['one', 'two'])
    expect(await q.keys('p:')).toEqual(['p:a'])
  })
})
