import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { ErrorState } from '../../shared/components/error-state'
import { Icon } from '../../shared/components/icon'
import { decryptEntry } from '../../shared/crypto/entry-crypto'
import { wipe } from '../../shared/crypto/sodium'
import { unsealVaultKey } from '../../shared/crypto/vault-key'
import { useAuthStore } from '../auth'
import { EntryIconPicker } from './components/entry-icon-picker'
import {
  ENTRY_ICON_COLORS,
  extractDomain,
  isCustomIconUrl,
  presentationForType,
} from './components/entry-presentation'
import { ModalShell } from './components/modal-shell'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  type EntryDetail,
  type EntryPlaintext,
  type EntryType,
  type Vault,
} from './types'
import { useDeleteEntry } from './use-delete-entry'
import { useEntryDetail } from './use-entries'
import { useEntryIconUpload } from './use-entry-icon-upload'
import { useUpdateEntry } from './use-update-entry'
import { useVault } from './use-vault'
import type { UpdateEntryInput } from './use-update-entry'

export interface EntryDetailPageProps {
  vaultId: string
  entryId: string
}

type EntryDetailTab = 'details' | 'agents' | 'logs'

/**
 * Full entry detail screen — opened from the `arrow_forward` action on
 * a row. Hosts the Details / Agents / Logs tab strip; only Details is
 * implemented for now (Agents and Logs render empty-state cards until
 * their dedicated subtasks land).
 *
 * Decrypts the encrypted blob on demand when the user reveals a secret
 * field, using the same unseal-then-decrypt pattern as `EntryRow`. The
 * plaintext is cached locally for the lifetime of the page so toggling
 * visibility doesn't re-decrypt; refreshing or closing the tab wipes it
 * because all crypto state lives in memory only.
 */
export function EntryDetailPage({ vaultId, entryId }: EntryDetailPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const vault = useVault(vaultId)
  const entry = useEntryDetail(vaultId, entryId, true)
  const [activeTab, setActiveTab] = useState<EntryDetailTab>('details')

  const handleBack = () => navigate({ to: '/vaults/$vaultId', params: { vaultId } })

  return (
    <div className="min-h-screen text-[var(--cv-t1)]">
      <div className="px-6 py-8">
        {vault.isPending || entry.isPending ? (
          <PageSkeleton />
        ) : vault.isError || !vault.data ? (
          <ErrorState message={t('vault.errorLoad')} onRetry={vault.refetch} />
        ) : entry.isError || !entry.data ? (
          <ErrorState
            message={t('vault.entry.detail.loadError')}
            onRetry={entry.refetch}
          />
        ) : (
          <DetailBody
            vault={vault.data}
            entry={entry.data}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onBack={handleBack}
            onDeleted={() => navigate({ to: '/vaults/$vaultId', params: { vaultId } })}
          />
        )}
      </div>
    </div>
  )
}

function PageSkeleton() {
  return (
    <>
      <div className="mb-4 h-12 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
      <div className="h-64 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
    </>
  )
}

interface DetailBodyProps {
  vault: Vault
  entry: EntryDetail
  activeTab: EntryDetailTab
  onTabChange: (next: EntryDetailTab) => void
  onBack: () => void
  onDeleted: () => void
}

function DetailBody({
  vault,
  entry,
  activeTab,
  onTabChange,
  onBack,
  onDeleted,
}: DetailBodyProps) {
  const { t } = useTranslation()

  return (
    <>
      <EntryDetailHeader
        vault={vault}
        entry={entry}
        activeTab={activeTab}
        onBack={onBack}
      />
      <EntryDetailTabs active={activeTab} onChange={onTabChange} />
      {activeTab === 'details' ? (
        <DetailsTab
          vault={vault}
          entry={entry}
          onDeleted={onDeleted}
        />
      ) : null}
      {activeTab === 'agents' ? (
        <EmptyMessage message={t('vault.entry.detail.agentsEmpty')} />
      ) : null}
      {activeTab === 'logs' ? (
        <EmptyMessage message={t('vault.entry.detail.logsComingSoon')} />
      ) : null}
    </>
  )
}

