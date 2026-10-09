// Turn database and network errors into messages a site engineer can act on.
type ErrorLike = { message?: string; code?: string; details?: string } | null | undefined

// Unique constraints with a more specific message than "This already exists".
const BY_CONSTRAINT: Record<string, string> = {
  projects_company_id_code_key: 'This project code is already used.',
  suppliers_unique_name: 'A supplier with this name already exists.',
  subcontractors_unique_name: 'A subcontractor with this name already exists.',
  payees_unique_name: 'A payee with this name already exists.',
  crews_unique_name: 'A crew with this name already exists for this project.',
}

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
