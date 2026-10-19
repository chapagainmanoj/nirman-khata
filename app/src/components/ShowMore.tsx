// The "Show more" button under a list loaded 50 rows at a time (lib/paging.ts).
import type { Paged } from '../lib/paging'
import { Button } from './ui'
import { t } from '../lib/i18n'

/** "Show more" under a paged list; nothing once every row is loaded. */
export function ShowMore({ list, total }: { list: Paged; total?: number | null }) {
  if (!list.hasMore) return null
  const shown = list.data?.length ?? 0
  return (
    <div className="mt-3 flex flex-col items-center gap-1">
      <Button variant="secondary" busy={list.loadingMore} onClick={list.loadMore}>{t('showMore.showMore')}</Button>
      <span className="text-xs text-subtle">{total ? t('showMore.showingShownOfTotal', { shown, total }) : t('showMore.showingShown', { shown })}</span>
    </div>
  )
}
