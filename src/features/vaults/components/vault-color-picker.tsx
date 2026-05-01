import { useTranslation } from 'react-i18next'
import { VAULT_COLOR_NAME_KEY, VAULT_COLOR_OPTIONS } from './vault-presentation'

export interface VaultColorPickerProps {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}

/**
 * Fieldset of selectable vault accent colours. Each swatch announces a
 * translated colour name to assistive tech (e.g. "Teal") rather than the
 * raw hex string, which would be meaningless to screen-reader users.
 */
export function VaultColorPicker({
  value,
  onChange,
  disabled = false,
}: VaultColorPickerProps) {
  const { t } = useTranslation()
  return (
    <fieldset>
      <legend className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#B8C5D4]">
        {t('vault.colorLabel')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {VAULT_COLOR_OPTIONS.map((opt) => {
          const selected = opt === value
          const nameKey = VAULT_COLOR_NAME_KEY[opt] ?? 'custom'
          const colorName = t(`vault.colorName.${nameKey}`)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              disabled={disabled}
              aria-label={t('vault.colorOption', { name: colorName })}
              aria-pressed={selected}
              className={`h-7 w-7 rounded-full border-2 transition-transform disabled:cursor-not-allowed
                disabled:opacity-40 ${
                selected ? 'scale-110 border-[#FDF9E4]' : 'border-transparent'
              }`}
              style={{ backgroundColor: opt }}
            />
          )
        })}
      </div>
    </fieldset>
  )
}
