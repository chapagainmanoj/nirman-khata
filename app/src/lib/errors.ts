// Turn database and network errors into messages a site engineer can act on.
type ErrorLike = { message?: string; code?: string; details?: string } | null | undefined

// Unique constraints with a more specific message than "This already exists".
const BY_CONSTRAINT: Record<string, string> = {
  projects_company_id_code_key: 'This project code is already used.',
  suppliers_unique_name: 'A supplier with this name already exists.',
  subcontractors_unique_name: 'A subcontractor with this name already exists.',
  payees_unique_name: 'One of your other services already has this name.',
  expense_project_or_company: 'An expense is either on a project with who is owed it, or a company expense with how it was paid.',
  crews_unique_name: 'A crew with this name already exists for this project.',
  crew_members_unique_name: 'A worker with this name is already on this crew.',
  registration_allowlist_login_email_key: 'This mobile number or email is already on the list.',
}

// Check constraints people can hit from a form.
const BY_CHECK: Record<string, string> = {
  attendance_times: 'The out time must be after the in time.',
  attendance_minutes_fit: 'The hours cannot be more than the time from in to out.',
}

// Our own error codes: the readable part follows the colon.
const PREFIXED = ['attendance_off', 'day_closed', 'attendance_overlap']

const BY_CODE: Record<string, string> = {
  '23505': 'This already exists. Use a different value.',
  '23503': 'This refers to something that does not exist in your company.',
  '42501': 'You do not have permission to do this.',
}

export function friendlyError(error: unknown): string {
  const e = error as ErrorLike
  if (!e) return 'Something went wrong.'
  if (e.message?.includes('Failed to fetch')) return 'No connection. Check your network and try again.'
  // A save whose reply was lost, then resubmitted with changes (design §5.1).
  if (e.message?.startsWith('op_key_reused')) {
    return 'This may already be saved. Check the supplier\'s bills and payments before entering it again.'
  }
  // A refund is capped at the Overpayment held with the party; peski returned at the Peski.
  if (e.message?.startsWith('refund_exceeds_overpayment')) {
    return e.message.replace(/^refund_exceeds_overpayment: t/, 'T') + '. A refund cannot be more than what was overpaid.'
  }
  if (e.message?.startsWith('peski_returned_exceeds_peski')) {
    return e.message.replace(/^peski_returned_exceeds_peski: t/, 'T') + '. Peski returned cannot be more than the peski not yet used.'
  }
  if (e.message?.startsWith('peski_with_unpaid')) {
    return 'This party has unpaid bills, so the payment pays them. Peski is only for money given before any bill.'
  }
  const prefixed = PREFIXED.find((p) => e.message?.startsWith(`${p}:`))
  if (prefixed) {
    const text = e.message!.slice(prefixed.length + 1).trim()
    return text.charAt(0).toUpperCase() + text.slice(1) + '.'
  }
  if (e.code === '23514') {
    const check = Object.keys(BY_CHECK).find((name) => e.message?.includes(name))
    if (check) return BY_CHECK[check]
  }
  // Our own RPC errors (P0001, 22023, ...) already carry a readable message.
  if (e.code && BY_CODE[e.code]) {
    if (e.code === '23505') {
      const constraint = Object.keys(BY_CONSTRAINT).find((name) => e.message?.includes(name))
      if (constraint) return BY_CONSTRAINT[constraint]
    }
    return BY_CODE[e.code]
  }
  return e.message || 'Something went wrong.'
}
