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

type Storage = Pick<typeof platform.storage, 'set'>

/**
 * Writes a form's values a moment after the last change. `flush()` writes a waiting change at once
 * (the form is closing, so the last few keystrokes are not lost); `stop()` drops it and ignores any
 * later change (the form was sent, so its draft must not come back). A failed write is ignored:
 * the draft is a convenience, and the form still works.
 */
export function draftSaver(key: string, storage: Storage = platform.storage, delayMs = 400) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let waiting: { values: unknown } | undefined
  let stopped = false
  const write = (values: unknown) => storage.set(key, { values, savedAt: new Date().toISOString() } satisfies Draft<unknown>).catch(() => {})
  return {
    schedule(values: unknown) {
      if (stopped) return
      clearTimeout(timer)
      waiting = { values }
      timer = setTimeout(() => {
        waiting = undefined
        void write(values)
      }, delayMs)
    },
    flush() {
      clearTimeout(timer)
      const w = waiting
      waiting = undefined
      return w && !stopped ? write(w.values) : Promise.resolve()
    },
    stop() {
      stopped = true
      clearTimeout(timer)
      waiting = undefined
    },
    /** Write `values` now, replacing anything waiting. */
    save(values: unknown) {
      clearTimeout(timer)
      waiting = undefined
      return storage.set(key, { values, savedAt: new Date().toISOString() } satisfies Draft<unknown>)
    },
  }
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
  const saver = useRef<ReturnType<typeof draftSaver> | null>(null)

  useEffect(() => {
    let cancelled = false
    platform.storage.get<Draft<T>>(key).then((draft) => {
      if (cancelled) return
      if (draft && opts.worthKeeping && !opts.worthKeeping(draft.values)) {
        void platform.storage.del(key).catch(() => {})
      } else if (draft) {
        form.reset(draft.values)
        setRestoredAt(draft.savedAt)
      }
    }, () => {
      // Device storage could not be read (private mode): start empty, still try to autosave.
    }).finally(() => {
      if (!cancelled) ready.current = true
    })
    return () => {
      cancelled = true
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = draftSaver(key)
    saver.current = s
    const sub = form.watch((values) => {
      if (ready.current) s.schedule(values)
    })
    return () => {
      sub.unsubscribe()
      // Leaving the form (back, another screen) keeps the last change instead of dropping it.
      void s.flush()
    }
  }, [form, key])

  return {
    restoredAt,
    /** Write the form now, e.g. just before sending it, so a reload keeps its id and operation key. */
    save: async () => {
      await (saver.current?.save(form.getValues()) ?? draftSaver(key).save(form.getValues()))
    },
    clear: async () => {
      ready.current = false
      saver.current?.stop()
      await platform.storage.del(key)
      setRestoredAt(null)
    },
  }
}
