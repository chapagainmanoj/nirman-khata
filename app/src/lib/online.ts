// Whether the phone has a connection, as TanStack Query sees it. Offline, saves are paused and go
// through by themselves when the connection is back; the UI says so instead of only spinning.
import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

const subscribe = (onChange: () => void) => onlineManager.subscribe(() => onChange())

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => onlineManager.isOnline())
}
