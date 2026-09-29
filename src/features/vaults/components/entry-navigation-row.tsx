import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { HOVERABLE_CARD_CLASSES, SELECTED_NAVIGATION_CARD_CLASSES } from '../../../shared/lib/styles'
import type { EntryType } from '../types'
import { VaultPresentationIcon } from './vault-presentation-icon'

interface EntryNavigationRowProps {
  vaultId: string
  entryId: string
  label: string
  type: EntryType
  icon: string | null
  subtitle: string
  isSelected: boolean
  fromEntries?: boolean
  disabled?: boolean
}

export const EntryNavigationRow = memo(function EntryNavigationRow({
  vaultId, entryId, label, type, icon, subtitle, isSelected, fromEntries = false, disabled = false,
}: EntryNavigationRowProps) {
  const content = <>
    <VaultPresentationIcon vaultId={vaultId} entryId={entryId} icon={icon} type={type} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-heading-sm font-semibold text-[var(--cv-t1)]">{label}</p>
      {subtitle && <p className="truncate text-meta text-[var(--cv-t3)]">{subtitle}</p>}
    </div>
  </>
  if (disabled) return <div className="flex items-center gap-3 rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] px-4 py-2.5">{content}</div>
  return <Link
    to="/vaults/$vaultId/entries/$entryId"
    params={{ vaultId, entryId }}
    search={fromEntries ? { from: 'entries' } : {}}
    aria-current={isSelected ? 'page' : undefined}
    className={`flex items-center gap-3 px-4 py-2.5 ${HOVERABLE_CARD_CLASSES}${isSelected ? ` ${SELECTED_NAVIGATION_CARD_CLASSES}` : ''}`}
  >{content}</Link>
})
