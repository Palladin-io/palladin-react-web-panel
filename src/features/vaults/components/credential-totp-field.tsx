import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { copyToClipboard } from '../../../shared/lib/clipboard'
import { generateTotp } from '../../../shared/crypto/totp'
import { newTotpField } from '../entry-blob'
import { type CustomField, type TotpParams } from '../types'
import { PopoverMenu, type MenuEntry } from './popover-menu'
import { TotpSetupInputs } from './totp-setup'
import { TotpDisplay } from './totp-display'

export interface CredentialTotpFieldProps {
  /** The pinned 2FA field, or null when the credential has no TOTP yet. */
  value: CustomField | null
  onChange: (next: CustomField | null) => void
  disabled?: boolean
}

/**
 * Dedicated 2FA (TOTP) surface on a credential, matching the approved redesign
 * and how Bitwarden/Proton present authenticator keys — not a generic custom
 * field. Three states: empty (a dashed prompt + "Add 2FA"), setup (paste/scan
 * controls), and configured (a card with issuer/account, a live code + countdown
 * ring, copy, and a ⋯ menu to replace or remove). The shared secret is never
 * shown. Storage is unchanged — the parent pins this into the first `fields[]`
 * TOTP entry.
 */
export function CredentialTotpField({ value, onChange, disabled }: CredentialTotpFieldProps) {
  const { t } = useTranslation()
  const params = value && typeof value.value === 'object' ? (value.value as TotpParams) : null
  const configured = !!params && params.secret.trim().length > 0
  const [setup, setSetup] = useState(false)

  const resolve = (next: TotpParams) => {
    onChange(value ? { ...value, value: next } : { ...newTotpField(), value: next })
    setSetup(false)
  }

  if (!configured && !setup) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--cv-input-border)] px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-[var(--cv-t1)]">{t('vault.entries.totp.emptyTitle')}</div>
          <div className="text-[11.5px] text-[var(--cv-t3)]">{t('vault.entries.totp.emptySubtitle')}</div>
        </div>
        <Button variant="accent" size="sm" icon="shield" onClick={() => setSetup(true)} disabled={disabled}>
          {t('vault.entries.totp.addCredential')}
        </Button>
      </div>
    )
  }

  if (setup || !params) {
    return (
      <div className="rounded-xl border border-[var(--cv-input-border)] p-3">
        <TotpSetupInputs
          onResolved={resolve}
          disabled={disabled}
          title={t('vault.entries.totp.credentialLabel')}
          onClose={() => setSetup(false)}
        />
      </div>
    )
  }

  return <ConfiguredCard params={params} onReplace={() => setSetup(true)} onRemove={() => onChange(null)} disabled={disabled} />
}

function ConfiguredCard({
  params,
  onReplace,
  onRemove,
  disabled,
}: {
  params: TotpParams
  onReplace: () => void
  onRemove: () => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const subtitle = [params.account, t('vault.entries.totp.rotates', { seconds: params.period })]
    .filter(Boolean)
    .join(' · ')

  const copyCode = async () => {
    const { code } = await generateTotp(params)
    const ok = await copyToClipboard(code)
    toast[ok ? 'success' : 'error'](ok ? t('vault.entries.copied', { label: t('vault.entries.totp.label') }) : t('vault.entries.copyFailed'))
  }

  const menu: MenuEntry[] = [
    { icon: 'content_copy', label: t('vault.entries.totp.copyCode'), onSelect: () => void copyCode() },
    { icon: 'refresh', label: t('vault.entries.totp.replace'), disabled, onSelect: onReplace },
    'separator',
    { icon: 'delete', label: t('vault.entries.totp.remove'), danger: true, disabled, onSelect: onRemove },
  ]

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] px-3 py-2.5">
      <span
        className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] text-[var(--cv-success)]"
        style={{ background: 'rgb(var(--cv-success-rgb) / 0.1)' }}
        aria-hidden
      >
        <Icon name="shield" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-[var(--cv-t1)]">
          {params.issuer || t('vault.entries.totp.label')}
        </div>
        <div className="truncate text-[11.5px] text-[var(--cv-t3)]">{subtitle}</div>
      </div>
      <TotpDisplay params={params} compact tone="success" />
      <PopoverMenu
        trigger={<Icon name="more_horiz" size={16} />}
        items={menu}
        ariaLabel={t('common.moreActions')}
        disabled={disabled}
      />
    </div>
  )
}
