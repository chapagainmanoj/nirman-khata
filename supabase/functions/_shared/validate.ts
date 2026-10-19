// Checks on a request body. A body is whatever JSON the caller sent: a type annotation does not make
// it so, and `!!"false"` is true. Each helper returns a safe value or null for "not acceptable".
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

/** A string, or '' for anything else (missing, number, object). */
export const text = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Only `true` is true: "false", 1 and "yes" are not. */
export const flag = (v: unknown): boolean => v === true

/** A list of ids; missing is empty. Null when it is not a list of ids. */
export function uuidList(v: unknown): string[] | null {
  if (v === undefined || v === null) return []
  return Array.isArray(v) && v.every(isUuid) ? [...new Set(v)] : null
}

/** A list of allowed words; missing is empty. Null when it is not a list, or has a word not allowed. */
export function oneOfList<T extends string>(v: unknown, allowed: readonly T[]): T[] | null {
  if (v === undefined || v === null) return []
  return Array.isArray(v) && v.every((x) => (allowed as readonly unknown[]).includes(x)) ? [...new Set(v as T[])] : null
}

/** The JSON body as an object, or null when it is not one. */
export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}
