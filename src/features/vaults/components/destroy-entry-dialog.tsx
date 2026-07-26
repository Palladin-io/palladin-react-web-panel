import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'

export function DestroyEntryDialog({ entryName, isPending, onConfirm, onCancel }: {
  entryName: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <ModalShell
      ariaLabel={t('vault.entries.destroyTitle', { name: entryName })}
      title={t('vault.entries.destroyTitle', { name: entryName })}
      onClose={isPending ? undefined : onCancel}
      footer={<DialogFooter>
        <Button variant="subtle" size="sm" onClick={onCancel} disabled={isPending} className="flex-1">
          {t('vault.cancel')}
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm} disabled={isPending} className="flex-[2]">
          {isPending ? t('vault.entries.destroying') : t('vault.entries.destroyConfirm')}
        </Button>
      </DialogFooter>}
    >
      <p className="text-ui text-[var(--cv-t2)]">{t('vault.entries.destroyText')}</p>
    </ModalShell>
  )
}
