// Turn database and network errors into messages a site engineer can act on.
type ErrorLike = { message?: string; code?: string; details?: string } | null | undefined

const BY_CODE: Record<string, string> = {
  '23505': 'This already exists. Use a different value.',
  '23503': 'This refers to something that does not exist in your company.',
  '42501': 'You do not have permission to do this.',
}

export function friendlyError(error: unknown): string {
  const e = error as ErrorLike
  if (!e) return 'Something went wrong.'
  if (e.message?.includes('Failed to fetch')) return 'No connection. Check your network and try again.'
  // Our own RPC errors (P0001, 22023, ...) already carry a readable message.
  if (e.code && BY_CODE[e.code]) {
    if (e.code === '23505' && e.message?.includes('projects_company_id_code_key')) {
      return 'This project code is already used.'
    }
    return BY_CODE[e.code]
  }
  return e.message || 'Something went wrong.'
}
