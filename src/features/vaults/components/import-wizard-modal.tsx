import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { EncryptionNotice } from '../../../shared/components/encryption-notice'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import { analytics } from '../../../shared/lib/analytics'
import { PERMISSION_VAULT_MANAGE } from '../../../shared/lib/permissions'
import {
  applyColumnMapping,
  formatName,
  parseFile,
  SUPPORTED_FORMAT_NAMES,
  type ColumnMapping,
  type ParsedEntry,
  type ParseResult,
} from '../import'
import type { Vault } from '../types'
import { useAuthStore } from '../../auth'
import { useAllEntries } from '../use-entries'
import { useMemberSyncStore } from '../sync/member-sync-store'
import {
  ImportStepError,
  useImportEntries,
  type ImportOverwrite,
} from '../use-import-entries'
import {
  useRepairMissingWebsiteIcons,
  type MissingWebsiteIconRepairProgress,
} from '../use-repair-missing-website-icons'
import { FileDropzone } from './file-dropzone'
import { ImportColumnMapper } from './import-column-mapper'

type ConflictStrategy = 'skip' | 'overwrite' | 'rename'
type Step = 'upload' | 'preview' | 'importing' | 'done'

export interface ImportWizardModalProps {
  open: boolean
  vault: Vault
  onClose: () => void
}

/** Mount fresh on each open so wizard state always starts clean. */
export function ImportWizardModal({ open, vault, onClose }: ImportWizardModalProps) {
  if (!open) return null
  return <ImportWizardBody vault={vault} onClose={onClose} />
}

