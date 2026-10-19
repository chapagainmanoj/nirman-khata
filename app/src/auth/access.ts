// What decides which rows and amounts the server returns to this person (design §3.4, §3.5).
// When any of it changes while they are signed in (an admin changed their roles or finance rights,
// or another person's session arrived in this tab), every cached answer was given under the old
// rights and must be fetched again: RLS guards each new request, not what is already on screen.
type Access = {
  id: string
  company_id: string
  roles: readonly string[]
  can_view_finance: boolean
  can_record_payments: boolean
  can_approve_slips: boolean
}

/** A string that changes exactly when the rights behind cached data change. `null`: nobody signed in. */
export function accessFingerprint(userId: string | null, membership: Access | null): string | null {
  if (!userId) return null
  if (!membership) return `${userId}|-`
  const m = membership
  return [userId, m.id, m.company_id, [...m.roles].sort().join(','), +m.can_view_finance, +m.can_record_payments, +m.can_approve_slips].join('|')
}

/**
 * Whether cached data must be dropped when the fingerprint moves from `before` to `after`. Loading
 * the first time (`before` undefined) or signing out (cleared elsewhere) needs nothing here.
 */
export function accessChanged(before: string | null | undefined, after: string | null): boolean {
  return before !== undefined && before !== null && after !== null && before !== after
}
