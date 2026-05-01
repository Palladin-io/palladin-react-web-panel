import { useTranslation } from 'react-i18next'
import { VAULT_ICON_OPTIONS } from './vault-presentation'

export interface VaultIconPickerProps {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}

/**
 * Fieldset of selectable vault icons. Shared between the create dialog
 * and the settings form so both screens stay in sync when the icon set
 * grows or the chrome changes.
 */
export function VaultIconPicker({
  value,
  onChange,
  disabled = false,
}: VaultIconPickerProps) {
  const { t } = useTranslation()
  return (
    <fieldset>
      <legend className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#B8C5D4]">
        {t('vault.iconLabel')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {VAULT_ICON_OPTIONS.map((opt) => {
          const selected = opt === value
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              disabled={disabled}
              aria-pressed={selected}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors
                disabled:cursor-not-allowed disabled:opacity-40 ${
                selected
                  ? 'border-[#2EC4B6] bg-[rgba(46,196,182,0.12)]'
                  : 'border-[rgba(253,249,228,0.1)] bg-[rgba(253,249,228,0.04)] hover:bg-[rgba(253,249,228,0.08)]'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
