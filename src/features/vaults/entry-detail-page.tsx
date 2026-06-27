import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { ErrorState } from '../../shared/components/error-state'
import { FieldFeedback, FormInput } from '../../shared/components/form-field'
import { FormTextarea } from '../../shared/components/form-textarea'
import { SecretInput } from '../../shared/components/secret-input'
import { firstError, required, validUrl } from '../../shared/lib/validation'
import { decryptEntry, encryptEntry } from '../../shared/crypto/entry-crypto'
import { wipe } from '../../shared/crypto/sodium'
import { unsealVaultKey } from '../../shared/crypto/vault-key'
import { useWideScreen } from '../../shared/hooks/use-wide-screen'
import { analytics } from '../../shared/lib/analytics'
import { PERMISSION_GRANT_MANAGE } from '../../shared/lib/permissions'
import { useAuthStore } from '../auth'
import {
  GRANT_STATUS_ACTIVE,
  GrantAccessDialog,
  OrgGrantsPanel,
  useOrgGrants,
} from '../grants'
import { EntryIconPicker } from './components/entry-icon-picker'
import { EntryLogsTab } from './components/entry-logs-tab'
import {
  ENTRY_ICON_COLORS,
  extractDomain,
} from './components/entry-presentation'
import { ModalShell } from '../../shared/components/modal-shell'
import { VaultDetailHeader } from './components/vault-detail-header'
import { VaultEntriesPanel } from './components/vault-entries-panel'
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
  const [addAgentOpen, setAddAgentOpen] = useState(false)
  const isWide = useWideScreen(1280)

  const handleBack = () => navigate({ to: '/vaults/$vaultId', params: { vaultId } })
  const onDeleted = () => navigate({ to: '/vaults/$vaultId', params: { vaultId } })

  const detailContent = vault.isPending || entry.isPending ? (
    <PageSkeleton />
  ) : vault.isError || !vault.data ? (
    <ErrorState message={t('vault.errorLoad')} onRetry={vault.refetch} />
  ) : entry.isError || !entry.data ? (
    <ErrorState
      message={t('vault.entry.detail.loadError')}
      onRetry={entry.refetch}
    />
  ) : (
    <>
      <DetailBody
        vault={vault.data}
        entry={entry.data}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onBack={handleBack}
        onDeleted={onDeleted}
        onAddAgent={() => setAddAgentOpen(true)}
        hideHeader={isWide}
      />
      {addAgentOpen && (
        <GrantAccessDialog
          mode={{ kind: 'agent-for-entry', vaultId, entryId }}
          onClose={() => setAddAgentOpen(false)}
        />
      )}
    </>
  )

  if (isWide) {
    return (
      <div className="flex h-full text-[var(--cv-t1)]">
        <div className="w-[clamp(300px,22vw,400px)] shrink-0 overflow-y-auto border-r border-[var(--cv-border)]">
          <div className="px-4 py-4">
            {vault.data ? (
              <VaultEntriesPanel vault={vault.data} selectedEntryId={entryId} />
            ) : (
              <div className="h-32 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="px-4 py-4">{detailContent}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[var(--cv-t1)]">
      <div className="px-6 py-8">{detailContent}</div>
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
  /** Omitted in split-view (wide screens) to hide the back arrow. */
  onBack?: () => void
  onDeleted: () => void
  onAddAgent: () => void
  hideHeader?: boolean
}

function DetailBody({
  vault,
  entry,
  activeTab,
  onTabChange,
  onBack,
  onDeleted,
  onAddAgent,
  hideHeader = false,
}: DetailBodyProps) {
  const { t } = useTranslation()

  // Active-agent count for the header. Reuses the same (deduped) org-grants query
  // the embedded Agents-tab panel runs, gated on GrantManage so users without it
  // never trigger a 403; the count falls back to 0 until/unless it loads.
  const permissions = useAuthStore((s) => s.permissions)
  const canManageGrants = (permissions & PERMISSION_GRANT_MANAGE) !== 0
  const grants = useOrgGrants({ entryId: entry.id }, canManageGrants)
  const agentCount = useMemo(() => {
    const ids = new Set<string>()
    for (const g of grants.data?.items ?? []) {
      if (g.status === GRANT_STATUS_ACTIVE && g.agentId) ids.add(g.agentId)
    }
    return ids.size
  }, [grants.data])

  const subtitle = [
    t('vault.entry.detail.subtitleAgents', { count: agentCount }),
    t('vault.entry.detail.subtitleLogs', { count: entry.accessCount }),
  ].join(' · ')

  const handleTabChange = (next: EntryDetailTab) => {
    if (next !== activeTab) {
      analytics.capture('entry', 'detail-tab-switched', {
        type: entry.type === ENTRY_TYPE_KEY ? 'key' : 'credential',
        tab: next,
      })
    }
    onTabChange(next)
  }

  const agentAction = (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-[var(--cv-t3)]">
        {t('vault.entry.detail.agentsWithAccess', { count: agentCount })}
      </span>
      <Button variant="accent" size="sm" icon="add" onClick={onAddAgent}>
        {t('vault.detail.addAgent')}
      </Button>
    </div>
  )

  return (
    <>
      {!hideHeader && (
        <VaultDetailHeader
          title={entry.label}
          subtitle={subtitle}
          onBack={onBack}
          actions={activeTab === 'agents' ? agentAction : undefined}
        />
      )}
      <EntryDetailTabs
        active={activeTab}
        onChange={handleTabChange}
        wide={hideHeader}
        actions={hideHeader && activeTab === 'agents' ? agentAction : undefined}
      />
      {activeTab === 'details' ? (
        <DetailsTab
          key={entry.id}
          vault={vault}
          entry={entry}
          onDeleted={onDeleted}
        />
      ) : null}
      {activeTab === 'agents' ? (
        // Same org-grants panel, scoped strictly to this entry (GRANULAR grants
        // on this exact entry only) — one component, many locations.
        <OrgGrantsPanel entryId={entry.id} />
      ) : null}
      {activeTab === 'logs' ? (
        <EntryLogsTab vaultId={vault.id} entryId={entry.id} />
      ) : null}
    </>
  )
}

interface EntryDetailTabsProps {
  active: EntryDetailTab
  onChange: (next: EntryDetailTab) => void
  wide?: boolean
  actions?: ReactNode
}

function EntryDetailTabs({ active, onChange, wide, actions }: EntryDetailTabsProps) {
  const { t } = useTranslation()
  const tabs: { id: EntryDetailTab; labelKey: string }[] = [
    { id: 'details', labelKey: 'vault.entry.detail.detailsTab' },
    { id: 'agents', labelKey: 'vault.entry.detail.agentsTab' },
    { id: 'logs', labelKey: 'vault.entry.detail.logsTab' },
  ]

  const tabButtons = tabs.map((tab) => {
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
            ? 'border-[var(--cv-primary)] font-bold text-[var(--cv-primary)]'
            : 'border-transparent font-medium text-[var(--cv-t3)] hover:text-[var(--cv-t1)]'
        }`}
      >
        {t(tab.labelKey)}
      </button>
    )
  })

  if (wide) {
    return (
      <div className="mb-4 flex h-10 items-end">
        <div className="flex shrink-0 border-b border-[var(--cv-divider)]" role="tablist">
          {tabButtons}
        </div>
        <div className="h-px flex-1 self-end bg-gradient-to-r from-[var(--cv-divider)] to-transparent" />
        {actions ? (
          <div className="flex shrink-0 self-center items-center gap-1">
            {actions}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mb-3 flex border-b border-[var(--cv-divider)]" role="tablist">
      {tabButtons}
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
  const [color, setColor] = useState<string>(
    entry.color ?? (ENTRY_ICON_COLORS[entry.icon ?? ''] ?? (entry.type === ENTRY_TYPE_KEY ? '#10B981' : '#60A5FA'))
  )
  const [url, setUrl] = useState(
    entry.type === ENTRY_TYPE_KEY
      ? (entry.urlDomain ? `https://${entry.urlDomain}` : '')
      : ''
  )
  const [urlError, setUrlError] = useState(false)
  const [labelError, setLabelError] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  // Encrypted field state — populated after decrypt.
  const [secretValue, setSecretValue] = useState('') // KEY only
  const [secretValueError, setSecretValueError] = useState(false)
  const [username, setUsername] = useState('') // CREDENTIAL only
  const [usernameError, setUsernameError] = useState(false)
  const [password, setPassword] = useState('') // CREDENTIAL only
  const [passwordError, setPasswordError] = useState(false)
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
    setColor(
      entry.color ?? (ENTRY_ICON_COLORS[entry.icon ?? ''] ?? (entry.type === ENTRY_TYPE_KEY ? '#10B981' : '#60A5FA'))
    )
    if (entry.type === ENTRY_TYPE_KEY) {
      setUrl(entry.urlDomain ? `https://${entry.urlDomain}` : '')
    }
  }, [entry.label, entry.description, entry.icon, entry.color, entry.type, entry.urlDomain])

  // Decrypt when entry changes or when wrappedVK becomes available.
  // Resetting plaintext at the start ensures stale values from a previous
  // entry are never compared against the current entry's fields.
  //
  // The `cancelled` flag guards against a stale resolution: in split-view
  // the user can switch entries faster than a decrypt completes, and
  // `DetailsTab` is not remounted/keyed per entry — without the guard an
  // async from entry A could land on entry B and leak A's secret into B's
  // form. Same pattern as `entry-row.tsx`.
  useEffect(() => {
    let cancelled = false
    setOriginalPlaintext(null)
    setDecryptError(null)
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
          if (cancelled) return
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
        if (!cancelled) setDecryptError(t('vault.entry.detail.decryptError'))
      } finally {
        if (!cancelled) setDecrypting(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.wrappedVK, entry.id])

  const iconUpload = useEntryIconUpload(vault.id, entry.id, (publicUrl) => {
    setIcon(publicUrl)
    setPendingIconFile(null)
  })

  const isSaving = update.isPending || iconUpload.isUploading
  const isRemoving = remove.isPending

  const defaultColor =
    entry.color ?? (ENTRY_ICON_COLORS[entry.icon ?? ''] ?? (entry.type === ENTRY_TYPE_KEY ? '#10B981' : '#60A5FA'))

  const hasChanges = useMemo(() => {
    if (label.trim() !== entry.label) return true
    if ((description.trim() || undefined) !== (entry.description ?? undefined))
      return true
    if (icon !== entry.icon) return true
    if (color !== defaultColor) return true
    if (pendingIconFile) return true
    if (!originalPlaintext) return false
    if (originalPlaintext.type === ENTRY_TYPE_KEY) {
      if (secretValue !== originalPlaintext.value) return true
      if (notes !== (originalPlaintext.notes ?? '')) return true
      const origKeyUrl = entry.urlDomain ? `https://${entry.urlDomain}` : ''
      if (url !== origKeyUrl) return true
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
    color,
    defaultColor,
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
    setColor(defaultColor)
    setPendingIconFile(null)
    setUrlError(false)
    if (originalPlaintext) {
      if (originalPlaintext.type === ENTRY_TYPE_KEY) {
        setSecretValue(originalPlaintext.value)
        setNotes(originalPlaintext.notes ?? '')
        setUrl(entry.urlDomain ? `https://${entry.urlDomain}` : '')
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
      setLabelError(true)
      return
    }
    if (originalPlaintext) {
      if (entry.type === ENTRY_TYPE_KEY && !secretValue.trim()) {
        setSecretValueError(true)
        return
      }
      if (entry.type === ENTRY_TYPE_CREDENTIAL) {
        const u = !username.trim()
        const p = !password.trim()
        if (u) setUsernameError(true)
        if (p) setPasswordError(true)
        if (u || p) return
      }
    }

    // Pending icon file → upload first, then PATCH metadata. Upload
    // already PATCHes `icon`; only ship the remaining fields here so we
    // don't overwrite the freshly-set URL. We trust the boolean return
    // value rather than `iconUpload.error` — that field belongs to the
    // captured render and stays `null` for the rest of this callback.
    if (pendingIconFile) {
      const uploaded = await iconUpload.upload(pendingIconFile)
      if (!uploaded) {
        toast.error(t('vault.iconUploadError.failed'))
        return
      }
    }

    // Re-encrypt if any encrypted field changed.
    let newContent: EntryContent | undefined
    let savedPlaintext: EntryPlaintext | undefined
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
          savedPlaintext = newPlaintext
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
      color,
      defaultColor,
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
        if (savedPlaintext) setOriginalPlaintext(savedPlaintext)
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
          dark:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
      >
        <div className="flex gap-5 items-start">
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            <div className="-mb-4">
              <FormInput
                id="entry-detail-label"
                label={t('vault.entries.labelLabel')}
                value={label}
                onChange={(e) => { setLabel(e.target.value); setLabelError(false) }}
                onBlur={() =>
                  setLabelError(
                    firstError(label, [required(t('validation.required'))]) !== null,
                  )
                }
                placeholder={t('vault.entries.labelPlaceholder')}
                disabled={isSaving}
                maxLength={120}
                error={labelError}
              />
              <FieldFeedback visible={labelError} color="red">
                {t('validation.required')}
              </FieldFeedback>
            </div>
            <FormInput
              id="entry-detail-description"
              label={t('vault.entries.descriptionLabel')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('vault.entries.descriptionPlaceholder')}
              disabled={isSaving}
              maxLength={500}
            />
            <div className="-mb-4">
              <FormInput
                id="entry-detail-url"
                label={t('vault.entries.urlLabel')}
                value={url}
                onChange={(e) => { setUrl(e.target.value); setUrlError(false) }}
                onBlur={() =>
                  setUrlError(
                    firstError(url.trim(), [validUrl(t('validation.invalidUrl'))]) !== null,
                  )
                }
                placeholder={t('vault.entries.urlPlaceholder')}
                disabled={isSaving}
                inputMode="url"
                error={urlError}
              />
              <FieldFeedback visible={urlError} color="red">
                {t('validation.invalidUrl')}
              </FieldFeedback>
            </div>
            {decryptError ? (
              <div className="rounded-lg border border-[rgb(var(--cv-primary-rgb)/0.25)] bg-[rgb(var(--cv-primary-rgb)/0.06)] px-3 py-2 text-[11px] text-[var(--cv-primary)]">
                {decryptError}
              </div>
            ) : entry.type === ENTRY_TYPE_KEY ? (
              <div className="-mb-4">
                <SecretInput
                  id="entry-detail-value"
                  label={t('vault.entries.valueLabel')}
                  value={secretValue}
                  onChange={(next) => { setSecretValue(next); setSecretValueError(false) }}
                  onBlur={() =>
                    setSecretValueError(
                      firstError(secretValue, [required(t('validation.required'))]) !== null,
                    )
                  }
                  shown={showSecret}
                  onToggleShown={() => setShowSecret((v) => !v)}
                  disabled={isSaving || decrypting}
                  monospace
                  error={secretValueError}
                />
                <FieldFeedback visible={secretValueError} color="red">
                  {t('validation.required')}
                </FieldFeedback>
              </div>
            ) : (
              <div className="flex gap-3 -mb-4">
                <div className="flex-1 min-w-0">
                  <FormInput
                    id="entry-detail-username"
                    label={t('vault.entries.usernameLabel')}
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setUsernameError(false) }}
                    onBlur={() =>
                      setUsernameError(
                        firstError(username, [required(t('validation.required'))]) !== null,
                      )
                    }
                    disabled={isSaving || decrypting}
                    error={usernameError}
                  />
                  <FieldFeedback visible={usernameError} color="red">
                    {t('validation.required')}
                  </FieldFeedback>
                </div>
                <div className="flex-1 min-w-0">
                  <SecretInput
                    id="entry-detail-password"
                    label={t('vault.entries.passwordLabel')}
                    value={password}
                    onChange={(next) => { setPassword(next); setPasswordError(false) }}
                    onBlur={() =>
                      setPasswordError(
                        firstError(password, [required(t('validation.required'))]) !== null,
                      )
                    }
                    shown={showPassword}
                    onToggleShown={() => setShowPassword((v) => !v)}
                    disabled={isSaving || decrypting}
                    monospace
                    error={passwordError}
                  />
                  <FieldFeedback visible={passwordError} color="red">
                    {t('validation.required')}
                  </FieldFeedback>
                </div>
              </div>
            )}
            <FormTextarea
              id="entry-detail-notes"
              label={t('vault.entries.notesLabel')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={isSaving || decrypting}
              placeholder={t('vault.entries.notesPlaceholder')}
            />
          </div>
          <div className="w-60 shrink-0 flex flex-col gap-4">
            <EntryIconPicker
              value={icon}
              onChange={(next) => {
                setIcon(next)
                setPendingIconFile(null)
              }}
              onColorChange={setColor}
              selectedColor={color}
              disabled={isSaving}
              rowClassName="grid grid-cols-5 gap-1.5 justify-items-center"
              maxVisible={35}
              onFileSelected={(file, previewUrl) => {
                setPendingIconFile(file)
                setIcon(previewUrl)
              }}
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
      className="rounded-xl border border-[rgb(var(--cv-primary-rgb)/0.25)] bg-[rgb(var(--cv-primary-rgb)/0.04)] p-4"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--cv-primary)]">
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
// Helpers
// ---------------------------------------------------------------------------

interface BuildPatchInput {
  label: string
  description: string
  icon: string | undefined
  color: string
  /**
   * Derived baseline used to detect a real colour change — matches
   * `hasChanges` so an entry without an explicit colour does not get a
   * spurious `patch.color` of the derived value when other fields change.
   */
  defaultColor: string
  entry: EntryDetail
  url: string
}

function buildPatch({
  label,
  description,
  icon,
  color,
  defaultColor,
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
  if (color !== defaultColor) patch.color = color
  const nextDomain = extractDomain(url)
  if (nextDomain !== entry.urlDomain) patch.urlDomain = nextDomain
  return patch
}
