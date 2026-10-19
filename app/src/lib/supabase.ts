import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (see app/.env.example)')
}

// A phone on site can show signal yet never get an answer; without a limit a request waits forever
// and the button only spins. Lists then show "Try again"; saves keep their op_key or id, so a retry
// finds what the first try saved (design §5.1). Files and Edge Functions carry photos and exports,
// so they get longer.
const TIMEOUT_MS = 30_000
const SLOW_TIMEOUT_MS = 120_000
const TIMEOUT_MESSAGE = 'request_timeout'

const fetchWithTimeout: typeof fetch = (input, init) => {
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const ms = /\/(storage|functions)\/v1\//.test(target) ? SLOW_TIMEOUT_MS : TIMEOUT_MS
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, ms)
  // Keep the caller's own cancel (a query no longer needed) working alongside the limit.
  const outer = init?.signal
  if (outer?.aborted) controller.abort()
  else outer?.addEventListener('abort', () => controller.abort(), { once: true })
  return fetch(input, { ...init, signal: controller.signal })
    .catch((e: unknown) => {
      // An AbortError: postgrest-js retries a failed GET three more times itself, which after a full
      // wait would keep the spinner for minutes. Aborts it hands back at once, message kept.
      if (timedOut) throw new DOMException(TIMEOUT_MESSAGE, 'AbortError')
      throw e
    })
    .finally(() => clearTimeout(timer))
}

export const supabase = createClient<Database>(url, key, { global: { fetch: fetchWithTimeout } })

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type AppRole = Database['public']['Enums']['app_role']
export type ProjectStatus = Database['public']['Enums']['project_status']
