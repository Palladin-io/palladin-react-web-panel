import { useTranslation } from 'react-i18next'
import { GRANT_MODE_FULL, GRANT_MODE_GRANULAR, type GrantMode } from '../types'

export interface VaultModeSelectorProps {
  value: GrantMode
  onChange: (next: GrantMode) => void
  canUseFullMode: boolean
  disabled?: boolean
  /**
   * When `true`, render each option with its description text underneath
   * the label (used in the create wizard where the user is choosing for
   * the first time). The settings form passes `false` to keep the row
   * compact since the user already understands what they picked.
   */
  showDescriptions?: boolean
}

/**
 * Two-card radio group for picking the vault grant mode. Used by the
 * create dialog (with descriptions) and by the settings form (compact).
 * Locking is driven by `canUseFullMode` — when the user lacks the
 * permission, the Full option becomes disabled and shows the Pro badge.
 */
export function VaultModeSelector({
  value,
  onChange,
  canUseFullMode,
  disabled = false,
  showDescriptions = false,
}: VaultModeSelectorProps) {
  const { t } = useTranslation()
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#B8C5D4]">
        {t('vault.modeLabel')}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <ModeOption
          label={t('vault.modeFull')}
          description={
            showDescriptions ? t('vault.modeFullDescription') : undefined
          }
          selected={value === GRANT_MODE_FULL}
          locked={!canUseFullMode}
          lockedLabel={t('vault.modeFullPro')}
          disabled={disabled || !canUseFullMode}
          onClick={() => canUseFullMode && onChange(GRANT_MODE_FULL)}
        />
        <ModeOption
          label={t('vault.modeGranular')}
          description={
            showDescriptions ? t('vault.modeGranularDescription') : undefined
          }
          selected={value === GRANT_MODE_GRANULAR}
          disabled={disabled}
          onClick={() => onChange(GRANT_MODE_GRANULAR)}
        />
      </div>
    </fieldset>
  )
}

interface ModeOptionProps {
  label: string
  description?: string
  selected: boolean
  locked?: boolean
  lockedLabel?: string
  disabled: boolean
  onClick: () => void
}

function ModeOption({
  label,
  description,
  selected,
  locked,
  lockedLabel,
  disabled,
  onClick,
}: ModeOptionProps) {
  const borderClass = selected
    ? 'border-[#2EC4B6] bg-[rgba(46,196,182,0.08)]'
    : 'border-[rgba(253,249,228,0.1)] bg-[rgba(253,249,228,0.04)]'
  const layoutClass = description
    ? 'flex flex-col gap-1'
    : 'flex items-center justify-between'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`${layoutClass} rounded-lg border px-3 py-2.5 text-left transition-colors
        disabled:cursor-not-allowed disabled:opacity-60 ${borderClass}`}
    >
      {description ? (
        <>
          <span className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#FDF9E4]">{label}</span>
            {locked && lockedLabel ? <ProBadge label={lockedLabel} /> : null}
          </span>
          <span className="text-[11px] text-[#6B7A8E]">{description}</span>
        </>
      ) : (
        <>
          <span className="text-sm font-semibold text-[#FDF9E4]">{label}</span>
          {locked && lockedLabel ? <ProBadge label={lockedLabel} /> : null}
        </>
      )}
    </button>
  )
}

function ProBadge({ label }: { label: string }) {
  return (
    <span
      className="rounded-full border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.12)]
        px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#F59E0B]"
    >
      {label}
    </span>
  )
}
