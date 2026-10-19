import { createStore, del, get, keys, set } from 'idb-keyval'
import type { DevicePrefs, Platform, ShareData, ShareResult } from './types'

const store = createStore('nirmankhata', 'device')

async function share(data: ShareData): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && (!data.files?.length || nav.canShare?.(data))) {
    try {
      await nav.share(data)
      return 'shared'
    } catch (e) {
      return (e as Error).name === 'AbortError' ? 'cancelled' : 'unsupported'
    }
  }
  const text = [data.title, data.text, data.url].filter(Boolean).join('\n')
  if (text && navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return 'copied'
  }
  return 'unsupported'
}

function pickPhoto(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  // A large file (company export) may still be starting to save after a second.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// Private mode or blocked storage: reads give null and writes are dropped.
const prefs: DevicePrefs = {
  get(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch {
      // Only a convenience: the setting is just not remembered.
    }
  },
}

export const webPlatform: Platform = {
  share,
  pickPhoto,
  download,
  storage: {
    get: (key) => get(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
    keys: async (prefix) => (await keys(store)).map(String).filter((k) => k.startsWith(prefix)),
  },
  prefs,
  requestPersistentStorage: async () => (await navigator.storage?.persist?.()) ?? false,
  reload: () => window.location.reload(),
}
