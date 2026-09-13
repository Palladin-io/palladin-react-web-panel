import type { ReactNode } from 'react'
import { ScrollArea } from './scroll-area'

export function SettingsSectionPage({
  title,
  subtitle,
  children,
}: {
  title?: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col p-4 text-[var(--cv-t1)]">
      {title && <header className="sr-only">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </header>}
      <ScrollArea>
        <div className="flex w-full flex-col gap-4">{children}</div>
      </ScrollArea>
    </div>
  )
}
