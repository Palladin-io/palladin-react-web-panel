import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import {
  ENTRY_ICON_COLORS,
  ENTRY_ICON_OPTIONS,
  isCustomIconUrl,
} from './entry-presentation'
import { hexWithAlpha } from './vault-color'

export interface EntryIconPickerProps {
  value: string | undefined
  onChange: (next: string | undefined) => void
  /** Accent colour used to highlight the selected swatch + custom upload chip. */
  selectedColor: string
  disabled?: boolean
  /**
   * Optional file-upload affordance. When provided a dashed upload tile is
   * rendered after the preset icons; selecting a file calls the callback
   * with the chosen `File` plus a `blob:` preview URL the caller can store
   * as the temporary icon value while the real upload happens in the
   * background.
   */
  onFileSelected?: (file: File, previewUrl: string) => void
}

/**
 * Horizontal strip of preset entry icons + optional upload tile. Shared
 * by the create-entry wizard and the entry detail page so both screens
 * stay visually aligned with the Astro reference and the icon set never
 * drifts between flows.
 */
export function EntryIconPicker({
  value,
  onChange,
  selectedColor,
  disabled = false,
  onFileSelected,
}: EntryIconPickerProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <fieldset>
      <legend className="mb-2 block text-[11px] font-semibold text-[var(--cv-label-text)]">
        {t('vault.entries.iconLabel')}
      </legend>
      <div className="flex justify-between">
        {ENTRY_ICON_OPTIONS.map((opt) => {
          const selected = !isCustomIconUrl(value) && opt === value
          const iconColor = ENTRY_ICON_COLORS[opt] ?? '#8A95A6'
          const background = selected
            ? hexWithAlpha(selectedColor, 0.15)
            : hexWithAlpha(iconColor, 0.10)
          const border = selected ? `2px solid ${selectedColor}` : 'none'
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(selected ? undefined : opt)}
              disabled={disabled}
              aria-pressed={selected}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors
                text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background, border }}
            >
              <Icon name={opt} size={14} color={selected ? selectedColor : iconColor} />
            </button>
          )
        })}

        {onFileSelected && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  const previewUrl = URL.createObjectURL(file)
                  onFileSelected(file, previewUrl)
                }
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              aria-label={t('vault.entries.iconUpload')}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors
                disabled:cursor-not-allowed disabled:opacity-40 text-[var(--cv-t3)]"
              style={
                isCustomIconUrl(value)
                  ? {
                      background: hexWithAlpha(selectedColor, 0.15),
                      border: `2px solid ${selectedColor}`,
                    }
                  : {
                      background: 'transparent',
                      border: '1.5px dashed var(--cv-input-border)',
                    }
              }
            >
              {isCustomIconUrl(value) ? (
                <img src={value} alt="" className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <Icon name="upload" size={14} />
              )}
            </button>
          </>
        )}
      </div>
    </fieldset>
  )
}
