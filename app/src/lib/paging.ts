// Long lists load 50 rows at a time with a "Show more" button (req §22). A button, not endless
// scrolling: it works on slow phones and with screen readers, and the footer stays reachable.
import { useInfiniteQuery } from '@tanstack/react-query'

export const PAGE_SIZE = 50

/**
 * Like useQuery, but `data` is every row loaded so far. `fetchPage(from, to)` returns rows
 * `from..to` (inclusive, as PostgREST's range) in a stable order (end it with a unique column).
 */
export function usePaged<T>(
  queryKey: unknown[],
  fetchPage: (from: number, to: number) => Promise<T[]>,
  opts: { enabled?: boolean; pageSize?: number } = {},
) {
  const size = opts.pageSize ?? PAGE_SIZE
  const q = useInfiniteQuery({
    queryKey,
    enabled: opts.enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchPage(pageParam, pageParam + size - 1),
    getNextPageParam: (last, all) => (last.length < size ? undefined : all.length * size),
  })
  return {
    data: q.data?.pages.flat(),
    isPending: q.isPending,
    error: q.error,
    refetch: q.refetch,
    hasMore: q.hasNextPage,
    loadingMore: q.isFetchingNextPage,
    loadMore: () => void q.fetchNextPage(),
  }
}

export type Paged = Pick<ReturnType<typeof usePaged>, 'hasMore' | 'loadingMore' | 'loadMore'> & { data?: unknown[] }