interface EntryDetailHeaderProps {
  vault: Vault
  entry: EntryDetail
  activeTab: EntryDetailTab
  onBack: () => void
}

function EntryDetailHeader({
  vault,
  entry,
  activeTab,
  onBack,
}: EntryDetailHeaderProps) {
  const { t } = useTranslation()
  const presentation = presentationForType(entry.type)
  const customIcon = isCustomIconUrl(entry.icon) ? entry.icon : null
  const iconName = !customIcon ? entry.icon ?? presentation.defaultIcon : null

  const titleNode = (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: presentation.iconBg, color: presentation.iconColor }}
      >
        {customIcon ? (
          <img
            src={customIcon}
            alt=""
            className="h-7 w-7 rounded-full object-cover"
          />
        ) : (
          <Icon name={iconName ?? presentation.defaultIcon} size={18} color={presentation.iconColor} />
        )}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[20px] font-bold leading-tight text-[var(--cv-t1)]">
          {entry.label}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[12px] text-[var(--cv-t3)]">
          <TypeBadge type={entry.type} />
          <span>·</span>
          <span className="truncate">{vault.name}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="mb-2 flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('common.back')}
          className="flex h-8 w-8 items-center justify-center rounded-lg
            text-[var(--cv-t3)] transition-colors hover:bg-[var(--cv-bg-subtle)] hover:text-[var(--cv-t1)]"
        >
          <Icon name="arrow_back" size={18} />
        </button>
        {titleNode}
      </div>
      {activeTab === 'agents' ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="accent" size="sm" icon="add">
            {t('vault.detail.addAgent')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function TypeBadge({ type }: { type: EntryType }) {
  const { t } = useTranslation()
  const isKey = type === ENTRY_TYPE_KEY
  const background = isKey ? 'rgba(96,165,250,0.15)' : 'rgba(255,171,135,0.15)'
  const color = isKey ? '#60A5FA' : '#FFAB87'
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background, color }}
    >
      {isKey ? t('vault.entries.typeKey') : t('vault.entries.typeCredential')}
    </span>
  )
}

interface EntryDetailTabsProps {
  active: EntryDetailTab
  onChange: (next: EntryDetailTab) => void
}

