import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/button'
import { DialogFooter } from '../../shared/components/dialog-footer'
import { ModalShell } from '../../shared/components/modal-shell'
import { WarningZone } from '../../shared/components/warning-zone'

export interface DenyAgentDialogProps {
  open: boolean
  agentName: string
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
export function DenyAgentDialog({ open, agentName, isPending, onConfirm, onCancel }: DenyAgentDialogProps) {
  const { t } = useTranslation()
  if (!open) return null
  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('agents.denyConfirmTitle')}
      width={440}
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
          {t('agents.denyConfirmTitle')}
        </h2>
        <p className="text-[12px] text-[var(--cv-t2)]">
          {t('agents.denyConfirmBody', { name: agentName })}
        </p>

        <WarningZone title={t('agents.denyWarningTitle')}>
          {t('agents.denyWarningBody')}
        </WarningZone>

        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={isPending} className="flex-1">
            {t('agents.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={isPending} className="flex-[2]">
            {isPending ? t('agents.deactivating') : t('agents.denyConfirmAction')}
          </Button>
        </DialogFooter>
      </div>
    </ModalShell>
  )
}
