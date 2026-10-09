import { supabase } from './supabase'

/** Call an Edge Function and surface its `{ error }` body as an Error. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(name, { body })
  if (error) {
    const res = (error as { context?: Response }).context
    let message: string | undefined
    try {
      message = res && typeof res.json === 'function' ? (await res.json())?.error : undefined
    } catch {
      // not JSON
    }
    throw new Error(message ?? 'Could not reach the server. Check your connection.')
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}
