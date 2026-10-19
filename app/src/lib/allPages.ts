// Every row of a long result, not only the first 1,000. The API answers at most max_rows rows
// (supabase/config.toml, and the hosted project's setting), for tables and functions alike, and
// says nothing when it cut a result short: a year's report or a supplier's khata would just stop.

/** More rows than one screen or file should hold: the filters need narrowing. */
export class TooManyRows extends Error {
  readonly limit: number
  constructor(limit: number) {
    super(`too_many_rows: more than ${limit}`)
    this.name = 'TooManyRows'
    this.limit = limit
  }
}

/**
 * `fetchPage(from, to, ordered)` returns rows from..to. First one plain request: most results are
 * short, and keep the function's own order. A full page means there may be more, so every page is
 * read again with `ordered` (a stable sort ending in a unique column), so no row is skipped or
 * repeated where pages meet.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number, ordered: boolean) => Promise<T[]>,
  { size, maxPages = 50 }: { size: number; maxPages?: number },
): Promise<T[]> {
  const first = await fetchPage(0, size - 1, false)
  if (first.length < size) return first
  const all: T[] = []
  for (let page = 0; ; page++) {
    if (page >= maxPages) throw new TooManyRows(maxPages * size)
    const rows = await fetchPage(page * size, (page + 1) * size - 1, true)
    all.push(...rows)
    if (rows.length < size) return all
  }
}
