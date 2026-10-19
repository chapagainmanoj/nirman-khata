import { webPlatform } from './web'
import type { Platform } from './types'

export type { DevicePrefs, Platform, ShareData, ShareResult } from './types'

export const platform: Platform = webPlatform
