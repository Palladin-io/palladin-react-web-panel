import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import { hexWithAlpha } from './vault-color'
import { IconColorBrowser } from './vault-icon-browser'
import { VAULT_ICON_ALL, VAULT_ICON_COLORS, VAULT_ICON_OPTIONS } from './vault-presentation'

export interface VaultIconPickerProps {
  value: string
  onChange: (next: string) => void
  /** Called when user picks a colour in the icon browser dialog. */
  onColorChange?: (color: string) => void
  selectedColor?: string
  disabled?: boolean
  /**
   * Create mode: called with the selected File and a local blob preview URL.
   * The caller is responsible for uploading the file after the vault is created.
   */
  onFileSelected?: (file: File, previewUrl: string) => void
  /**
   * Class applied to the icons grid. Defaults to `flex flex-wrap gap-2`.
   * Pass e.g. `"grid grid-cols-5 gap-1.5 justify-items-center"` for a fixed grid layout.
   */
  rowClassName?: string
}

function isCustomUrl(value: string) {
  return value.startsWith('blob:')
}

export function VaultIconPicker({
  value,
  onChange,
  onColorChange,
  selectedColor = '#EB4747',
  disabled = false,
  onFileSelected,
  rowClassName = 'flex flex-wrap gap-2',
}: VaultIconPickerProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showBrowser, setShowBrowser] = useState(false)

  const isFromBrowser =
    !isCustomUrl(value) && !(VAULT_ICON_OPTIONS as readonly string[]).includes(value)

  return (
    <fieldset>
      <legend className="mb-2 block text-meta font-semibold text-[var(--cv-label-text)]">
        {t('vault.iconLabel')}
      </legend>
      <div className={rowClassName}>
        {(isFromBrowser ? VAULT_ICON_OPTIONS.slice(0, 8) : VAULT_ICON_OPTIONS).map((opt) => {
          const selected = !isCustomUrl(value) && opt === value
          const iconColor = VAULT_ICON_COLORS[opt] ?? '#8A95A6'
          const background = selected
            ? hexWithAlpha(selectedColor, 0.15)
            : hexWithAlpha(iconColor, 0.10)
          const border = selected ? `2px solid ${selectedColor}` : 'none'
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={t(`vault.iconName.${opt}`, { defaultValue: opt })}
              className="flex h-8 w-8 items-center justify-center rounded-[0.625rem] transition-colors
                text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background, border }}
            >
              <Icon name={opt} size={14} color={selected ? selectedColor : iconColor} />
            </button>
          )
        })}

        {/* Browser-picked icon in the 9th slot when active */}
        {isFromBrowser && (
          <button
            type="button"
            onClick={() => onChange(value)}
            disabled={disabled}
            aria-pressed={true}
            aria-label={t(`vault.iconName.${value}`, { defaultValue: value.replace(/_/g, ' ') })}
            className="flex h-8 w-8 items-center justify-center rounded-[0.625rem] transition-colors
              text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: hexWithAlpha(selectedColor, 0.15),
              border: `2px solid ${selectedColor}`,
            }}
          >
            <Icon name={value} size={14} color={selectedColor} />
          </button>
        )}

        {/* "More" button — always last */}
        <button
          type="button"
          onClick={() => setShowBrowser(true)}
          disabled={disabled}
          aria-label={t('vault.iconMore')}
          className="flex h-8 w-8 items-center justify-center rounded-[0.625rem] transition-colors
            disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: hexWithAlpha('#8A95A6', 0.10) }}
        >
          <Icon name="more_horiz" size={14} color="#8A95A6" />
        </button>
      </div>

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
              border-dashed border-[var(--cv-input-border)] px-3 py-2.5 text-meta
              text-[var(--cv-t3)] transition-colors hover:border-[var(--cv-t1)]
              hover:text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="upload" size={13} />
            <span>{isCustomUrl(value) ? t('vault.iconChange') : t('vault.iconUpload')}</span>
          </button>
        </>
      )}

      <IconColorBrowser
        showBrandIcons
        open={showBrowser}
        onClose={() => setShowBrowser(false)}
        icons={VAULT_ICON_ALL}
        iconColors={VAULT_ICON_COLORS}
        currentIcon={isCustomUrl(value) ? undefined : value}
        onSelectIcon={(icon) => { if (icon) onChange(icon) }}
        currentColor={onColorChange ? selectedColor : undefined}
        onSelectColor={onColorChange}
      />
    </fieldset>
  )
}
