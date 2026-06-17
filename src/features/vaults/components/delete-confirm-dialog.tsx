import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'

export interface DeleteConfirmDialogProps {
  open: boolean
  vaultName: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmDialog({
  open,
  vaultName,
  isPending,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('vault.deleteConfirmTitle', { name: vaultName })}
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
          {t('vault.deleteConfirmTitle', { name: vaultName })}
        </h2>
        <p className="text-[12px] text-[var(--cv-t2)]">{t('vault.deleteConfirmText')}</p>
      </div>

      <DialogFooter>
        <Button variant="subtle" size="md" onClick={onCancel} disabled={isPending} className="flex-1">
          {t('vault.cancel')}
        </Button>
        <Button variant="danger" size="md" onClick={onConfirm} disabled={isPending} className="flex-[2]">
          {isPending ? t('vault.deleting') : t('vault.confirmDelete')}
        </Button>
      </DialogFooter>
    </ModalShell>
  )
}
