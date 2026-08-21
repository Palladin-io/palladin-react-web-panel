import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'

export function DeleteRoleDialog({
  open,
  roleName,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean
  roleName: string
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  if (!open) return null
  return (
    <ModalShell
      onClose={pending ? undefined : onClose}
      ariaLabel={t('permissions.deleteTitle', { name: roleName })}
      title={t('permissions.deleteTitle', { name: roleName })}
      width={420}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" className="flex-1" onClick={onClose} disabled={pending}>{t('common.cancel')}</Button>
          <Button variant="danger" size="sm" className="flex-[2]" onClick={onConfirm} disabled={pending}>
            {pending ? t('permissions.deleting') : t('permissions.delete')}
          </Button>
        </DialogFooter>
      }
    >
      <p className="text-ui text-[var(--cv-t2)]">{t('permissions.deleteBody')}</p>
    </ModalShell>
  )
}
