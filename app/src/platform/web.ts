import { createStore, del, get, keys, set } from 'idb-keyval'
import type { Platform, ShareData, ShareResult } from './types'

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
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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
  requestPersistentStorage: async () => (await navigator.storage?.persist?.()) ?? false,
}
