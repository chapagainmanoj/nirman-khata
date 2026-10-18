// Unsent form drafts live on the device, keyed by user and company so a shared
// phone never mixes people's work (design §6).
import { useEffect, useRef, useState } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'
import { platform } from '../platform'

const PREFIX = 'draft:'

type Draft<T> = { values: T; savedAt: string }

const keyFor = (userId: string, companyId: string, formKey: string) => `${PREFIX}${userId}:${companyId}:${formKey}`
/** A device key next to the drafts: counted and cleared with them when the user signs out. */
export const deviceKey = keyFor

export async function listUserDrafts(userId: string): Promise<string[]> {
  return platform.storage.keys(`${PREFIX}${userId}:`)
}

export async function clearUserDrafts(userId: string): Promise<void> {
  for (const key of await listUserDrafts(userId)) await platform.storage.del(key)
}

/**
 * Restore a saved draft into the form on mount, then autosave changes.
 * Call `clear()` after a successful submit. `worthKeeping` says whether a stored draft is worth
 * bringing back (e.g. one that was sent, or has typed notes); one that is not is dropped quietly.
 */
export function useFormDraft<T extends FieldValues>(
  form: UseFormReturn<T>,
  ids: { userId: string; companyId: string; formKey: string },
  opts: { worthKeeping?: (values: T) => boolean } = {},
) {
  const key = keyFor(ids.userId, ids.companyId, ids.formKey)
  const [restoredAt, setRestoredAt] = useState<string | null>(null)
  const ready = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    platform.storage.get<Draft<T>>(key).then((draft) => {
      if (cancelled) return
      if (draft && opts.worthKeeping && !opts.worthKeeping(draft.values)) {
        void platform.storage.del(key)
      } else if (draft) {
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
    const sub = form.watch((values) => {
      if (!ready.current) return
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        // Re-checked: a save that was waiting when the form was sent must not bring the draft back.
        if (ready.current) void platform.storage.set(key, { values, savedAt: new Date().toISOString() } satisfies Draft<unknown>)
      }, 400)
    })
    return () => {
      clearTimeout(timer.current)
      sub.unsubscribe()
    }
  }, [form, key])

  return {
    restoredAt,
    /** Write the form now, e.g. just before sending it, so a reload keeps its id and operation key. */
    save: async () => {
      clearTimeout(timer.current)
      await platform.storage.set(key, { values: form.getValues(), savedAt: new Date().toISOString() } satisfies Draft<unknown>)
    },
    clear: async () => {
      ready.current = false
      clearTimeout(timer.current)
      await platform.storage.del(key)
      setRestoredAt(null)
    },
  }
}
