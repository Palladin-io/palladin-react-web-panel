import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { newTotpField } from '../entry-blob'
import { type CustomField, type TotpParams } from '../types'
import { TotpSetup } from './totp-setup'

export interface CredentialTotpFieldProps {
  /** The pinned 2FA field, or null when the credential has no TOTP yet. */
  value: CustomField | null
  onChange: (next: CustomField | null) => void
  disabled?: boolean
}

/**
 * Dedicated "2FA secret (TOTP)" row on a credential — a first-class field under
 * the password, matching how Bitwarden/Proton surface authenticator keys (not a
 * generic custom field). Collapsed by default to a subtle add button; once
 * present it shows the {@link TotpSetup} (paste/scan) which itself collapses to
 * a live code. A trailing remove button clears it. Storage is unchanged — the
 * parent pins this into the first `fields[]` TOTP entry.
 */
export function CredentialTotpField({ value, onChange, disabled }: CredentialTotpFieldProps) {
  const { t } = useTranslation()

  if (!value) {
    return (
      <Button
        variant="ghost"
        size="sm"
        icon="lock_clock"
        onClick={() => onChange(newTotpField())}
        disabled={disabled}
        className="self-start"
      >
        {t('vault.entries.totp.addCredential')}
      </Button>
    )
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-[11px] font-semibold text-[var(--cv-label-text)]">
          {t('vault.entries.totp.credentialLabel')}
        </label>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-label={t('vault.entries.totp.remove')}
          title={t('vault.entries.totp.remove')}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--cv-t3)]
            transition-colors hover:bg-[var(--cv-btn-ghost-hover)] hover:text-[var(--cv-t1)]
            disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="close" size={15} />
        </button>
      </div>
      <TotpSetup
        value={value.value as TotpParams}
        onChange={(params) => onChange({ ...value, value: params })}
        disabled={disabled}
      />
    </div>
  )
}
