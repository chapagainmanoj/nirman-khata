// How the app calls the database: RPCs that throw on error, and postings with an operation key
// (design §5.1). Shared by every feature; nothing here knows about a particular screen.
import { useMutation } from '@tanstack/react-query'
import { useRef } from 'react'
import type { Database } from '../lib/database.types'
import { newId } from '../lib/ids'
import { supabase } from '../lib/supabase'

type Fns = Database['public']['Functions']

/** Call an RPC and throw its error, so react-query sees failures. */
export async function rpc<N extends keyof Fns>(name: N, args: Fns[N]['Args']): Promise<Fns[N]['Returns']> {
  const { data, error } = await supabase.rpc(name, args as never)
  if (error) throw error
  return data as Fns[N]['Returns']
}

/**
 * A posting call with an operation key (design §5.1). The key is kept until the server
 * answers with success, so a retry after a lost response returns the first result
 * instead of posting twice.
 */
export function usePosting<A = void, R = unknown>(fn: (opKey: string, args: A) => Promise<R>, opts: { onSuccess?: (r: R) => unknown; initialKey?: string } = {}) {
  const key = useRef(opts.initialKey ?? newId())
  return useMutation({
    mutationFn: (args: A) => fn(key.current, args),
    onSuccess: async (r) => {
      key.current = newId()
      await opts.onSuccess?.(r)
    },
  })
}

/**
 * Save a draft before submitting it, unless an earlier submit with `submitKey` already went
 * through and only its answer was lost. `cameBack` says whether the record has been sent back to
 * its sender since (a rejected slip), which makes this a new send. Returns the key to submit with.
 */
export async function saveUnlessSent(
  submitKey: string,
  save: () => Promise<unknown>,
  cameBack?: () => Promise<boolean>,
): Promise<{ alreadySent: boolean; key: string }> {
  // Asked before saving: a save would turn a slip rejected since then back into a draft, and the
  // used key would then "send" it without sending (second review, Codex finding 1).
  if (await rpc('finished_submit', { p_op_key: submitKey })) {
    if (!cameBack || !(await cameBack())) return { alreadySent: true, key: submitKey }
    // Sent, then sent back (a rejected slip): this is a new send, under a new key.
    submitKey = newId()
  }
  await save()
  return { alreadySent: false, key: submitKey }
}
