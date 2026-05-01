import { useTranslation } from 'react-i18next'
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
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-[var(--cv-btn-outline-border)] bg-transparent px-4 py-2
              text-sm text-[var(--cv-t1)] transition-colors hover:bg-[var(--cv-btn-outline-hover)]
              disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('vault.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-lg bg-[#FF4F4F] px-4 py-2 text-sm font-semibold text-white
              transition-colors hover:bg-[#e04545]
              disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? t('vault.deleting') : t('vault.confirmDelete')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
