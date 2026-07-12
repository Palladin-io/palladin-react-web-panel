import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/button'
import { DialogFooter } from '../../shared/components/dialog-footer'
import { ModalShell } from '../../shared/components/modal-shell'
import { WarningZone } from '../../shared/components/warning-zone'

export interface DenyAgentDialogProps {
  open: boolean
  agentName: string
  /** Key the agent enrolled with — deep-links the warning to that exact key. */
  apiKeyId?: string
  /** Masked suffix of that key (`pl_••••{suffix}`); never the plaintext key. */
  apiKeySuffix?: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirm step for denying a pending agent from the inbox. Denying === the
 * agent is deactivated, so this is a destructive action that deserves a
 * deliberate confirm. The WarningZone exists because an unexpected agent
 * enrollment can mean a leaked API key — we point the user at remediation.
 */
export function DenyAgentDialog({
  open,
  agentName,
  apiKeyId,
  apiKeySuffix,
  isPending,
  onConfirm,
  onCancel,
}: DenyAgentDialogProps) {
  const { t } = useTranslation()
  if (!open) return null
  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('agents.denyConfirmTitle')}
      title={t('agents.denyConfirmTitle')}
      width={440}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={isPending} className="flex-1">
            {t('agents.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={isPending} className="flex-[2]">
            {isPending ? t('agents.deactivating') : t('agents.denyConfirmAction')}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ui text-[var(--cv-t2)]">
          {t('agents.denyConfirmBody', { name: agentName })}
        </p>

        <WarningZone title={t('agents.denyWarningTitle')}>
          {t('agents.denyWarningBody')}
          {apiKeyId ? (
            <Link
              to="/api-keys/$keyId"
              params={{ keyId: apiKeyId }}
              onClick={onCancel}
              className="mt-1 block font-semibold text-[var(--cv-primary)] underline-offset-2 hover:underline"
            >
              {t('agents.denyWarningOpenKey')}{' '}
              <span className="font-mono">pl_••••{apiKeySuffix || '••••'}</span> →
            </Link>
          ) : (
            <Link
              to="/api-keys"
              onClick={onCancel}
              className="mt-1 block font-semibold text-[var(--cv-primary)] underline-offset-2 hover:underline"
            >
              {t('agents.denyWarningLink')}
            </Link>
          )}
        </WarningZone>
      </div>
    </ModalShell>
  )
}
