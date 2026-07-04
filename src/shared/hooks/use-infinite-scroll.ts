import { useEffect, type RefObject } from 'react'

export interface UseInfiniteScrollOptions {
  /**
   * Called when the sentinel scrolls into view. Pass a stable reference (e.g.
   * TanStack Query's `fetchNextPage`) so the observer isn't torn down every
   * render.
   */
  onLoadMore: () => void
  /**
   * Observe only while true. Set to `hasNextPage && !isFetchingNextPage &&
   * !isFetchNextPageError` so auto-loading pauses during a fetch and stops after
   * an error (the caller then shows a manual retry).
   */
  enabled: boolean
  /** Prefetch distance before the sentinel is actually visible. */
  rootMargin?: string
}

/**
 * Auto-load the next page of a list when a sentinel element nears the viewport.
 * Attach `sentinelRef` to a node rendered at the bottom of the list; when it
 * intersects (within `rootMargin`), `onLoadMore` fires. Disabling during a fetch
 * and re-enabling after it lets successive pages chain while the sentinel stays
 * in view. No-op where `IntersectionObserver` is unavailable (e.g. jsdom), so
 * callers must keep a manual fallback for the error path.
 */
export function useInfiniteScroll(
  sentinelRef: RefObject<Element | null>,
  { onLoadMore, enabled, rootMargin = '200px' }: UseInfiniteScrollOptions,
): void {
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !enabled || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore()
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [sentinelRef, onLoadMore, enabled, rootMargin])
}