function ImportWizardBody({ vault, onClose }: { vault: Vault; onClose: () => void }) {
  const { t } = useTranslation()
  const importMutation = useImportEntries()
  const repairIcons = useRepairMissingWebsiteIcons(vault.id)
  const privateKey = useAuthStore((state) => state.privateKey)
  const permissions = useAuthStore((state) => state.permissions)
  const canManageVault = (permissions & PERMISSION_VAULT_MANAGE) !== 0

  const [step, setStep] = useState<Step>('upload')
  // Conflicts are only needed from the preview step on, so don't fetch the full
  // entry list while the user is still on the upload step (they may close first).
  const entriesQuery = useAllEntries(vault.id, step !== 'upload')
  const decryptedVault = useMemberSyncStore((state) => state.vaults.get(vault.id))
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [strategy, setStrategy] = useState<ConflictStrategy>('skip')
  const [progress, setProgress] = useState<{
    done: number
    total: number
    phase: 'encrypt' | 'save' | 'icons'
  }>({ done: 0, total: 0, phase: 'encrypt' })
  const [repairProgress, setRepairProgress] = useState<MissingWebsiteIconRepairProgress | null>(null)
  const [summary, setSummary] = useState<{
    imported: number
    updated: number
    skipped: number
    failed: { label: string; reason: string }[]
  }>({ imported: 0, updated: 0, skipped: 0, failed: [] })

  // Entries after (for manual CSVs) applying the user's column mapping.
  const derived = useMemo(() => {
    if (!result) return null
    if (result.format === 'manual' && result.unmapped) {
      return applyColumnMapping(result.unmapped, mapping)
    }
    return { entries: result.entries, skipped: result.skipped }
  }, [result, mapping])

  const entries = useMemo(() => derived?.entries ?? [], [derived])
  const skippedCount = derived?.skipped.count ?? 0

  const existingByLabel = useMemo(() => {
    const map = new Map<string, string>()
    // Conflict matching primarily uses the already-decrypted in-memory member
    // projection. Plaintext labels must not be required from the backend.
    for (const item of decryptedVault?.entries.values() ?? []) {
      const label = item.payload?.memberLabel?.trim()
      if (label) map.set(label.toLowerCase(), item.entryId)
    }
    for (const item of entriesQuery.data ?? []) {
      // The canonical zero-knowledge list intentionally does not expose a
      // plaintext label. Older/local responses may still contain one, so only
      // use it for conflict matching when it is actually present.
      const label = typeof item.label === 'string' ? item.label.trim() : ''
      if (label) map.set(label.toLowerCase(), item.id)
    }
    return map
  }, [decryptedVault, entriesQuery.data])

  const existingLabels = useMemo(
    () => new Set(existingByLabel.keys()),
    [existingByLabel],
  )

  const conflictCount = useMemo(
    () => entries.filter((e) => existingLabels.has(e.label.trim().toLowerCase())).length,
    [entries, existingLabels],
  )

  const isBusy = parsing || step === 'importing' || repairIcons.isPending

  useEffect(() => {
    if (!privateKey) onClose()
  }, [onClose, privateKey])

  const handleFile = async (file: File) => {
    setParsing(true)
    setParseError(null)
    try {
      const parsed = await parseFile(file)
      setResult(parsed)
      setMapping({})
      setStrategy('skip')
      setStep('preview')
    } catch (error) {
      const reason = error instanceof Error && 'reason' in error ? String((error as { reason: unknown }).reason) : 'unknown'
      analytics.capture('vault', 'import-failed', { format: 'unknown', reason })
      setParseError(t('vault.import.errorParse'))
    } finally {
      setParsing(false)
    }
  }

  const partition = (): { creates: ParsedEntry[]; overwrites: ImportOverwrite[] } => {
    const creates: ParsedEntry[] = []
    const overwrites: ImportOverwrite[] = []
    const used = new Set(existingByLabel.keys())
    for (const entry of entries) {
      const key = entry.label.trim().toLowerCase()
      const existingId = existingByLabel.get(key)
      if (!existingId) {
        creates.push(entry)
        continue
      }
      if (strategy === 'skip') continue
      if (strategy === 'overwrite') {
        overwrites.push({ entryId: existingId, entry })
        continue
      }
      const renamed = uniqueLabel(entry.label, used)
      creates.push({ ...entry, label: renamed })
    }
    return { creates, overwrites }
  }

  const handleImport = () => {
    if (!result) return
    const { creates, overwrites } = partition()
    if (creates.length + overwrites.length === 0) {
      toast.error(t('vault.import.errorNothingToImport'))
      return
    }
    const total = creates.length + overwrites.length
    setProgress({ done: 0, total, phase: 'encrypt' })
    setStep('importing')
    importMutation.mutate(
      {
        vaultId: vault.id,
        format: result.format,
        creates,
        overwrites,
        onProgress: (done, count, phase) => setProgress({ done, total: count, phase }),
      },
      {
        onSuccess: (res) => {
          setSummary({
            imported: res.importedCount,
            updated: res.updatedCount,
            skipped: skippedCount + (entries.length - total),
            failed: res.failed,
          })
          analytics.capture('vault', 'import-wizard-completed', {
            count: res.importedCount + res.updatedCount,
            format: result.format,
            skipped: skippedCount,
            conflicts: conflictCount,
            failed: res.failed.length,
          })
          setStep('done')
        },
        onError: (error) => {
          // Tag the failing phase so the toast is distinguishable and analytics
          // records which step broke (grants / encrypt / save / overwrite).
          const step = error instanceof ImportStepError ? error.step : 'unknown'
          analytics.capture('vault', 'import-failed', {
            format: result.format,
            reason: step,
          })
          toast.error(
            step === 'unknown'
              ? t('vault.import.errorImport')
              : t(`vault.import.errorStep.${step}`),
          )
          setStep('preview')
        },
      },
    )
  }

  const repairMissingIcons = () => {
    setRepairProgress({ phase: 'prepare', done: 0, total: repairIcons.candidateCount })
    repairIcons.mutate(
      { onProgress: setRepairProgress },
      {
        onSuccess: (repairResult) => {
          if (repairResult.repaired > 0
            && repairResult.repaired === repairResult.candidates
            && repairResult.failed === 0) {
            toast.success(t('vault.entries.repairIconsSuccess', { count: repairResult.repaired }))
          } else if (repairResult.repaired > 0) {
            toast.info(t('vault.entries.repairIconsPartial', {
              repaired: repairResult.repaired,
              total: repairResult.candidates,
            }))
          } else if (repairResult.failed > 0) {
            toast.error(t('vault.entries.repairIconsError'))
          } else {
            toast.info(t('vault.entries.repairIconsPending'))
          }
        },
        onError: () => toast.error(t('vault.entries.repairIconsError')),
        onSettled: () => setRepairProgress(null),
      },
    )
  }

  // Footer lives on ModalShell (pinned) rather than inside each step, so it never
  // scrolls with the body. The importing step has no footer (not dismissible).
  const footer =
    step === 'upload' ? (
      <DialogFooter>
        <Button variant="subtle" size="sm" onClick={onClose} className="flex-1">
          {t('vault.cancel')}
        </Button>
      </DialogFooter>
    ) : step === 'preview' ? (
      <DialogFooter>
        <Button variant="subtle" size="sm" onClick={() => setStep('upload')} className="flex-1">
          {t('vault.import.back')}
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={handleImport}
          disabled={entries.length === 0}
          className="flex-[2]"
        >
          {t('vault.import.importCta')}
        </Button>
      </DialogFooter>
    ) : step === 'done' ? (
      <DialogFooter>
        <Button variant="accent" size="sm" onClick={onClose} className="flex-1">
          {t('vault.import.close')}
        </Button>
      </DialogFooter>
    ) : undefined

  return (
    <ModalShell
      onClose={isBusy ? undefined : onClose}
      ariaLabel={t('vault.import.title')}
      title={t('vault.import.title')}
      width={560}
      footer={footer}
    >
      <div className="flex flex-col gap-3">
        {step === 'upload' ? (
          <UploadStep
            parsing={parsing}
            error={parseError}
            onFile={handleFile}
            repair={canManageVault && repairIcons.candidateCount > 0 ? {
              candidateCount: repairIcons.candidateCount,
              isPending: repairIcons.isPending,
              progress: repairProgress,
              onStart: repairMissingIcons,
            } : undefined}
          />
        ) : null}

        {step === 'preview' && result ? (
          <PreviewStep
            result={result}
            entries={entries}
            existingLabels={existingLabels}
            skippedCount={skippedCount}
            conflictCount={conflictCount}
            mapping={mapping}
            onMappingChange={setMapping}
            strategy={strategy}
            onStrategyChange={setStrategy}
          />
        ) : null}

        {step === 'importing' ? <ImportingStep progress={progress} /> : null}

        {step === 'done' ? <DoneStep summary={summary} /> : null}
      </div>
    </ModalShell>
  )
}

