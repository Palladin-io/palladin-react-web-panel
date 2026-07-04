import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import { WarningZone } from '../../../shared/components/warning-zone'
import { analytics } from '../../../shared/lib/analytics'
import { downloadTextFile } from '../../../shared/lib/download-file'
import { exportAudit } from '../api/vault-api'
import { useExportEntries, type ExportFormat } from '../use-export-entries'

export interface ExportDialogProps {
  open: boolean
  /** Vaults to export — one for the vault detail view, all for Settings. */
  vaults: { id: string; name: string }[]
  onClose: () => void
}

/** Mount fresh on each open so format selection resets. */
export function ExportDialog({ open, vaults, onClose }: ExportDialogProps) {
  if (!open) return null
  return <ExportDialogBody vaults={vaults} onClose={onClose} />
}

function ExportDialogBody({
  vaults,
  onClose,
}: {
  vaults: { id: string; name: string }[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const exportMutation = useExportEntries()
  const [format, setFormat] = useState<ExportFormat>('json')
  const isBusy = exportMutation.isPending

  const handleExport = () => {
    exportMutation.mutate(
      { vaults, format },
      {
        onSuccess: (res) => {
          downloadTextFile(res.filename, res.content, res.mime)
          // Fire-and-forget per-vault audit — a failed write must not block the
          // download the user already received. Skip empty vaults: the endpoint
          // requires entryCount > 0.
          for (const { id, count } of res.perVault) {
            if (count > 0) {
              exportAudit(id, { format: res.format, entryCount: count }).catch(() => {})
            }
          }
          analytics.capture('vault', 'export-completed', {
            count: res.totalEntries,
            format: res.format,
          })
          toast.success(t('vault.export.success', { count: res.totalEntries }))
          onClose()
        },
        onError: () => toast.error(t('vault.export.error')),
      },
    )
  }

  return (
    <ModalShell
      onClose={isBusy ? undefined : onClose}
      ariaLabel={t('vault.export.title')}
      width={460}
    >
      <div className="flex flex-col gap-3">
        <header className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
            {t('vault.export.title')}
          </h2>
          <button
            type="button"
            onClick={isBusy ? undefined : onClose}
            disabled={isBusy}
            aria-label={t('common.close')}
            className="text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]
              disabled:cursor-not-allowed"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <fieldset>
          <legend className="mb-1.5 text-[11px] font-semibold text-[var(--cv-label-text)]">
            {t('vault.export.formatLabel')}
          </legend>
          <div className="flex gap-1.5">
            <FormatOption
              active={format === 'json'}
              title={t('vault.export.jsonTitle')}
              subtitle={t('vault.export.jsonSubtitle')}
              onSelect={() => setFormat('json')}
              disabled={isBusy}
            />
            <FormatOption
              active={format === 'csv'}
              title={t('vault.export.csvTitle')}
              subtitle={t('vault.export.csvSubtitle')}
              onSelect={() => setFormat('csv')}
              disabled={isBusy}
            />
          </div>
        </fieldset>

        <WarningZone title={t('vault.export.warningTitle')}>
          {t('vault.export.warningBody')}
        </WarningZone>

        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onClose} disabled={isBusy} className="flex-1">
            {t('vault.cancel')}
          </Button>
          <Button
            variant="accent"
            size="sm"
            icon="download"
            onClick={handleExport}
            disabled={isBusy}
            className="flex-[2]"
          >
            {isBusy ? t('vault.export.exporting') : t('vault.export.exportCta')}
          </Button>
        </DialogFooter>
      </div>
    </ModalShell>
  )
}

function FormatOption({
  active,
  title,
  subtitle,
  onSelect,
  disabled,
}: {
  active: boolean
  title: string
  subtitle: string
  onSelect: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors
        disabled:cursor-not-allowed disabled:opacity-60 ${
          active
            ? 'border-[var(--cv-primary)] bg-[rgb(var(--cv-primary-rgb)/0.1)]'
            : 'border-[var(--cv-input-border)] hover:border-[var(--cv-t1)]'
        }`}
    >
      <p className="text-[12px] font-semibold text-[var(--cv-t1)]">{title}</p>
      <p className="text-[10px] text-[var(--cv-t3)]">{subtitle}</p>
    </button>
  )
}
