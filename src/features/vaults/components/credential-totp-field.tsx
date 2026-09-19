import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ToggleSwitch } from '../../../shared/components/toggle-switch'
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
  agentAccess?: { allowed: boolean; onChange: (allowed: boolean) => void }
}

/**
 * Dedicated 2FA (TOTP) surface on a credential, matching the approved redesign
 * and how Bitwarden/Proton present authenticator keys — not a generic custom
 * field. Three states: empty (a dashed prompt + "Add 2FA"), setup (paste/scan
 * controls), and configured (a card with issuer/account, a live code + seconds
 * countdown, copy, and a ⋯ menu to replace or remove). The shared secret is never
 * shown. The parent preserves the original native/custom TOTP identity and
 * may expose an explicit grant-access choice.
 */
export function CredentialTotpField({ value, onChange, disabled, agentAccess }: CredentialTotpFieldProps) {
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
          <div className="text-ui text-[var(--cv-t1)]">{t('vault.entries.totp.emptyTitle')}</div>
          <div className="text-meta text-[var(--cv-t3)]">{t('vault.entries.totp.emptySubtitle')}</div>
        </div>
        <Button variant="accent" size="sm" icon="add" onClick={() => setSetup(true)} disabled={disabled}>
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

  return (
    <div className="flex flex-col gap-3">
      <ConfiguredCard params={params} onReplace={() => setSetup(true)} onRemove={() => onChange(null)} disabled={disabled} />
      {agentAccess && <div className="flex items-center justify-between gap-3 text-ui text-[var(--cv-t2)]">
        <span>{t('vault.entries.totp.agentAccess')}</span>
        <ToggleSwitch label={t('vault.entries.totp.agentAccess')} checked={agentAccess.allowed}
          onChange={agentAccess.onChange} disabled={disabled} />
      </div>}
    </div>
  )
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] px-3 py-2.5">
      <div className="min-w-0 flex-1 basis-32">
        <div className="truncate text-ui text-[var(--cv-t1)]">
          {params.issuer || t('vault.entries.totp.label')}
        </div>
        {params.account && <div className="truncate text-meta text-[var(--cv-t3)]">{params.account}</div>}
      </div>
      <div className="flex items-center gap-1">
        <TotpDisplay params={params} compact />
        <PopoverMenu
          trigger={<Icon name="more_horiz" size={16} />}
          items={menu}
          ariaLabel={t('common.moreActions')}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
