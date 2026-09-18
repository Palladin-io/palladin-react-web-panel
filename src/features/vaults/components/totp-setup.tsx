import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { FeedbackSlot, FormInput } from '../../../shared/components/form-field'
import { parseOtpauthUri, totpParamsFromSecret } from '../../../shared/crypto/totp'
import type { TotpParams } from '../types'
import { decodeQrImage } from './decode-qr'
import { TotpDisplay } from './totp-display'

export interface TotpSetupProps {
  value: TotpParams
  onChange: (next: TotpParams) => void
  disabled?: boolean
}

/**
 * Configure a TOTP seed three ways — paste an `otpauth://` URI, type a bare
 * base32 secret, or upload/paste a QR image (decoded in-browser). Once a valid
 * seed is set the control collapses to a live-code preview with a "Reconfigure"
 * affordance. All parsing/decoding is local; the seed never leaves the device.
 */
export function TotpSetup({ value, onChange, disabled }: TotpSetupProps) {
  const { t } = useTranslation()
  const configured = value.secret.trim().length > 0
  const [editing, setEditing] = useState(!configured)

  if (configured && !editing) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] px-3 py-2">
        <TotpDisplay params={value} compact />
        <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditing(true)} disabled={disabled}>
          {t('vault.entries.totp.reconfigure')}
        </Button>
      </div>
    )
  }

  return (
    <TotpSetupInputs
      onResolved={(params) => {
        onChange(params)
        setEditing(false)
      }}
      disabled={disabled}
    />
  )
}

/**
 * The seed-entry controls only (paste otpauth URI / base32 / QR upload) — no
 * live-code preview. Used by the credential 2FA card for its setup / replace
 * flow, where the configured state renders as a card rather than a preview.
 */
export function TotpSetupInputs({
  onResolved,
  disabled,
  title,
  onClose,
}: {
  onResolved: (params: TotpParams) => void
  disabled?: boolean
  /** When set, renders a header row (title + Scan-QR + close) so the QR action
   *  sits on the same line as the close button instead of a separate row. */
  title?: string
  onClose?: () => void
}) {
  const { t } = useTranslation()
  const [raw, setRaw] = useState('')
  const [error, setError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  const resolveText = (text: string): boolean => {
    const trimmed = text.trim()
    if (!trimmed) return false
    const params = parseOtpauthUri(trimmed) ?? totpParamsFromSecret(trimmed)
    if (params) {
      onResolved(params)
      setRaw('')
      setError(false)
      return true
    }
    setError(true)
    return false
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    const decoded = await decodeQrImage(file)
    if (!decoded || !resolveText(decoded)) setError(true)
  }

  const scanQrButton = (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      disabled={disabled}
      className="inline-flex h-6 items-center gap-1 text-meta font-medium text-[var(--cv-primary)]
        transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon name="qr_code_scanner" size={13} />
      {t('vault.entries.totp.uploadQr')}
    </button>
  )

  return (
    <div
      className="flex flex-col gap-1.5"
      onPaste={(event) => {
        const image = [...event.clipboardData.items].find((i) => i.type.startsWith('image/'))
        if (image) {
          event.preventDefault()
          void handleFile(image.getAsFile() ?? undefined)
        }
      }}
    >
      {onClose ? (
        // Header row: title on the left, Scan-QR + close aligned on the right —
        // the QR action shares the close button's line/height.
        <div className="flex items-center justify-between gap-2">
          <span className="text-meta font-semibold text-[var(--cv-label-text)]">{title}</span>
          <div className="flex items-center gap-2">
            {scanQrButton}
            <button
              type="button"
              onClick={onClose}
              disabled={disabled}
              aria-label={t('vault.cancel')}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--cv-icon-muted)]
                transition-colors hover:text-[var(--cv-t1)]"
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">{scanQrButton}</div>
      )}
      <div className="flex items-center gap-2">
        <FormInput
          id={inputId}
          label={t('vault.entries.totp.setupLabel')}
          labelClassName="sr-only"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            setError(false)
          }}
          onBlur={() => setError(!!raw.trim() && !(parseOtpauthUri(raw) ?? totpParamsFromSecret(raw)))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              resolveText(raw)
            }
          }}
          placeholder={t('vault.entries.totp.setupPlaceholder')}
          autoComplete="off"
          disabled={disabled}
          monospace
          error={error}
        />
        <Button size="sm" variant="subtle" icon="check" className="h-control! shrink-0" disabled={disabled || !raw.trim()} onClick={() => resolveText(raw)}>
          {t('vault.entries.totp.apply')}
        </Button>
      </div>
      <FeedbackSlot visible={error} color="red">
        {t('vault.entries.totp.invalidSeed')}
      </FeedbackSlot>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
