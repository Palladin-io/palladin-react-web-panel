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
 *
 * Selected swatch is marked with a 2px text-token border, mirroring the
 * Astro `selectedColorBorder` styling so the picker reads identically
 * across design and implementation.
 */
export function VaultColorPicker({
  value,
  onChange,
  disabled = false,
}: VaultColorPickerProps) {
  const { t } = useTranslation()
  return (
    <fieldset>
      <legend className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--cv-label-text)]">
        {t('vault.colorLabel')}
      </legend>
      <div className="flex flex-wrap gap-2.5">
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
              className="h-6 w-6 rounded-full transition-transform disabled:cursor-not-allowed
                disabled:opacity-40"
              style={{
                backgroundColor: opt,
                border: selected ? '2px solid var(--cv-t1)' : '2px solid transparent',
              }}
            />
          )
        })}
      </div>
    </fieldset>
  )
}
