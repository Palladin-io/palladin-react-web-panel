import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import { useVaultIconUpload } from '../use-vault-icon-upload'
import { hexWithAlpha } from './vault-color'
import { VAULT_ICON_OPTIONS } from './vault-presentation'

export interface VaultIconPickerProps {
  value: string
  onChange: (next: string) => void
  selectedColor?: string
  disabled?: boolean
  /**
   * When provided, enables the "Upload custom" option.
   * Only available in edit mode — vaultId is unknown during vault creation.
   */
  vaultId?: string
}

function isCustomUrl(value: string) {
  return value.startsWith('https://')
}

export function VaultIconPicker({
  value,
  onChange,
  selectedColor = '#FF4F4F',
  disabled = false,
  vaultId,
}: VaultIconPickerProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { upload, isUploading, error } = useVaultIconUpload(
    vaultId ?? '',
    (publicUrl) => onChange(publicUrl),
  )

  return (
    <fieldset>
      <legend className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--cv-label-text)]">
        {t('vault.iconLabel')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {VAULT_ICON_OPTIONS.map((opt) => {
          const selected = !isCustomUrl(value) && opt === value
          const background = selected
            ? hexWithAlpha(selectedColor, 0.15)
            : 'var(--cv-bg-subtle)'
          const borderColor = selected ? selectedColor : 'var(--cv-border)'
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
              <Icon name={opt} size={14} color={selected ? selectedColor : undefined} className={selected ? '' : 'text-[var(--cv-t2)]'} />
            </button>
          )
        })}

        {vaultId && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) upload(file)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              aria-label={t('vault.iconUpload')}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors
                disabled:cursor-not-allowed disabled:opacity-40 text-[var(--cv-t2)]"
              style={{
                background: isCustomUrl(value)
                  ? hexWithAlpha(selectedColor, 0.15)
                  : 'var(--cv-bg-subtle)',
                borderColor: isCustomUrl(value) ? selectedColor : 'var(--cv-border)',
              }}
            >
              {isUploading ? (
                <Icon name="progress_activity" size={14} />
              ) : isCustomUrl(value) ? (
                <img
                  src={value}
                  alt="custom icon"
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : (
                <Icon name="upload" size={14} />
              )}
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="mt-1.5 text-[11px] text-red-400">{error}</p>
      )}
    </fieldset>
  )
}
