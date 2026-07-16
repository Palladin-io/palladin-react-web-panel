import type { ReactNode } from 'react'
import { Icon } from './icon'

export interface EmptyStateProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  icon?: string
  className?: string
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-2xl border border-dashed
        border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center ${className}`}
    >
      {icon ? <Icon name={icon} size={28} color="var(--cv-t3)" /> : null}
      <p className="text-ui font-medium text-[var(--cv-t2)]">{title}</p>
      {description ? (
        <p className="max-w-lg text-meta text-[var(--cv-t3)]">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
