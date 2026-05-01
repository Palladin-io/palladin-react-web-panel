import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from './modal-shell'
import type { MockAgentGrant } from './vault-agent-grants-mock'

export interface RevokeGrantDialogProps {
  grant: MockAgentGrant | null
  vaultName: string
  onConfirm: (reason: string) => void
  onClose: () => void
}

/**
 * Revoke confirmation modal — design preview only. Once CVT-46 wires
 * the real grant API the parent will swap the `onConfirm` callback for
 * the mutation hook; this component stays the same.
 *
 * Renders nothing when `grant` is null so the parent can simply set the
 * grant being revoked instead of mounting/unmounting itself.
 */
export function RevokeGrantDialog({
  grant,
  vaultName,
  onConfirm,
  onClose,
}: RevokeGrantDialogProps) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  if (!grant) return null

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel={t('vault.agent.revokeDialogTitle')}
      width={320}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="cancel" size={16} color="#FF4F4F" />
          <h2 className="text-[15px] font-bold text-[#FDF9E4]">
            {t('vault.agent.revokeDialogTitle')}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="text-[#8A95A6] transition-colors hover:text-[#FDF9E4]"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <div
        className="mt-4 flex items-center gap-2.5 rounded-xl border px-3 py-2.5"
        style={{
          background: 'rgba(253,249,228,0.04)',
          borderColor: 'rgba(253,249,228,0.07)',
        }}
      >
        <span
          aria-hidden
          className="inline-flex h-8 w-8 items-center justify-center rounded-full
            text-[10px] font-bold"
          style={{ background: 'rgba(46,196,182,0.18)', color: '#2EC4B6' }}
        >
          {grant.agent.initials}
        </span>
        <div>
          <div className="text-[13px] font-semibold text-[#FDF9E4]">
            {grant.agent.name}
          </div>
          <div className="text-[11px] text-[#8A95A6]">
            {grant.mode === 'full'
              ? t('vault.agent.fullAccess')
              : t('vault.agent.granular')}{' '}
            · {vaultName}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <label
          htmlFor="revoke-reason"
          className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#C4BAA1]"
        >
          {t('vault.agent.revokeReasonLabel')}{' '}
          <span className="font-normal normal-case text-[#8A95A6]">
            {t('vault.agent.revokeReasonOptional')}
          </span>
        </label>
        <input
          id="revoke-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('vault.agent.revokeReasonPlaceholder')}
          className="w-full rounded-lg border border-[rgba(253,249,228,0.1)]
            bg-[rgba(253,249,228,0.04)] px-3 py-2 text-[12px] text-[#FDF9E4]
            placeholder:text-[#8A95A6] focus:border-[#FF4F4F] focus:outline-none"
        />
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button variant="subtle" onClick={onClose} className="flex-1">
          {t('vault.cancel')}
        </Button>
        <Button
          variant="accent"
          onClick={() => onConfirm(reason)}
          className="flex-[2]"
        >
          {t('vault.agent.confirmRevoke')}
        </Button>
      </div>
    </ModalShell>
  )
}
