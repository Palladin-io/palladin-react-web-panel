import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { ModalShell } from '../../../shared/components/modal-shell'

export interface ApproveAgentDialogProps {
  open: boolean
  agentName: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation dialog for approving a pending agent. Approval grants the
 * agent access to organization vaults, so it is gated behind an explicit
 * confirm step.
 */
export function ApproveAgentDialog({
  open,
  agentName,
  isPending,
  onConfirm,
  onCancel,
}: ApproveAgentDialogProps) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('agents.approveConfirmTitle')}
      width={420}
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
          {t('agents.approveConfirmTitle')}
        </h2>
        <p className="text-[12px] text-[var(--cv-t2)]">
          {t('agents.approveConfirmBody', { name: agentName })}
        </p>

        <div className="mt-1 flex items-center gap-2">
          <Button
            variant="subtle"
            size="md"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1"
          >
            {t('agents.cancel')}
          </Button>
          <Button
            variant="accent"
            size="md"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-[2]"
          >
            {isPending ? t('agents.approving') : t('agents.approve')}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
