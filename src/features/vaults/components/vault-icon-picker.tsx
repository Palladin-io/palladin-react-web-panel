import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import { useVaultIconUpload } from '../use-vault-icon-upload'
import { hexWithAlpha } from './vault-color'
import { VAULT_ICON_COLORS, VAULT_ICON_OPTIONS } from './vault-presentation'

export interface VaultIconPickerProps {
  value: string
  onChange: (next: string) => void
  selectedColor?: string
  disabled?: boolean
  /** Edit mode: enables upload + immediate S3 upload tied to this vault. */
  vaultId?: string
  /**
   * Create mode: called with the selected File and a local blob preview URL.
   * The caller is responsible for uploading the file after the vault is created.
   */
  onFileSelected?: (file: File, previewUrl: string) => void
}

function isCustomUrl(value: string) {
  return value.startsWith('https://') || value.startsWith('blob:')
}

export function VaultIconPicker({
  value,
  onChange,
  selectedColor = '#FF4F4F',
  disabled = false,
  vaultId,
  onFileSelected,
}: VaultIconPickerProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { upload, isUploading, error } = useVaultIconUpload(
    vaultId ?? '',
    (publicUrl) => onChange(publicUrl),
  )

  return (
    <fieldset>
      <legend className="mb-2 block text-[11px] font-semibold text-[var(--cv-label-text)]">
        {t('vault.iconLabel')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {VAULT_ICON_OPTIONS.map((opt) => {
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
              className="flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors
                text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background, border }}
            >
              <Icon name={opt} size={14} />
            </button>
          )
        })}

        {(vaultId || onFileSelected) && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  if (vaultId) {
                    upload(file)
                  } else if (onFileSelected) {
                    const previewUrl = URL.createObjectURL(file)
                    onFileSelected(file, previewUrl)
                  }
                }
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              aria-label={t('vault.iconUpload')}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors
                disabled:cursor-not-allowed disabled:opacity-40 text-[var(--cv-t3)]"
              style={
                isCustomUrl(value)
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
              {isUploading ? (
                <Icon name="progress_activity" size={14} />
              ) : isCustomUrl(value) ? (
                <img
                  src={value}
                  alt=""
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
