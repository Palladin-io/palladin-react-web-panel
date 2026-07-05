import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
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
}: {
  onResolved: (params: TotpParams) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [raw, setRaw] = useState('')
  const [error, setError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  return (
    <div
      className="flex flex-col gap-2"
      onPaste={(event) => {
        const image = [...event.clipboardData.items].find((i) => i.type.startsWith('image/'))
        if (image) {
          event.preventDefault()
          void handleFile(image.getAsFile() ?? undefined)
        }
      }}
    >
      {/* Scan-QR as a subtle text action at the top of the setup (near the
          header/close), not a heavy button — matches the app's red text actions. */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--cv-primary)]
            transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="qr_code_scanner" size={13} />
          {t('vault.entries.totp.uploadQr')}
        </button>
      </div>
      <FormInput
        id="totp-seed-input"
        label={t('vault.entries.totp.setupLabel')}
        labelClassName="sr-only"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value)
          setError(false)
        }}
        onBlur={() => resolveText(raw)}
        placeholder={t('vault.entries.totp.setupPlaceholder')}
        autoComplete="off"
        disabled={disabled}
        monospace
        error={error}
      />
      <FieldFeedback visible={error} color="red">
        {t('vault.entries.totp.invalidSeed')}
      </FieldFeedback>
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
