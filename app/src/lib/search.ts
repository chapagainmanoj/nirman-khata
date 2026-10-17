// Typed searches sent to PostgREST as "contains" filters (challan, slip number, supplier).

/**
 * The term as typed, minus what PostgREST or LIKE would read as syntax: * and % (wildcards),
 * " and \ (quoting). A challan number never needs them; anything else is matched as typed.
 */
export function searchTerm(raw: string): string {
  return raw.replace(/[*%"\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * A PostgREST `or` filter: any column contains the term, or the row's id column is one of `ids`
 * (e.g. suppliers whose name matched). Values are quoted, so commas and brackets are safe.
 */
export function containsAny(term: string, columns: string[], idColumn?: string, ids: string[] = []): string {
  const parts = columns.map((c) => `${c}.ilike."*${term}*"`)
  if (idColumn && ids.length) parts.push(`${idColumn}.in.(${ids.join(',')})`)
  return parts.join(',')
}
