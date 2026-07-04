import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { useInfiniteScroll } from '../../../shared/hooks/use-infinite-scroll'

export interface EntriesLoadMoreProps {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  /** True when the previous auto-load failed — switches to a manual retry. */
  isError: boolean
  /** Stable loader (TanStack Query's `fetchNextPage`). */
  onLoadMore: () => void
}

/**
 * Bottom-of-list loader for the entries lists. A sentinel auto-fetches the next
 * page via {@link useInfiniteScroll} as it nears the viewport, showing a row
 * skeleton while loading. On a failed page load it stops auto-loading and shows
 * a manual "Load more" retry — the only path that surfaces the button.
 */
export function EntriesLoadMore({
  hasNextPage,
  isFetchingNextPage,
  isError,
  onLoadMore,
}: EntriesLoadMoreProps) {
  const { t } = useTranslation()
  const sentinelRef = useRef<HTMLDivElement>(null)

  useInfiniteScroll(sentinelRef, {
    onLoadMore,
    enabled: hasNextPage && !isFetchingNextPage && !isError,
  })

  if (!hasNextPage) return null

  return (
    <div ref={sentinelRef} className="pt-2">
      {isError ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[11px] text-[var(--cv-primary)]">
            {t('vault.entries.loadMoreError')}
          </p>
          <Button
            variant="subtle"
            size="sm"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
          >
            {t('vault.entries.loadMore')}
          </Button>
        </div>
      ) : (
        <div
          className="h-14 animate-pulse rounded-xl bg-[var(--cv-card-bg)]"
          aria-label={t('vault.entries.loadingMore')}
        />
      )}
    </div>
  )
}
