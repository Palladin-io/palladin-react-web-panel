import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { useInfiniteScroll } from '../hooks/use-infinite-scroll'

export interface LoadMoreSentinelProps {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  /** True when the previous auto-load failed — switches to a manual retry. */
  isError: boolean
  /** Stable loader (TanStack Query's `fetchNextPage`). */
  onLoadMore: () => void
}

/**
 * Bottom-of-list loader — THE pagination pattern for every paginated list.
 * A sentinel auto-fetches the next page via {@link useInfiniteScroll} as it
 * nears the viewport, showing a row skeleton while loading. On a failed page
 * load it stops auto-loading and shows a manual "Load more" retry — the only
 * path that surfaces the button.
 */
export function LoadMoreSentinel({
  hasNextPage,
  isFetchingNextPage,
  isError,
  onLoadMore,
}: LoadMoreSentinelProps) {
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
            {t('common.loadMoreError')}
          </p>
          <Button
            variant="subtle"
            size="sm"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
          >
            {t('common.loadMore')}
          </Button>
        </div>
      ) : (
        <div
          className="h-14 animate-pulse rounded-xl bg-[var(--cv-card-bg)]"
          aria-label={t('common.loadingMore')}
        />
      )}
    </div>
  )
}
