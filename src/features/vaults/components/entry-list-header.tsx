import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'

interface EntryListHeaderProps {
  title: string
  count: number
  onAdd: () => void
  back?: ReactNode
  headingLevel?: 'h1' | 'h2'
}

export function EntryListHeader({ title, count, onAdd, back, headingLevel: Heading = 'h2' }: EntryListHeaderProps) {
  const { t } = useTranslation()
  return <div className="mb-4 flex h-10 shrink-0 items-center gap-2">
    {back}
    <div className="min-w-0 flex-1">
      <Heading className="truncate text-heading font-bold text-[var(--cv-t1)]">{title}</Heading>
      <p className="text-meta text-[var(--cv-t3)]">{t('vault.entries', { count })}</p>
    </div>
    <Button variant="accent" size="sm" icon="add" onClick={onAdd}>{t('vault.detail.addEntry')}</Button>
  </div>
}