// ── Steps ──────────────────────────────────────────────────────────────────

function UploadStep({
  parsing,
  error,
  onFile,
  repair,
}: {
  parsing: boolean
  error: string | null
  onFile: (file: File) => void
  repair?: {
    candidateCount: number
    isPending: boolean
    progress: MissingWebsiteIconRepairProgress | null
    onStart: () => void
  }
}) {
  const { t } = useTranslation()
  return (
    <>
      <FileDropzone
        onFile={onFile}
        disabled={parsing}
        accept=".csv,.json,.xml,.1pux,.zip,.txt"
        label={parsing ? t('vault.import.parsing') : t('vault.import.dropLabel')}
        hint={t('vault.import.dropHint')}
      />
      <p className="text-meta leading-relaxed text-[var(--cv-t3)]">
        <span className="font-semibold text-[var(--cv-t2)]">
          {t('vault.import.supportedLabel')}:
        </span>{' '}
        {SUPPORTED_FORMAT_NAMES.join(', ')}
      </p>
      {repair ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border
          border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-3">
          <div className="min-w-0 flex-1">
            <p className="text-ui font-semibold text-[var(--cv-t1)]">
              {t('vault.entries.repairIcons')}
            </p>
            <p className="mt-0.5 text-meta text-[var(--cv-t3)]">
              {t('vault.entries.repairIconsDescription', { count: repair.candidateCount })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={parsing || repair.isPending}
            onClick={repair.onStart}
          >
            <Icon
              name={repair.isPending ? 'progress_activity' : 'image_search'}
              size={14}
              className={repair.isPending ? 'animate-spin' : undefined}
            />
            <span aria-live="polite" aria-atomic="true">
              {repair.progress
                ? t(repair.progress.phase === 'prepare'
                  ? 'vault.entries.repairIconsPreparing'
                  : 'vault.entries.repairIconsUpdating', {
                  done: repair.progress.done,
                  total: repair.progress.total,
                })
                : t('vault.entries.repairIcons')}
            </span>
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-meta font-medium text-[var(--cv-primary)]">
          {error}
        </p>
      ) : null}
    </>
  )
}

