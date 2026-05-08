import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { ModalShell } from './modal-shell'

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
        <h2 className="text-lg font-bold text-[var(--cv-t1)]">
          {t('vault.deleteConfirmTitle', { name: vaultName })}
        </h2>
        <p className="text-sm text-[var(--cv-t2)]">{t('vault.deleteConfirmText')}</p>

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            {t('vault.cancel')}
          </Button>
          <Button variant="accent" onClick={onConfirm} disabled={isPending}>
            {isPending ? t('vault.deleting') : t('vault.confirmDelete')}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
