import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import {
  ENTRY_ICON_COLORS,
  ENTRY_ICON_OPTIONS,
  isCustomIconUrl,
} from './entry-presentation'
import { hexWithAlpha } from './vault-color'
import { IconColorBrowser } from './vault-icon-browser'
import { VAULT_ICON_ALL, VAULT_ICON_COLORS } from './vault-presentation'

export interface EntryIconPickerProps {
  value: string | undefined
  onChange: (next: string | undefined) => void
  /** Accent colour used to highlight the selected swatch + custom upload chip. */
  selectedColor: string
  /** Called when user picks a colour in the icon browser dialog. */
  onColorChange?: (color: string) => void
  disabled?: boolean
  /** Class applied to the icons row. Defaults to `flex justify-between`. */
  rowClassName?: string
  /**
   * Total number of slots in the row (presets + 3-dots, browser icon counts as a slot).
   * Default 10 = 9 presets + 3-dots. Pass higher values for grid layouts with more rows.
   */
  maxVisible?: number
  /**
   * Optional file-upload affordance. When provided a dashed upload tile is
   * rendered after the preset icons; selecting a file calls the callback
   * with the chosen `File` plus a `blob:` preview URL the caller can store
   * as the temporary icon value while the real upload happens in the
   * background.
   */
  onFileSelected?: (file: File, previewUrl: string) => void
}

export function EntryIconPicker({
  value,
  onChange,
  selectedColor,
  onColorChange,
  disabled = false,
  rowClassName = 'flex justify-between',
  maxVisible = 10,
  onFileSelected,
}: EntryIconPickerProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showBrowser, setShowBrowser] = useState(false)

  const iconColors = { ...VAULT_ICON_COLORS, ...ENTRY_ICON_COLORS }

  // candidatePresets = what would be visible when no browser icon is active
  const candidatePresets = ENTRY_ICON_OPTIONS.slice(0, maxVisible - 1) as readonly string[]
  // isFromBrowser: value is not in the visible preset range (so it gets its own slot before 3-dots)
  const isFromBrowser =
    !isCustomIconUrl(value) &&
    value != null &&
    !candidatePresets.includes(value)

  const isUrlIcon = isCustomIconUrl(value)
  const presetCount = isFromBrowser || isUrlIcon ? maxVisible - 2 : maxVisible - 1
  const visiblePresets = ENTRY_ICON_OPTIONS.slice(0, presetCount)

  return (
    <fieldset>
      <legend className="mb-2 block text-[11px] font-semibold text-[var(--cv-label-text)]">
        {t('vault.entries.iconLabel')}
      </legend>
      <div className={rowClassName}>
        {visiblePresets.map((opt) => {
          const selected = !isCustomIconUrl(value) && opt === value
          const iconColor = iconColors[opt] ?? '#8A95A6'
          const background = selected
            ? hexWithAlpha(selectedColor, 0.25)
            : hexWithAlpha(iconColor, 0.15)
          const border = selected ? `2px solid ${selectedColor}` : 'none'
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(selected ? undefined : opt)}
              disabled={disabled}
              aria-pressed={selected}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform
                hover:scale-105 text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background, border }}
            >
              <Icon name={opt} size={16} color={selected ? selectedColor : iconColor} />
            </button>
          )
        })}

        {/* Browser-picked icon in the 9th slot when active */}
        {isFromBrowser && value != null && (
          <button
            type="button"
            onClick={() => onChange(value as string)}
            disabled={disabled}
            aria-pressed={true}
            aria-label={t(`vault.iconName.${value as string}`, { defaultValue: (value as string).replace(/_/g, ' ') })}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform
              hover:scale-105 text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: hexWithAlpha(selectedColor, 0.25),
              border: `2px solid ${selectedColor}`,
            }}
          >
            <Icon name={value as string} size={16} color={selectedColor} />
          </button>
        )}

        {/* Favicon / uploaded image icon — its own selected slot before 3-dots */}
        {isUrlIcon && value != null && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            disabled={disabled}
            aria-pressed={true}
            aria-label={t('vault.entries.iconFromUrl')}
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl
              transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: hexWithAlpha(selectedColor, 0.25),
              border: `2px solid ${selectedColor}`,
            }}
          >
            <img src={value} alt="" className="h-5 w-5 rounded object-contain" />
          </button>
        )}

        {/* "More" button — always last */}
        <button
          type="button"
          onClick={() => setShowBrowser(true)}
          disabled={disabled}
          aria-label={t('vault.iconMore')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform
            hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: hexWithAlpha('#8A95A6', 0.15) }}
        >
          <Icon name="more_horiz" size={16} color="#8A95A6" />
        </button>
      </div>

      <IconColorBrowser
        showBrandIcons
        open={showBrowser}
        onClose={() => setShowBrowser(false)}
        icons={VAULT_ICON_ALL}
        iconColors={iconColors}
        currentIcon={isCustomIconUrl(value) ? undefined : value}
        onSelectIcon={(icon) => onChange(icon)}
        currentColor={onColorChange ? selectedColor : undefined}
        onSelectColor={onColorChange}
        gridCols={8}
      />

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
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border
                border-dashed border-[var(--cv-input-border)] px-3 py-2.5 text-[11px]
                text-[var(--cv-t3)] transition-colors hover:border-[var(--cv-t1)]
                hover:text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name="upload" size={13} />
              <span>
                {isCustomIconUrl(value)
                  ? t('vault.entries.iconChange')
                  : t('vault.entries.iconUpload')}
              </span>
            </button>
        </>
      )}
    </fieldset>
  )
}
