// Where photos wait until they upload (components/Attachments). Device storage keeps them across a
// reload; when it is blocked or full (private mode, no space) they are kept in memory instead, so a
// failed upload can still be retried with "Upload again" until the app is closed. Never throws:
// losing a photo silently is worse than keeping it for this visit only.
import type { DeviceStorage } from '../platform/types'

type Storage = Pick<DeviceStorage, 'get' | 'set' | 'del' | 'keys'>

export function photoQueueStore<T>(storage: Storage) {
  // A key in memory is newer than the device copy: it was written there because the device refused.
  const memory = new Map<string, T[]>()
  return {
    async read(key: string): Promise<T[]> {
      if (memory.has(key)) return memory.get(key)!
      try {
        return (await storage.get<T[]>(key)) ?? []
      } catch {
        return []
      }
    },
    async write(key: string, items: T[]): Promise<void> {
      try {
        if (items.length) await storage.set(key, items)
        else await storage.del(key)
        memory.delete(key)
      } catch {
        memory.set(key, items)
      }
    },
    async keys(prefix: string): Promise<string[]> {
      let stored: string[] = []
      try {
        stored = await storage.keys(prefix)
      } catch {
        // Only the ones in memory, then.
      }
      const held = [...memory.entries()].filter(([k, v]) => k.startsWith(prefix) && v.length).map(([k]) => k)
      return [...new Set([...stored.filter((k) => !memory.has(k) || memory.get(k)!.length), ...held])]
    },
  }
}
