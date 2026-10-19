import { describe, expect, it, vi } from 'vitest'
import { fetchAllPages, TooManyRows } from './allPages'

/** A server holding `total` rows, capped at `cap` per answer like PostgREST's max_rows. */
function server(total: number, cap = 1000) {
  const rows = Array.from({ length: total }, (_, i) => i)
  return vi.fn(async (from: number, to: number, ordered: boolean) => {
    void ordered
    return rows.slice(from, Math.min(to + 1, from + cap))
  })
}

describe('fetchAllPages', () => {
  it('a short result is one plain request, in the function\'s own order', async () => {
    const page = server(10)
    expect(await fetchAllPages(page, { size: 1000 })).toHaveLength(10)
    expect(page).toHaveBeenCalledTimes(1)
    expect(page).toHaveBeenCalledWith(0, 999, false)
  })

  it('a full first page means there may be more: every page again, in a stable order', async () => {
    const page = server(2500)
    const all = await fetchAllPages(page, { size: 1000 })
    expect(all).toEqual(Array.from({ length: 2500 }, (_, i) => i))
    expect(page.mock.calls.slice(1)).toEqual([[0, 999, true], [1000, 1999, true], [2000, 2999, true]])
  })

  it('exactly one full page still checks the next, and stops on an empty one', async () => {
    const page = server(1000)
    expect(await fetchAllPages(page, { size: 1000 })).toHaveLength(1000)
    expect(page.mock.calls.at(-1)).toEqual([1000, 1999, true])
  })

  it('refuses rather than show part of a very long result', async () => {
    await expect(fetchAllPages(server(5000), { size: 1000, maxPages: 3 })).rejects.toBeInstanceOf(TooManyRows)
  })
})