function EntryDetailTabs({ active, onChange }: EntryDetailTabsProps) {
  const { t } = useTranslation()
  const tabs: { id: EntryDetailTab; labelKey: string }[] = [
    { id: 'details', labelKey: 'vault.entry.detail.detailsTab' },
    { id: 'agents', labelKey: 'vault.entry.detail.agentsTab' },
    { id: 'logs', labelKey: 'vault.entry.detail.logsTab' },
  ]
  return (
    <div className="mb-3 flex border-b border-[var(--cv-divider)]" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-[12px] transition-colors ${
              isActive
                ? 'border-[#FF4F4F] font-bold text-[#FF4F4F]'
                : 'border-transparent font-medium text-[var(--cv-t3)] hover:text-[var(--cv-t1)]'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Details tab
// ---------------------------------------------------------------------------

interface DetailsTabProps {
  vault: Vault
  entry: EntryDetail
  onDeleted: () => void
}

function DetailsTab({ vault, entry, onDeleted }: DetailsTabProps) {
  const { t } = useTranslation()
  const update = useUpdateEntry(vault.id, entry.id)
  const remove = useDeleteEntry(vault.id)

  // Editable metadata — initialise from server values, reset to the
  // current server values on Discard.
  const [label, setLabel] = useState(entry.label)
  const [description, setDescription] = useState(entry.description ?? '')
  const [icon, setIcon] = useState<string | undefined>(entry.icon)
  const [pendingIconFile, setPendingIconFile] = useState<File | null>(null)
  const [url, setUrl] = useState(entry.urlDomain ? `https://${entry.urlDomain}` : '')
  const [showDelete, setShowDelete] = useState(false)

  // Reset local form when the server payload changes (e.g. after a save).
  useEffect(() => {
    setLabel(entry.label)
    setDescription(entry.description ?? '')
    setIcon(entry.icon)
    setPendingIconFile(null)
    setUrl(entry.urlDomain ? `https://${entry.urlDomain}` : '')
  }, [entry.label, entry.description, entry.icon, entry.urlDomain])

  const iconUpload = useEntryIconUpload(vault.id, entry.id, (publicUrl) => {
    setIcon(publicUrl)
    setPendingIconFile(null)
  })

  const accentColor =
    (entry.icon && ENTRY_ICON_COLORS[entry.icon]) ?? (entry.type === ENTRY_TYPE_KEY ? '#2EC4B6' : '#60A5FA')

  const isSaving = update.isPending || iconUpload.isUploading
  const isRemoving = remove.isPending

  const hasChanges = useMemo(() => {
    if (label.trim() !== entry.label) return true
    if ((description.trim() || undefined) !== (entry.description ?? undefined))
      return true
    if (icon !== entry.icon) return true
    if (pendingIconFile) return true
    if (entry.type === ENTRY_TYPE_CREDENTIAL) {
      const nextDomain = extractDomain(url)
      if (nextDomain !== entry.urlDomain) return true
    }
    return false
  }, [label, description, icon, pendingIconFile, url, entry])

  const handleDiscard = () => {
    setLabel(entry.label)
    setDescription(entry.description ?? '')
    setIcon(entry.icon)
    setPendingIconFile(null)
    setUrl(entry.urlDomain ? `https://${entry.urlDomain}` : '')
  }

  const handleSave = async () => {
    if (!label.trim()) {
      toast.error(t('vault.entry.detail.saveError'))
      return
    }

    // Pending icon file → upload first, then PATCH metadata. Upload
    // already PATCHes `icon`; only ship the remaining fields here so we
    // don't overwrite the freshly-set URL.
    if (pendingIconFile) {
      await iconUpload.upload(pendingIconFile)
      if (iconUpload.error) {
        toast.error(iconUpload.error)
        return
      }
    }

    const patch = buildPatch({
      label,
      description,
      icon: pendingIconFile ? undefined : icon,
      entry,
      url,
    })

    if (Object.keys(patch).length === 0) {
      toast.success(t('vault.entry.detail.saveSuccess'))
      return
    }

    update.mutate(patch, {
      onSuccess: () => {
        toast.success(t('vault.entry.detail.saveSuccess'))
      },
      onError: () => {
        toast.error(t('vault.entry.detail.saveError'))
      },
    })
  }

  const handleDelete = () => {
    remove.mutate(entry.id, {
      onSuccess: () => {
        toast.success(t('vault.entry.detail.deleteSuccess'))
        setShowDelete(false)
        onDeleted()
      },
      onError: () => {
        toast.error(t('vault.entry.detail.deleteError'))
        setShowDelete(false)
      },
    })
  }

  return (
    <>
      <div
        className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5
          shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
      >
        <div className="flex flex-col gap-4">
          <EntryIconPicker
            value={icon}
            onChange={(next) => {
              setIcon(next)
              setPendingIconFile(null)
            }}
            selectedColor={accentColor}
            disabled={isSaving}
            onFileSelected={(file, previewUrl) => {
              setPendingIconFile(file)
              setIcon(previewUrl)
            }}
          />

          <LabeledInput
            id="entry-detail-label"
            label={t('vault.entries.labelLabel')}
            value={label}
            onChange={setLabel}
            placeholder={t('vault.entries.labelPlaceholder')}
            disabled={isSaving}
            maxLength={120}
            required
          />

          <LabeledInput
            id="entry-detail-description"
            label={t('vault.entries.descriptionLabel')}
            value={description}
            onChange={setDescription}
            placeholder={t('vault.entries.descriptionPlaceholder')}
            disabled={isSaving}
            maxLength={500}
          />

          <SecretFields vault={vault} entry={entry} />

          {entry.type === ENTRY_TYPE_CREDENTIAL ? (
            <LabeledInput
              id="entry-detail-url"
              label={t('vault.entries.urlLabel')}
              value={url}
              onChange={setUrl}
              placeholder={t('vault.entries.urlPlaceholder')}
              disabled={isSaving}
              type="url"
              inputMode="url"
            />
          ) : null}
        </div>
      </div>

      <MetadataCard entry={entry} />

      <div className="mb-3.5 flex gap-2">
        <Button
          variant="subtle"
          size="md"
          onClick={handleDiscard}
          disabled={isSaving || !hasChanges}
          className="flex-1"
        >
          {t('vault.entry.detail.discard')}
        </Button>
        <Button
          variant="accent"
          size="md"
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="flex-[2]"
        >
          {isSaving ? t('vault.entry.detail.saving') : t('vault.entry.detail.save')}
        </Button>
      </div>

      <DangerZone
        onDelete={() => setShowDelete(true)}
        disabled={isRemoving}
      />

      <DeleteEntryDialog
        open={showDelete}
        entryLabel={entry.label}
        isPending={isRemoving}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Secret fields (decrypt-on-reveal)
// ---------------------------------------------------------------------------

interface SecretFieldsProps {
  vault: Vault
  entry: EntryDetail
}

function SecretFields({ vault, entry }: SecretFieldsProps) {
  const { t } = useTranslation()
  const [plaintext, setPlaintext] = useState<EntryPlaintext | null>(null)
  const [decryptError, setDecryptError] = useState<string | null>(null)
  const [revealMap, setRevealMap] = useState<Record<string, boolean>>({})

  const ensurePlaintext = async (): Promise<EntryPlaintext | null> => {
    if (plaintext) return plaintext
    if (decryptError) return null

    const privateKey = useAuthStore.getState().privateKey
    if (!privateKey || !vault.wrappedVK) {
      setDecryptError(t('vault.entry.detail.decryptError'))
      return null
    }

    try {
      const vaultKey = await unsealVaultKey(vault.wrappedVK, privateKey)
      try {
        const result = await decryptEntry(entry.content, vaultKey)
        setPlaintext(result)
        return result
      } finally {
        wipe(vaultKey)
      }
    } catch {
      setDecryptError(t('vault.entry.detail.decryptError'))
      return null
    }
  }

  const handleReveal = async (field: string) => {
    // Toggle off — no decrypt needed.
    if (revealMap[field]) {
      setRevealMap((prev) => ({ ...prev, [field]: false }))
      return
    }
    const result = await ensurePlaintext()
    if (!result) return
    setRevealMap((prev) => ({ ...prev, [field]: true }))
  }

  const handleCopy = async (field: 'value' | 'username' | 'password') => {
    const result = await ensurePlaintext()
    if (!result) return
    const value =
      field === 'value' && result.type === ENTRY_TYPE_KEY
        ? result.value
        : field === 'username' && result.type === ENTRY_TYPE_CREDENTIAL
          ? result.username
          : field === 'password' && result.type === ENTRY_TYPE_CREDENTIAL
            ? result.password
            : null
    if (value === null) return
    try {
      await navigator.clipboard.writeText(value)
      toast.success(t('vault.entries.copied', { label: copyLabel(field, t) }))
    } catch {
      toast.error(t('vault.entries.copyFailed'))
    }
  }

  if (decryptError) {
    return (
      <div className="rounded-lg border border-[rgba(255,79,79,0.25)] bg-[rgba(255,79,79,0.06)] px-3 py-2 text-[11px] text-[#FF4F4F]">
        {decryptError}
      </div>
    )
  }

  if (entry.type === ENTRY_TYPE_KEY) {
    return (
      <SecretField
        id="entry-detail-value"
        label={t('vault.entries.valueLabel')}
        revealed={!!revealMap.value}
        revealedValue={
          plaintext?.type === ENTRY_TYPE_KEY ? plaintext.value : ''
        }
        onToggleReveal={() => handleReveal('value')}
        onCopy={() => handleCopy('value')}
        leftIcon="lock"
        leftIconColor="#FF4F4F"
        hint={t('vault.entry.detail.valueLocked')}
        monospace
      />
    )
  }

  return (
    <>
      <SecretField
        id="entry-detail-username"
        label={t('vault.entries.usernameLabel')}
        revealed={!!revealMap.username}
        revealedValue={
          plaintext?.type === ENTRY_TYPE_CREDENTIAL ? plaintext.username : ''
        }
        onToggleReveal={() => handleReveal('username')}
        onCopy={() => handleCopy('username')}
        leftIcon="person"
        leftIconColor="var(--cv-t3)"
      />
      <SecretField
        id="entry-detail-password"
        label={t('vault.entries.passwordLabel')}
        revealed={!!revealMap.password}
        revealedValue={
          plaintext?.type === ENTRY_TYPE_CREDENTIAL ? plaintext.password : ''
        }
        onToggleReveal={() => handleReveal('password')}
        onCopy={() => handleCopy('password')}
        leftIcon="lock"
        leftIconColor="#FF4F4F"
        hint={t('vault.entry.detail.credentialLocked')}
        monospace
      />
    </>
  )
}

function copyLabel(
  field: 'value' | 'username' | 'password',
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (field === 'value') return t('vault.entry.copyKey')
  if (field === 'username') return t('vault.entry.copyUsername')
  return t('vault.entry.copyPassword')
}

interface SecretFieldProps {
  id: string
  label: string
  revealed: boolean
  revealedValue: string
  onToggleReveal: () => void
  onCopy: () => void
  leftIcon: string
  leftIconColor: string
  hint?: string
  monospace?: boolean
}

function SecretField({
  id,
  label,
  revealed,
  revealedValue,
  onToggleReveal,
  onCopy,
  leftIcon,
  leftIconColor,
  hint,
  monospace,
}: SecretFieldProps) {
  const { t } = useTranslation()
  const isLockIcon = leftIcon === 'lock'
  const displayValue = revealed ? revealedValue : '••••••••••'

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
      >
        {label}
      </label>
      <div className="relative">
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
          style={{ color: leftIconColor, opacity: isLockIcon ? 0.7 : 1 }}
        >
          <Icon name={leftIcon} size={15} color={leftIconColor} />
        </span>
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={displayValue}
          readOnly
          aria-readonly
          className={`w-full rounded-lg border border-[rgba(255,79,79,0.18)]
            bg-[rgba(255,79,79,0.04)] py-2 pl-8 pr-20 text-[12px]
            text-[var(--cv-t3)] cursor-not-allowed focus:outline-none ${
            monospace ? 'font-mono tracking-wide' : ''
          }`}
        />
        <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <button
            type="button"
            onClick={onToggleReveal}
            title={revealed ? t('vault.entry.hide') : t('vault.entry.reveal')}
            aria-label={revealed ? t('vault.entry.hide') : t('vault.entry.reveal')}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--cv-t3)]
              hover:bg-[var(--cv-btn-ghost-hover)] hover:text-[var(--cv-t1)]"
          >
            <Icon name={revealed ? 'visibility_off' : 'visibility'} size={15} />
          </button>
          <button
            type="button"
            onClick={onCopy}
            title={t('vault.entry.copyKey')}
            aria-label={t('vault.entry.copyKey')}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--cv-t3)]
              hover:bg-[var(--cv-btn-ghost-hover)] hover:text-[var(--cv-t1)]"
          >
            <Icon name="content_copy" size={15} />
          </button>
        </div>
      </div>
      {hint ? (
        <span className="mt-1 block text-[11px] text-[var(--cv-t3)]">{hint}</span>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Metadata card + Danger zone
// ---------------------------------------------------------------------------

function MetadataCard({ entry }: { entry: EntryDetail }) {
  const { t } = useTranslation()
  return (
    <div
      className="mt-3.5 mb-3.5 rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4
        shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
    >
      <div className="flex flex-col gap-2 text-[11px]">
        <MetaRow
          label={t('vault.entry.detail.createdLabel')}
          value={formatDate(entry.createdAt)}
        />
        <MetaRow
          label={t('vault.entry.detail.modifiedLabel')}
          value={formatDate(entry.updatedAt)}
          withDivider
        />
        <MetaRow
          label={t('vault.entry.detail.accessedLabel')}
          value={formatAccess(entry.lastAccessedAt, entry.accessCount, t)}
          withDivider
        />
      </div>
    </div>
  )
}

function MetaRow({
  label,
  value,
  withDivider,
}: {
  label: string
  value: string
  withDivider?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        withDivider ? 'border-t border-[var(--cv-divider)] pt-2' : ''
      }`}
    >
      <span className="text-[var(--cv-t3)]">{label}</span>
      <span className="text-right text-[var(--cv-t2)]">{value}</span>
    </div>
  )
}

function formatDate(iso: string): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return iso
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatAccess(
  lastAccessedAt: string | undefined,
  accessCount: number,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (!lastAccessedAt) return t('vault.entry.detail.neverAccessed')
  return `${formatDate(lastAccessedAt)} · ${t('vault.entry.detail.accessedTimes', {
    count: accessCount,
  })}`
}

function DangerZone({
  onDelete,
  disabled,
}: {
  onDelete: () => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  return (
    <section
      className="rounded-xl border border-[rgba(255,79,79,0.25)] bg-[rgba(255,79,79,0.04)] p-4"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#FF4F4F]">
        {t('vault.entry.detail.dangerZoneTitle')}
      </h2>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold text-[var(--cv-t1)]">
            {t('vault.entry.detail.deleteTitle')}
          </div>
          <p className="mt-1 text-[11px] text-[var(--cv-t3)]">
            {t('vault.entry.detail.deleteSubtitle')}
          </p>
        </div>
        <Button variant="danger" size="sm" onClick={onDelete} disabled={disabled}>
          {t('vault.entry.detail.deleteButton')}
        </Button>
      </div>
    </section>
  )
}

interface DeleteEntryDialogProps {
  open: boolean
  entryLabel: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

function DeleteEntryDialog({
  open,
  entryLabel,
  isPending,
  onConfirm,
  onCancel,
}: DeleteEntryDialogProps) {
  const { t } = useTranslation()
  if (!open) return null
  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('vault.entry.detail.deleteConfirmTitle', { label: entryLabel })}
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-[var(--cv-t1)]">
          {t('vault.entry.detail.deleteConfirmTitle', { label: entryLabel })}
        </h2>
        <p className="text-sm text-[var(--cv-t2)]">
          {t('vault.entry.detail.deleteConfirmText')}
        </p>

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            {t('vault.cancel')}
          </Button>
          <Button variant="accent" onClick={onConfirm} disabled={isPending}>
            {isPending
              ? t('vault.deleting')
              : t('vault.entry.detail.deleteButton')}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Small reusable bits
// ---------------------------------------------------------------------------

interface LabeledInputProps {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  disabled?: boolean
  maxLength?: number
  required?: boolean
  type?: string
  inputMode?: 'text' | 'url' | 'email' | 'tel' | 'numeric' | 'decimal' | 'search'
}

function LabeledInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
  maxLength,
  required,
  type = 'text',
  inputMode,
}: LabeledInputProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        required={required}
        inputMode={inputMode}
        autoComplete="off"
        className="w-full rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)]
          px-3 py-2 text-[12px] text-[var(--cv-t1)] placeholder:text-[var(--cv-t3)]
          focus:outline-none focus:ring-1 focus:ring-[#FF4F4F]"
      />
    </div>
  )
}

function EmptyMessage({ message }: { message: string }) {
  return (
    <div
      className="rounded-2xl border border-dashed border-[var(--cv-empty-border)]
        bg-[var(--cv-empty-bg)] p-8 text-center text-sm text-[var(--cv-t3)]"
    >
      {message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BuildPatchInput {
  label: string
  description: string
  icon: string | undefined
  entry: EntryDetail
  url: string
}

function buildPatch({
  label,
  description,
  icon,
  entry,
  url,
}: BuildPatchInput): UpdateEntryInput {
  const patch: UpdateEntryInput = {}
  const trimmedLabel = label.trim()
  if (trimmedLabel !== entry.label) patch.label = trimmedLabel
  const trimmedDescription = description.trim()
  if ((trimmedDescription || undefined) !== (entry.description ?? undefined)) {
    patch.description = trimmedDescription
  }
  if (icon !== entry.icon) patch.icon = icon
  if (entry.type === ENTRY_TYPE_CREDENTIAL) {
    const nextDomain = extractDomain(url)
    if (nextDomain !== entry.urlDomain) patch.urlDomain = nextDomain
  }
  return patch
}
