import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import { useVaults, VaultCard } from '../../vaults'

/** How many vaults the rail surfaces before "View all". */
const TOP_LIMIT = 4

/**
 * "Your vaults" rail card — the first few vaults, reusing the canonical
 * `VaultCard` (same control as the vault list) so the look stays in lockstep.
 * A "View all" link leads to the full vault list.
 */
export function YourVaultsCard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const vaults = useVaults()

  const top = (vaults.data?.vaults ?? []).slice(0, TOP_LIMIT)

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--cv-t1)]">
          {t('dashboard.yourVaults.title')}
        </span>
        <Link
          to="/vaults"
          className="text-xs font-medium text-[var(--cv-primary)] hover:underline"
        >
          {t('dashboard.viewAll')}
        </Link>
      </div>

      {top.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed
            border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-6 text-center"
        >
          <Icon name="shield" size={24} color="var(--cv-t3)" />
          <p className="text-[11px] text-[var(--cv-t3)]">
            {t('dashboard.yourVaults.empty')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {top.map((vault) => (
            <VaultCard
              key={vault.id}
              vault={vault}
              onClick={() =>
                navigate({ to: '/vaults/$vaultId', params: { vaultId: vault.id } })
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}
