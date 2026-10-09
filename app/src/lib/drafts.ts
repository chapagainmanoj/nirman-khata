// Unsent form drafts live on the device, keyed by user and company so a shared
// phone never mixes people's work (design §6).
import { useEffect, useRef, useState } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'
import { platform } from '../platform'

const PREFIX = 'draft:'

type Draft<T> = { values: T; savedAt: string }

const keyFor = (userId: string, companyId: string, formKey: string) => `${PREFIX}${userId}:${companyId}:${formKey}`

export async function listUserDrafts(userId: string): Promise<string[]> {
  return platform.storage.keys(`${PREFIX}${userId}:`)
}

export async function clearUserDrafts(userId: string): Promise<void> {
  for (const key of await listUserDrafts(userId)) await platform.storage.del(key)
}

/**
 * Restore a saved draft into the form on mount, then autosave changes.
 * Call `clear()` after a successful submit.
 */
export function useFormDraft<T extends FieldValues>(
  form: UseFormReturn<T>,
  ids: { userId: string; companyId: string; formKey: string },
) {
  const key = keyFor(ids.userId, ids.companyId, ids.formKey)
  const [restoredAt, setRestoredAt] = useState<string | null>(null)
  const ready = useRef(false)

  useEffect(() => {
    let cancelled = false
    platform.storage.get<Draft<T>>(key).then((draft) => {
      if (cancelled) return
      if (draft) {
        form.reset(draft.values)
        setRestoredAt(draft.savedAt)
      }
      ready.current = true
    })
    return () => {
      cancelled = true
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const sub = form.watch((values) => {
      if (!ready.current) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        void platform.storage.set(key, { values, savedAt: new Date().toISOString() } satisfies Draft<unknown>)
      }, 400)
    })
    return () => {
      clearTimeout(timer)
      sub.unsubscribe()
    }
  }, [form, key])

  return {
    restoredAt,
    clear: async () => {
      ready.current = false
      await platform.storage.del(key)
      setRestoredAt(null)
    },
  }
}
