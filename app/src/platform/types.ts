// Device features go through this interface (design §1.4). The web version is
// used now; a Capacitor version can be added later without touching features.
export type ShareData = { title?: string; text?: string; url?: string; files?: File[] }
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'unsupported'

export interface DeviceStorage {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
  keys(prefix: string): Promise<string[]>
}

export interface Platform {
  share(data: ShareData): Promise<ShareResult>
  /** Opens the camera on phones, a file picker elsewhere. */
  pickPhoto(): Promise<File | null>
  download(blob: Blob, fileName: string): void
  storage: DeviceStorage
  /** Ask the OS not to clear device storage under pressure (drafts). */
  requestPersistentStorage(): Promise<boolean>
  /** Start the app again with its current files (a screen that failed to load). */
  reload(): void
}
