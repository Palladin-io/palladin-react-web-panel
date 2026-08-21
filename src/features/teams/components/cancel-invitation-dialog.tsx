import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'

export function CancelInvitationDialog({
  email,
  isPending,
  onConfirm,
  onClose,
}: {
  email: string | null
  isPending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  if (!email) return null

  return (
    <ModalShell
      onClose={isPending ? undefined : onClose}
      ariaLabel={t('team.invitations.cancelTitle')}
      title={t('team.invitations.cancelTitle')}
      width={420}
      footer={
        <DialogFooter>
          <Button
            variant="subtle"
            size="sm"
            className="flex-1"
            onClick={onClose}
            disabled={isPending}
          >
            {t('common.keep')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="flex-[2]"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending
              ? t('team.invitations.cancelling')
              : t('team.invitations.confirmCancel')}
          </Button>
        </DialogFooter>
      }
    >
      <p className="text-ui text-[var(--cv-t2)]">
        {t('team.invitations.cancelDescription', { email })}
      </p>
    </ModalShell>
  )
}