function PreviewStep({
  result,
  entries,
  existingLabels,
  skippedCount,
  conflictCount,
  mapping,
  onMappingChange,
  strategy,
  onStrategyChange,
}: {
  result: ParseResult
  entries: ParsedEntry[]
  existingLabels: Set<string>
  skippedCount: number
  conflictCount: number
  mapping: ColumnMapping
  onMappingChange: (next: ColumnMapping) => void
  strategy: ConflictStrategy
  onStrategyChange: (next: ConflictStrategy) => void
}) {
  const { t } = useTranslation()
  const isManual = result.format === 'manual' && result.unmapped

  return (
    <>
      <div className="flex items-center gap-2 text-ui">
        <span className="text-[var(--cv-t3)]">{t('vault.import.detectedFormat')}:</span>
        <span
          className="rounded-md bg-[var(--cv-card-bg)] px-2 py-0.5 text-meta font-semibold
            text-[var(--cv-t1)]"
        >
          {result.format === 'manual'
            ? t('vault.import.format.manual')
            : formatName(result.format)}
        </span>
      </div>

      {isManual && result.unmapped ? (
        <ImportColumnMapper
          unmapped={result.unmapped}
          mapping={mapping}
          onChange={onMappingChange}
        />
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-meta">
        <Counter color="var(--cv-t1)" label={t('vault.import.countToImport')} value={entries.length} />
        {conflictCount > 0 ? (
          <Counter color="var(--cv-premium)" label={t('vault.import.countConflicts')} value={conflictCount} />
        ) : null}
        {skippedCount > 0 ? (
          <Counter color="var(--cv-t3)" label={t('vault.import.countSkipped')} value={skippedCount} />
        ) : null}
      </div>

      {entries.length > 0 ? (
        <ul className="flex max-h-[15rem] flex-col gap-1 overflow-y-auto">
          {entries.slice(0, 200).map((entry, i) => (
            <EntryPreviewRow
              key={i}
              entry={entry}
              conflict={existingLabels.has(entry.label.trim().toLowerCase())}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-[var(--cv-empty-border)]
          bg-[var(--cv-empty-bg)] px-3 py-4 text-center text-meta text-[var(--cv-t3)]">
          {isManual ? t('vault.import.mapper.empty') : t('vault.import.noEntries')}
        </p>
      )}

      {conflictCount > 0 ? (
        <ConflictStrategyPicker value={strategy} onChange={onStrategyChange} />
      ) : null}

      <EncryptionNotice>{t('vault.import.encryptionNotice')}</EncryptionNotice>
    </>
  )
}

function ImportingStep({
  progress,
}: {
  progress: { done: number; total: number; phase: 'encrypt' | 'save' | 'icons' }
}) {
  const { t } = useTranslation()
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const barWidth = progress.phase === 'icons' && pct === 0 ? 8 : pct
  return (
    <div className="flex flex-col gap-3 py-4">
      <p className="text-ui text-[var(--cv-t2)]">
        {t(progress.phase === 'encrypt'
          ? 'vault.import.encrypting'
          : progress.phase === 'save'
            ? 'vault.import.saving'
            : 'vault.import.icons', { done: progress.done, total: progress.total })}
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--cv-card-bg)]">
        <div
          className={`h-full rounded-full bg-[var(--cv-primary)] transition-[width] duration-200
            ${progress.phase === 'icons' && progress.done < progress.total ? 'animate-pulse' : ''}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  )
}

function DoneStep({
  summary,
}: {
  summary: {
    imported: number
    updated: number
    skipped: number
    failed: { label: string; reason: string }[]
  }
}) {
  const { t } = useTranslation()
  const hasFailures = summary.failed.length > 0
  return (
    <>
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <Icon
          name={hasFailures ? 'warning' : 'check_circle'}
          size={36}
          color={hasFailures ? 'var(--cv-premium)' : 'var(--cv-success)'}
        />
        <p className="text-heading-sm font-semibold text-[var(--cv-t1)]">
          {t('vault.import.doneTitle')}
        </p>
        <p className="text-meta text-[var(--cv-t3)]">
          {t('vault.import.doneSummary', {
            imported: summary.imported,
            updated: summary.updated,
            skipped: summary.skipped,
          })}
        </p>
        {hasFailures && (
          <div className="mt-1 w-full rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-3 text-left">
            <p className="mb-1 text-meta font-semibold text-[var(--cv-t1)]">
              {t('vault.import.failedTitle', { count: summary.failed.length })}
            </p>
            <ul className="max-h-32 overflow-y-auto subtle-scrollbar">
              {summary.failed.slice(0, 20).map((item, i) => (
                <li key={i} className="truncate text-meta text-[var(--cv-t3)]">
                  <span className="text-[var(--cv-t1)]">{item.label || '—'}</span>
                  {' — '}
                  {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  )
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function Counter({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span style={{ color }}>
      <span className="font-semibold">{value}</span> {label}
    </span>
  )
}

function EntryPreviewRow({ entry, conflict }: { entry: ParsedEntry; conflict: boolean }) {
  const { t } = useTranslation()
  return (
    <li className="flex items-center gap-2 rounded-lg bg-[var(--cv-card-bg)] px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-medium text-[var(--cv-t1)]">{entry.label}</p>
        <p className="truncate text-micro text-[var(--cv-t3)]">
          {entry.username || entry.url || '—'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {entry.password || entry.value ? (
          <Icon name="password" size={13} className="text-[var(--cv-t3)]" />
        ) : null}
        {entry.totp ? <Badge>{t('vault.import.badgeTotp')}</Badge> : null}
        {entry.notes ? <Icon name="sticky_note_2" size={13} className="text-[var(--cv-t3)]" /> : null}
        {conflict ? <Badge amber>{t('vault.import.badgeConflict')}</Badge> : null}
      </div>
    </li>
  )
}

function Badge({ children, amber }: { children: ReactNode; amber?: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-micro font-semibold ${
        amber
          ? 'bg-[color-mix(in_srgb,var(--cv-premium)_12%,transparent)] text-[var(--cv-premium)]'
          : 'bg-[var(--cv-card-hover)] text-[var(--cv-t2)]'
      }`}
    >
      {children}
    </span>
  )
}

function ConflictStrategyPicker({
  value,
  onChange,
}: {
  value: ConflictStrategy
  onChange: (next: ConflictStrategy) => void
}) {
  const { t } = useTranslation()
  const options: ConflictStrategy[] = ['skip', 'overwrite', 'rename']
  return (
    <div>
      <p className="mb-1.5 text-meta font-semibold text-[var(--cv-label-text)]">
        {t('vault.import.conflictLabel')}
      </p>
      <div className="flex gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-meta font-medium transition-colors ${
              value === option
                ? 'border-[var(--cv-primary)] bg-[rgb(var(--cv-primary-rgb)/0.1)] text-[var(--cv-t1)]'
                : 'border-[var(--cv-input-border)] text-[var(--cv-t2)] hover:border-[var(--cv-t1)]'
            }`}
          >
            {t(`vault.import.conflict.${option}`)}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Append " (2)", " (3)"… until the label is unique within `used`; records it. */
function uniqueLabel(base: string, used: Set<string>): string {
  let counter = 2
  let candidate = `${base} (${counter})`
  while (used.has(candidate.trim().toLowerCase())) {
    counter += 1
    candidate = `${base} (${counter})`
  }
  used.add(candidate.trim().toLowerCase())
  return candidate
}
