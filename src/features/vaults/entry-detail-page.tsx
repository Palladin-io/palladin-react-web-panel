import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { ErrorState } from '../../shared/components/error-state'
import { FormInput } from '../../shared/components/form-field'
import { Icon } from '../../shared/components/icon'
import { decryptEntry, encryptEntry } from '../../shared/crypto/entry-crypto'
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
import { hexWithAlpha } from './components/vault-color'
import { VaultDetailHeader } from './components/vault-detail-header'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  type EntryContent,
  type EntryDetail,
  type EntryPlaintext,
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

  const presentation = presentationForType(entry.type)
  const entryIconName = isCustomIconUrl(entry.icon)
    ? presentation.defaultIcon
    : (entry.icon ?? presentation.defaultIcon)
  const entryIconColor = ENTRY_ICON_COLORS[entryIconName] ?? presentation.iconColor

  return (
    <>
      <VaultDetailHeader
        title={entry.label}
        subtitle={vault.name}
        onBack={onBack}
        iconElement={
          isCustomIconUrl(entry.icon) ? (
            <img
              src={entry.icon}
              alt=""
              className="h-9 w-9 rounded-full object-cover shrink-0"
            />
          ) : (
            <span
              aria-hidden
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: hexWithAlpha(entryIconColor, 0.15),
                color: entryIconColor,
              }}
            >
              <Icon name={entryIconName} size={18} color={entryIconColor} />
            </span>
          )
        }
        actions={
          activeTab === 'agents' ? (
            <Button variant="accent" size="sm" icon="add">
              {t('vault.detail.addAgent')}
            </Button>
          ) : undefined
        }
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
  const [url, setUrl] = useState('')
  const [showDelete, setShowDelete] = useState(false)

  // Encrypted field state — populated after decrypt.
  const [secretValue, setSecretValue] = useState('') // KEY only
  const [username, setUsername] = useState('') // CREDENTIAL only
  const [password, setPassword] = useState('') // CREDENTIAL only
  const [notes, setNotes] = useState('') // both types

  // Original plaintext for change detection / discard.
  const [originalPlaintext, setOriginalPlaintext] = useState<EntryPlaintext | null>(null)
  const [decryptError, setDecryptError] = useState<string | null>(null)
  const [decrypting, setDecrypting] = useState(false)

  // Reveal toggles.
  const [showSecret, setShowSecret] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Reset local metadata form when the server payload changes (e.g. after a save).
  useEffect(() => {
    setLabel(entry.label)
    setDescription(entry.description ?? '')
    setIcon(entry.icon)
    setPendingIconFile(null)
  }, [entry.label, entry.description, entry.icon, entry.urlDomain])

  // Decrypt the encrypted blob once when the wrapped VK is available.
  // Intentionally omit `entry.content` from deps — decrypt happens once on
  // mount, after a save the cache invalidation supplies fresh content and
  // we re-seed local state from the new originalPlaintext.
  useEffect(() => {
    if (!vault.wrappedVK) return
    const privateKey = useAuthStore.getState().privateKey
    if (!privateKey) {
      setDecryptError(t('vault.entry.detail.decryptError'))
      return
    }
    setDecrypting(true)
    void (async () => {
      try {
        const vaultKey = await unsealVaultKey(vault.wrappedVK!, privateKey)
        try {
          const pt = await decryptEntry(entry.content, vaultKey)
          setOriginalPlaintext(pt)
          if (pt.type === ENTRY_TYPE_KEY) {
            setSecretValue(pt.value)
            setNotes(pt.notes ?? '')
          } else {
            setUsername(pt.username)
            setPassword(pt.password)
            setUrl(pt.url ?? (entry.urlDomain ? `https://${entry.urlDomain}` : ''))
            setNotes(pt.notes ?? '')
          }
        } finally {
          wipe(vaultKey)
        }
      } catch {
        setDecryptError(t('vault.entry.detail.decryptError'))
      } finally {
        setDecrypting(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.wrappedVK])

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
    if (!originalPlaintext) return false
    if (originalPlaintext.type === ENTRY_TYPE_KEY) {
      if (secretValue !== originalPlaintext.value) return true
      if (notes !== (originalPlaintext.notes ?? '')) return true
    } else {
      if (username !== originalPlaintext.username) return true
      if (password !== originalPlaintext.password) return true
      if (notes !== (originalPlaintext.notes ?? '')) return true
      const origUrl = originalPlaintext.url ?? (entry.urlDomain ? `https://${entry.urlDomain}` : '')
      if (url !== origUrl) return true
    }
    return false
  }, [
    label,
    description,
    icon,
    pendingIconFile,
    secretValue,
    username,
    password,
    notes,
    url,
    originalPlaintext,
    entry,
  ])

  const handleDiscard = () => {
    setLabel(entry.label)
    setDescription(entry.description ?? '')
    setIcon(entry.icon)
    setPendingIconFile(null)
    if (originalPlaintext) {
      if (originalPlaintext.type === ENTRY_TYPE_KEY) {
        setSecretValue(originalPlaintext.value)
        setNotes(originalPlaintext.notes ?? '')
      } else {
        setUsername(originalPlaintext.username)
        setPassword(originalPlaintext.password)
        setUrl(originalPlaintext.url ?? (entry.urlDomain ? `https://${entry.urlDomain}` : ''))
        setNotes(originalPlaintext.notes ?? '')
      }
    }
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

    // Re-encrypt if any encrypted field changed.
    let newContent: EntryContent | undefined
    const contentChanged =
      !!originalPlaintext &&
      (() => {
        if (originalPlaintext.type === ENTRY_TYPE_KEY) {
          return (
            secretValue !== originalPlaintext.value ||
            notes !== (originalPlaintext.notes ?? '')
          )
        }
        const origUrl =
          originalPlaintext.url ?? (entry.urlDomain ? `https://${entry.urlDomain}` : '')
        return (
          username !== originalPlaintext.username ||
          password !== originalPlaintext.password ||
          notes !== (originalPlaintext.notes ?? '') ||
          url !== origUrl
        )
      })()

    if (contentChanged) {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey || !vault.wrappedVK) {
        toast.error(t('vault.entry.detail.decryptError'))
        return
      }
      try {
        const vaultKey = await unsealVaultKey(vault.wrappedVK, privateKey)
        try {
          const newPlaintext: EntryPlaintext =
            entry.type === ENTRY_TYPE_KEY
              ? {
                  type: ENTRY_TYPE_KEY,
                  value: secretValue.trim(),
                  ...(notes.trim() ? { notes: notes.trim() } : {}),
                }
              : {
                  type: ENTRY_TYPE_CREDENTIAL,
                  username: username.trim(),
                  password,
                  ...(url.trim() ? { url: url.trim() } : {}),
                  ...(notes.trim() ? { notes: notes.trim() } : {}),
                }
          newContent = await encryptEntry(newPlaintext, vaultKey)
        } finally {
          wipe(vaultKey)
        }
      } catch {
        toast.error(t('vault.entry.detail.saveError'))
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
    if (newContent) patch.content = newContent

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

          <FormInput
            id="entry-detail-label"
            label={t('vault.entries.labelLabel')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('vault.entries.labelPlaceholder')}
            disabled={isSaving}
            maxLength={120}
            required
          />

          <FormInput
            id="entry-detail-description"
            label={t('vault.entries.descriptionLabel')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('vault.entries.descriptionPlaceholder')}
            disabled={isSaving}
            maxLength={500}
          />

          {decryptError ? (
            <div className="rounded-lg border border-[rgba(255,79,79,0.25)] bg-[rgba(255,79,79,0.06)] px-3 py-2 text-[11px] text-[#FF4F4F]">
              {decryptError}
            </div>
          ) : entry.type === ENTRY_TYPE_KEY ? (
            <PasswordInput
              id="entry-detail-value"
              label={t('vault.entries.valueLabel')}
              value={secretValue}
              onChange={setSecretValue}
              shown={showSecret}
              onToggleShow={() => setShowSecret((v) => !v)}
              disabled={isSaving || decrypting}
              monospace
            />
          ) : (
            <>
              <FormInput
                id="entry-detail-username"
                label={t('vault.entries.usernameLabel')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSaving || decrypting}
              />
              <PasswordInput
                id="entry-detail-password"
                label={t('vault.entries.passwordLabel')}
                value={password}
                onChange={setPassword}
                shown={showPassword}
                onToggleShow={() => setShowPassword((v) => !v)}
                disabled={isSaving || decrypting}
                monospace
              />
              <FormInput
                id="entry-detail-url"
                label={t('vault.entries.urlLabel')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('vault.entries.urlPlaceholder')}
                disabled={isSaving || decrypting}
                type="url"
                inputMode="url"
              />
            </>
          )}

          <div>
            <label
              htmlFor="entry-detail-notes"
              className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
            >
              {t('vault.entries.notesLabel')}
            </label>
            <textarea
              id="entry-detail-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={isSaving || decrypting}
              placeholder={t('vault.entries.notesPlaceholder')}
              className="w-full resize-none rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)]
                px-3 py-2 text-[12px] text-[var(--cv-input-text)] placeholder:text-[var(--cv-input-placeholder)]
                focus:outline-none focus:border-[var(--cv-t1)] disabled:opacity-60"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-[var(--cv-divider)] pt-4">
          <Button
            variant="subtle"
            size="sm"
            onClick={handleDiscard}
            disabled={isSaving || !hasChanges}
          >
            {t('vault.entry.detail.discard')}
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? t('vault.entry.detail.saving') : t('vault.entry.detail.save')}
          </Button>
        </div>
      </div>

      <div className="mt-3.5">
        <DangerZone
          onDelete={() => setShowDelete(true)}
          disabled={isRemoving}
        />
      </div>

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
// Password input (toggleable reveal)
// ---------------------------------------------------------------------------

interface PasswordInputProps {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  shown: boolean
  onToggleShow: () => void
  disabled?: boolean
  monospace?: boolean
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  shown,
  onToggleShow,
  disabled,
  monospace,
}: PasswordInputProps) {
  const { t } = useTranslation()
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          className={`w-full rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)]
            py-2 pl-3 pr-9 text-[12px] text-[var(--cv-input-text)] placeholder:text-[var(--cv-input-placeholder)]
            focus:outline-none focus:border-[var(--cv-t1)] disabled:opacity-60 ${
              monospace ? 'font-mono tracking-wide' : ''
            }`}
        />
        <button
          type="button"
          onClick={onToggleShow}
          title={shown ? t('vault.entry.hide') : t('vault.entry.reveal')}
          aria-label={shown ? t('vault.entry.hide') : t('vault.entry.reveal')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center
            justify-center rounded text-[var(--cv-t3)] hover:bg-[var(--cv-btn-ghost-hover)] hover:text-[var(--cv-t1)]"
        >
          <Icon name={shown ? 'visibility_off' : 'visibility'} size={14} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

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
