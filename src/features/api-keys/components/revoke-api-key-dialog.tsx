import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { ModalShell } from '../../../shared/components/modal-shell'

export interface RevokeApiKeyDialogProps {
  open: boolean
  keyName: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation dialog for the destructive revoke action. Revoking is
 * irreversible — any agent authenticating with this key loses access
 * immediately — so the action is gated behind an explicit confirm.
 */
export function RevokeApiKeyDialog({
  open,
  keyName,
  isPending,
  onConfirm,
  onCancel,
}: RevokeApiKeyDialogProps) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('apiKeys.revokeConfirmTitle', { name: keyName })}
      width={420}
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
          {t('apiKeys.revokeConfirmTitle', { name: keyName })}
        </h2>
        <p className="text-[12px] text-[var(--cv-t2)]">
          {t('apiKeys.revokeConfirmText')}
        </p>

        <div className="mt-1 flex items-center gap-2">
          <Button
            variant="subtle"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1"
          >
            {t('apiKeys.cancel')}
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-[2]"
          >
            {isPending ? t('apiKeys.revoking') : t('apiKeys.confirmRevoke')}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
