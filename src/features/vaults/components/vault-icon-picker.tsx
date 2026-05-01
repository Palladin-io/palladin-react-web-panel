import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import { hexWithAlpha } from './vault-color'
import { VAULT_ICON_OPTIONS } from './vault-presentation'

export interface VaultIconPickerProps {
  value: string
  onChange: (next: string) => void
  /** Accent colour used to highlight the selected icon. Defaults to red. */
  selectedColor?: string
  disabled?: boolean
}

/**
 * Fieldset of selectable vault icons. Shared between the create dialog
 * and the settings form so both screens stay in sync when the icon set
 * grows or the chrome changes. Selected icon adopts the vault's accent
 * colour to mirror the Astro design system.
 */
export function VaultIconPicker({
  value,
  onChange,
  selectedColor = '#FF4F4F',
  disabled = false,
}: VaultIconPickerProps) {
  const { t } = useTranslation()
  return (
    <fieldset>
      <legend className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#C4BAA1]">
        {t('vault.iconLabel')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {VAULT_ICON_OPTIONS.map((opt) => {
          const selected = opt === value
          const background = selected
            ? hexWithAlpha(selectedColor, 0.15)
            : 'rgba(253,249,228,0.06)'
          const borderColor = selected ? selectedColor : 'rgba(253,249,228,0.08)'
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={opt}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors
                disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background, borderColor }}
            >
              <Icon name={opt} size={14} color={selected ? selectedColor : '#C4BAA1'} />
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
