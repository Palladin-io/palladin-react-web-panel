import type { ReactNode } from 'react'

export interface ScrollAreaProps {
  children: ReactNode
  className?: string
}

/**
 * Internal scroll section of a panel/page — THE app-wide scroll model.
 * Page chrome (header row, tab bar, search) stays pinned above; only this
 * section scrolls, with the subtle themed scrollbar. The negative right
 * margin keeps the scrollbar in the column gutter instead of pushing
 * content. Root of the host must be `flex h-full min-h-0 flex-col`.
 */
export function ScrollArea({ children, className = '' }: ScrollAreaProps) {
  return (
    <div
      className={`subtle-scrollbar -mr-2 min-h-0 flex-1 overflow-y-auto pb-4 pr-2 ${className}`}
    >
      {children}
    </div>
  )
}
