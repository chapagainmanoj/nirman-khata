import { t } from './i18n'
import { supabase } from './supabase'

/**
 * An Edge Function's refusal: its plain message, its stable `code` (supabase/functions/_shared/http.ts
 * `fail`), shown through `function.<code>` in lib/errors, and the HTTP status (0: no answer at all).
 */
export class FunctionError extends Error {
  readonly code?: string
  readonly status: number
  constructor(message: string, code: string | undefined, status: number) {
    super(message)
    this.name = 'FunctionError'
    this.code = code
    this.status = status
  }
}

/** Call an Edge Function; a refusal or no answer throws a FunctionError. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string; code?: string }>(name, { body })
  if (error) {
    const res = (error as { context?: Response }).context
    // No response: the request never reached the function (offline, blocked).
    if (!res || typeof res.json !== 'function') throw new FunctionError(t('error.offline'), 'offline', 0)
    let answer: { error?: string; code?: string } | undefined
    try {
      answer = await res.json()
    } catch {
      // Not JSON: a gateway page, not the function.
    }
    throw new FunctionError(answer?.error ?? t('error.generic'), answer?.code, res.status)
  }
  if (data?.error) throw new FunctionError(data.error, data.code, 200)
  return data as T
}
