import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'
import { WarningZone } from '../../../shared/components/warning-zone'
import { analytics } from '../../../shared/lib/analytics'
import { downloadBytesFile } from '../../../shared/lib/download-file'
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
  const [includeArchived, setIncludeArchived] = useState(false)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [includeHistory, setIncludeHistory] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const isBusy = exportMutation.isPending

  useEffect(() => () => abortRef.current?.abort(), [])

  const handleClose = () => {
    abortRef.current?.abort()
    abortRef.current = null
    exportMutation.reset()
    setProgress(null)
    onClose()
  }

  const handleExport = () => {
    setProgress(null)
    const controller = new AbortController()
    abortRef.current = controller
    exportMutation.mutate(
      {
        vaults,
        format,
        includeArchived,
        includeDeleted,
        includeHistory,
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
        onFileReady: ({ filename, content, mime }) => downloadBytesFile(filename, content, mime),
      },
      {
        onSuccess: (res) => {
          abortRef.current = null
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
          handleClose()
        },
        onError: (error) => {
          abortRef.current = null
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            toast.error(t('vault.export.error'))
          }
        },
      },
    )
  }

  return (
    <ModalShell
      onClose={handleClose}
      ariaLabel={t('vault.export.title')}
      title={t('vault.export.title')}
      width={460}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={handleClose} className="flex-1">
            {isBusy ? t('vault.export.cancelExport') : t('vault.cancel')}
          </Button>
          <Button variant="accent" size="sm" icon="download" onClick={handleExport} disabled={isBusy} className="flex-[2]">
            {isBusy ? t('vault.export.exporting') : t('vault.export.exportCta')}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        <fieldset>
          <legend className="mb-1.5 text-meta font-semibold text-[var(--cv-label-text)]">
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

        <fieldset disabled={isBusy} className="flex flex-col gap-2">
          <legend className="mb-1 text-meta font-semibold text-[var(--cv-label-text)]">
            {t('vault.export.scopeLabel')}
          </legend>
          <ScopeOption checked={includeArchived} onChange={setIncludeArchived} label={t('vault.export.includeArchived')} />
          <ScopeOption checked={includeDeleted} onChange={setIncludeDeleted} label={t('vault.export.includeDeleted')} />
          <ScopeOption checked={includeHistory} onChange={setIncludeHistory} label={t('vault.export.includeHistory')} />
        </fieldset>

        <WarningZone title={t('vault.export.warningTitle')}>
          {t('vault.export.warningBody')}
        </WarningZone>

        {isBusy && (
          <div aria-live="polite">
            <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--cv-card-bg)]">
              <div
                className="h-full rounded-full bg-[var(--cv-primary)] transition-[width] duration-200"
                style={{
                  width: progress && progress.total > 0
                    ? `${Math.round((progress.done / progress.total) * 100)}%`
                    : '10%',
                }}
              />
            </div>
            <p className="text-meta text-[var(--cv-t3)]">
              {progress
                ? t('vault.export.progress', { done: progress.done, total: progress.total })
                : t('vault.export.exporting')}
            </p>
          </div>
        )}

      </div>
    </ModalShell>
  )
}

function ScopeOption({ checked, onChange, label }: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2 text-ui text-[var(--cv-t1)]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
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
      <p className="text-ui font-semibold text-[var(--cv-t1)]">{title}</p>
      <p className="text-micro text-[var(--cv-t3)]">{subtitle}</p>
    </button>
  )
}
