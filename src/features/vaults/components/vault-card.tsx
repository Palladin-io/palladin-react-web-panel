import { useTranslation } from 'react-i18next'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'
import { VaultIconCircle } from './vault-icon-circle'
import { DEFAULT_VAULT_COLOR, DEFAULT_VAULT_ICON } from './vault-presentation'
import { vaultFooterLabel, type VaultCardModel } from './vault-card-model'

export interface VaultCardProps {
  vault: VaultCardModel
  onClick: () => void
  statusLabel?: string
}

/**
 * Card representation of a vault in the list view. Two-zone layout:
 * a top row with the icon, name, entry count, and a right-aligned
 * active-grants summary, then a divider and a footer row with the
 * "updated X ago" timestamp.
 *
 * Pure presentational — no data fetching, no mutations. The parent
 * owns navigation via `onClick` so the card can be reused in different
 * contexts (search results, picker dialogs) without coupling it to a
 * route. Styling mirrors `../design/astro/.../VaultCard.astro` 1:1.
 */
export function VaultCard({ vault, onClick, statusLabel }: VaultCardProps) {
  const { t, i18n } = useTranslation()
  const footerLabel = vaultFooterLabel(vault, i18n.language, t)
  const accent = vault.color ?? DEFAULT_VAULT_COLOR
  const icon = vault.icon ?? DEFAULT_VAULT_ICON

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-w-[17.5rem] flex-1 flex-col items-stretch overflow-hidden text-left ${HOVERABLE_CARD_CLASSES}`}
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <VaultIconCircle vaultId={vault.id} icon={icon} color={accent} size={32} iconSize={16} />
          <div className="flex flex-col gap-0.5 text-left">
            <span className="text-heading-sm font-bold text-[var(--cv-t1)]">
              {vault.name}
            </span>
            <span className="text-micro text-[var(--cv-t3)]">
              {statusLabel ?? t('vault.entries', { count: vault.entryCount })}
            </span>
          </div>
        </div>
        <span className="text-meta text-[var(--cv-t3)]">
          {t('vault.grants', { count: vault.activeGrantCount })}
        </span>
      </div>

      {footerLabel ? (
        <div className="flex items-center justify-end border-t border-[var(--cv-divider)] bg-[var(--cv-card-footer)] px-4 py-2">
          <span className="text-meta text-[var(--cv-t3)]">{footerLabel}</span>
        </div>
      ) : null}
    </button>
  )
}
