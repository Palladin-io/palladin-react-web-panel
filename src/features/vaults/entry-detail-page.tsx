import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { ErrorState } from '../../shared/components/error-state'
import { Icon } from '../../shared/components/icon'
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
import { EntryIconButton } from './components/entry-icon-button'
import { EntryLogsTab } from './components/entry-logs-tab'
import {
  ENTRY_ICON_COLORS,
  extractDomain,
} from './components/entry-presentation'
import { ModalShell } from '../../shared/components/modal-shell'
import { VaultDetailHeader } from './components/vault-detail-header'
import { VaultEntriesPanel } from './components/vault-entries-panel'
import {
  BLOB_VERSION_V2,
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
  SCRIPT_INTERPRETERS,
  type CustomField,
  type EntryContent,
  type EntryDetail,
  type EntryPlaintext,
  type ScriptInterpreter,
  type ScriptRef,
  type Vault,
} from './types'
import {
  DEFAULT_TOTP_LABEL,
  agentFieldsFrom,
  foldCustomFields,
  foldScriptRefs,
  mergeCredentialTotp,
  newFieldId,
  plaintextsEqual,
  readCustomFields,
  splitCredentialTotp,
  validateCustomFields,
} from './entry-blob'
import { parseOtpauthUri } from '../../shared/crypto/totp'
import { CustomFieldsEditor } from './components/custom-fields-editor'
import { CredentialTotpField } from './components/credential-totp-field'
import { ScriptEditor } from './components/script-editor'
import { ScriptExecHint } from './components/script-exec-hint'
import { ScriptRefsEditor } from './components/script-refs-editor'
import { SectionHeader } from './components/section-header'
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
      <div className="flex h-full overflow-hidden text-[var(--cv-t1)]">
        <div className="w-[clamp(300px,22vw,400px)] shrink-0 overflow-hidden border-r border-[var(--cv-border)]">
          <div className="h-full px-4 pt-4">
            {vault.data ? (
              <VaultEntriesPanel vault={vault.data} selectedEntryId={entryId} />
            ) : (
              <div className="h-32 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
            )}
          </div>
        </div>
        <div className="subtle-scrollbar flex-1 overflow-y-auto min-w-0">
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

  // Custom fields + script state (populated after decrypt).
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [credentialTotp, setCredentialTotp] = useState<CustomField | null>(null) // CREDENTIAL only
  const [script, setScript] = useState('') // SCRIPT only
  const [scriptError, setScriptError] = useState(false)
  const [interpreter, setInterpreter] = useState<ScriptInterpreter>('bash')
  const [refs, setRefs] = useState<ScriptRef[]>([])

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
          if (pt.type === ENTRY_TYPE_KEY) {
            setOriginalPlaintext(pt)
            setCustomFields(readCustomFields(pt))
            setSecretValue(pt.value)
            setNotes(pt.notes ?? '')
          } else if (pt.type === ENTRY_TYPE_SCRIPT) {
            setOriginalPlaintext(pt)
            setCustomFields(readCustomFields(pt))
            setScript(pt.script)
            setInterpreter(pt.interpreter)
            setRefs(pt.refs ?? [])
            setNotes(pt.notes ?? '')
          } else {
            // CREDENTIAL: pin the first TOTP field into the dedicated 2FA row.
            // A legacy top-level `totp` URI (string) with no TOTP field is
            // migrated to a field object; the baseline reflects that migration
            // so the form isn't spuriously dirty on load.
            const { pinned, rest, baseline } = pinCredentialTotp(pt)
            setOriginalPlaintext(baseline)
            setCredentialTotp(pinned)
            setCustomFields(rest)
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

  // Rebuild the plaintext from the current form state, preserving un-edited
  // well-known fields (e.g. a credential's stored `totp`) that this UI doesn't
  // expose. Used for both change detection and re-encryption on save.
  const currentPlaintext = useCallback((): EntryPlaintext | null => {
    if (!originalPlaintext) return null
    return buildCurrentPlaintext(originalPlaintext, entry, {
      secretValue,
      username,
      password,
      notes,
      url,
      script,
      interpreter,
      refs,
      customFields,
      credentialTotp,
    })
  }, [
    originalPlaintext,
    entry,
    secretValue,
    username,
    password,
    notes,
    url,
    script,
    interpreter,
    refs,
    customFields,
    credentialTotp,
  ])

  // Merged field set for a credential (pinned 2FA + additional) — the shape
  // validated and folded to the blob. KEY/SCRIPT have no pinned 2FA.
  const mergedFields =
    entry.type === ENTRY_TYPE_CREDENTIAL
      ? mergeCredentialTotp(credentialTotp, customFields)
      : customFields
  const fieldsInvalid = validateCustomFields(mergedFields).hasError

  const contentChanged = useMemo(() => {
    const current = currentPlaintext()
    return current !== null && originalPlaintext !== null && !plaintextsEqual(current, originalPlaintext)
  }, [currentPlaintext, originalPlaintext])

  const metadataChanged = useMemo(() => {
    if (label.trim() !== entry.label) return true
    if ((description.trim() || undefined) !== (entry.description ?? undefined)) return true
    if (icon !== entry.icon) return true
    if (color !== defaultColor) return true
    if (pendingIconFile) return true
    // For KEY/SCRIPT the URL field feeds only `urlDomain` metadata (CREDENTIAL's
    // url lives in the blob and is covered by contentChanged).
    if (entry.type !== ENTRY_TYPE_CREDENTIAL) {
      const origKeyUrl = entry.urlDomain ? `https://${entry.urlDomain}` : ''
      if (url !== origKeyUrl) return true
    }
    return false
  }, [label, description, icon, color, defaultColor, pendingIconFile, url, entry])

  const hasChanges = metadataChanged || contentChanged

  const handleDiscard = () => {
    setLabel(entry.label)
    setDescription(entry.description ?? '')
    setIcon(entry.icon)
    setColor(defaultColor)
    setPendingIconFile(null)
    setUrlError(false)
    setScriptError(false)
    if (originalPlaintext) {
      if (originalPlaintext.type === ENTRY_TYPE_KEY) {
        setCustomFields(readCustomFields(originalPlaintext))
        setSecretValue(originalPlaintext.value)
        setNotes(originalPlaintext.notes ?? '')
        setUrl(entry.urlDomain ? `https://${entry.urlDomain}` : '')
      } else if (originalPlaintext.type === ENTRY_TYPE_SCRIPT) {
        setCustomFields(readCustomFields(originalPlaintext))
        setScript(originalPlaintext.script)
        setInterpreter(originalPlaintext.interpreter)
        setRefs(originalPlaintext.refs ?? [])
        setNotes(originalPlaintext.notes ?? '')
      } else {
        const { pinned, rest } = pinCredentialTotp(originalPlaintext)
        setCredentialTotp(pinned)
        setCustomFields(rest)
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
    if (fieldsInvalid) return
    if (originalPlaintext) {
      if (entry.type === ENTRY_TYPE_KEY && !secretValue.trim()) {
        setSecretValueError(true)
        return
      }
      if (entry.type === ENTRY_TYPE_SCRIPT && !script.trim()) {
        setScriptError(true)
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

    // Re-encrypt if the blob content changed. `currentPlaintext` rebuilds the
    // full plaintext (well-known + custom fields + script) from form state,
    // preserving fields this UI doesn't expose.
    let newContent: EntryContent | undefined
    let savedPlaintext: EntryPlaintext | undefined
    const current = currentPlaintext()

    if (current && contentChanged) {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey || !vault.wrappedVK) {
        toast.error(t('vault.entry.detail.decryptError'))
        return
      }
      try {
        const vaultKey = await unsealVaultKey(vault.wrappedVK, privateKey)
        try {
          newContent = await encryptEntry(current, vaultKey)
          savedPlaintext = current
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
    if (newContent) {
      patch.content = newContent
      // Content changed → refresh the plaintext agent-field mirror (empty array
      // clears it server-side when the last visible field is removed).
      patch.agentFields = agentFieldsFrom(mergedFields) ?? []
    }

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
        <div className="flex flex-col gap-3">
            <div>
              <label
                htmlFor="entry-detail-label"
                className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
              >
                {t('vault.entries.labelLabel')}
                <span className="ml-1.5 font-normal text-[var(--cv-t3)]">· {t('vault.entries.agentVisibleNote')}</span>
              </label>
              <div className="flex gap-2">
                <EntryIconButton
                  icon={icon}
                  color={color}
                  type={entry.type}
                  onChange={(next) => { setIcon(next); setPendingIconFile(null) }}
                  onColorChange={setColor}
                  onFileSelected={(file, previewUrl) => { setPendingIconFile(file); setIcon(previewUrl) }}
                  disabled={isSaving}
                />
                <div className="min-w-0 flex-1">
                  <FormInput
                    id="entry-detail-label"
                    label={t('vault.entries.labelLabel')}
                    labelClassName="sr-only"
                    value={label}
                    onChange={(e) => { setLabel(e.target.value); setLabelError(false) }}
                    onBlur={() => setLabelError(firstError(label, [required(t('validation.required'))]) !== null)}
                    placeholder={t('vault.entries.labelPlaceholder')}
                    disabled={isSaving}
                    maxLength={120}
                    error={labelError}
                  />
                  <FieldFeedback visible={labelError} color="red">
                    {t('validation.required')}
                  </FieldFeedback>
                </div>
              </div>
            </div>
            <FormInput
              id="entry-detail-description"
              label={t('vault.entries.descriptionLabel')}
              labelSuffix={<>· {t('vault.entries.agentVisibleNote')}</>}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('vault.entries.descriptionPlaceholder')}
              disabled={isSaving}
              maxLength={500}
            />
            {entry.type !== ENTRY_TYPE_SCRIPT ? (
              <div className="-mb-3">
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
            ) : null}
            {decryptError ? (
              <div className="rounded-lg border border-[rgb(var(--cv-primary-rgb)/0.25)] bg-[rgb(var(--cv-primary-rgb)/0.06)] px-3 py-2 text-[11px] text-[var(--cv-primary)]">
                {decryptError}
              </div>
            ) : entry.type === ENTRY_TYPE_KEY ? (
              <div className="-mb-3">
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
                  copyable
                  copyLabel={t('vault.entry.copyKey')}
                />
                <FieldFeedback visible={secretValueError} color="red">
                  {t('validation.required')}
                </FieldFeedback>
              </div>
            ) : entry.type === ENTRY_TYPE_SCRIPT ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label
                    htmlFor="entry-detail-interpreter"
                    className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-[var(--cv-label-text)]"
                  >
                    <span>{t('vault.entries.script.bodyLabel')}</span>
                    <span className="flex-1" />
                    <select
                      id="entry-detail-interpreter"
                      aria-label={t('vault.entries.script.interpreterLabel')}
                      value={interpreter}
                      onChange={(e) => setInterpreter(e.target.value as ScriptInterpreter)}
                      disabled={isSaving || decrypting}
                      className="cursor-pointer appearance-none border-0 bg-transparent pr-1 text-[11.5px]
                        font-normal text-[var(--cv-t2)] outline-none disabled:cursor-not-allowed"
                    >
                      {SCRIPT_INTERPRETERS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <Icon name="expand_more" size={13} className="-ml-1 text-[var(--cv-icon-muted)]" />
                  </label>
                  <ScriptEditor
                    value={script}
                    onChange={(next) => { setScript(next); setScriptError(false) }}
                    interpreter={interpreter}
                    disabled={isSaving || decrypting}
                    placeholder={t('vault.entries.script.bodyPlaceholder')}
                  />
                  <FieldFeedback visible={scriptError} color="red">
                    {t('validation.required')}
                  </FieldFeedback>
                  <ScriptExecHint />
                </div>
                <SectionHeader>{t('vault.entries.script.refsTitle')}</SectionHeader>
                <ScriptRefsEditor
                  vaultId={vault.id}
                  currentEntryId={entry.id}
                  refs={refs}
                  onChange={setRefs}
                  disabled={isSaving || decrypting}
                />
              </div>
            ) : (
              <>
              <div className="flex gap-3 -mb-3">
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
                    copyable
                    copyLabel={t('vault.entry.copyUsername')}
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
                    copyable
                    copyLabel={t('vault.entry.copyPassword')}
                  />
                  <FieldFeedback visible={passwordError} color="red">
                    {t('validation.required')}
                  </FieldFeedback>
                </div>
              </div>
              <SectionHeader>{t('vault.entries.totp.section')}</SectionHeader>
              <CredentialTotpField
                value={credentialTotp}
                onChange={setCredentialTotp}
                disabled={isSaving || decrypting}
              />
              </>
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
            {!decryptError ? (
              <>
                <SectionHeader>{t('vault.entries.customFields.title')}</SectionHeader>
                <CustomFieldsEditor
                  fields={customFields}
                  onChange={setCustomFields}
                  disabled={isSaving || decrypting}
                  copyable
                />
              </>
            ) : null}
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
            disabled={isSaving || !hasChanges || fieldsInvalid}
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
      <h2 className="text-[11px] font-semibold text-[var(--cv-primary)]">
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

interface CurrentFormValues {
  secretValue: string
  username: string
  password: string
  notes: string
  url: string
  script: string
  interpreter: ScriptInterpreter
  refs: ScriptRef[]
  customFields: CustomField[]
  /** Pinned credential 2FA field (CREDENTIAL only). */
  credentialTotp: CustomField | null
}

type CredentialPlaintext = Extract<EntryPlaintext, { type: typeof ENTRY_TYPE_CREDENTIAL }>

/**
 * Rebuild the entry's plaintext from the current inline-edit form state. For a
 * credential the pinned 2FA field is merged back into `fields[]`; a legacy
 * top-level `totp` URI is preserved only while it hasn't been pinned (malformed
 * seed that couldn't be parsed), so nothing is lost. `v: 2` is stamped only when
 * fields are present, so a plain KEY/CREDENTIAL blob stays v1.
 */
function buildCurrentPlaintext(
  original: EntryPlaintext,
  entry: EntryDetail,
  values: CurrentFormValues,
): EntryPlaintext {
  const notes = values.notes.trim() || undefined

  if (entry.type === ENTRY_TYPE_KEY) {
    const fieldsPart = foldFieldsPart(values.customFields)
    return { type: ENTRY_TYPE_KEY, value: values.secretValue.trim(), notes, ...fieldsPart }
  }
  if (entry.type === ENTRY_TYPE_SCRIPT) {
    const fieldsPart = foldFieldsPart(values.customFields)
    const scriptRefs = foldScriptRefs(values.refs)
    return {
      v: BLOB_VERSION_V2,
      type: ENTRY_TYPE_SCRIPT,
      script: values.script.trim(),
      interpreter: values.interpreter,
      notes,
      ...(scriptRefs.length > 0 ? { refs: scriptRefs } : {}),
      ...fieldsPart,
    }
  }
  const fieldsPart = foldFieldsPart(mergeCredentialTotp(values.credentialTotp, values.customFields))
  // Keep an unparseable legacy totp string only while no 2FA field is pinned.
  const legacyTotp =
    !values.credentialTotp && original.type === ENTRY_TYPE_CREDENTIAL ? original.totp : undefined
  return {
    type: ENTRY_TYPE_CREDENTIAL,
    username: values.username.trim(),
    password: values.password,
    url: values.url.trim() || undefined,
    notes,
    ...(legacyTotp ? { totp: legacyTotp } : {}),
    ...fieldsPart,
  }
}

function foldFieldsPart(fields: CustomField[]): { v?: typeof BLOB_VERSION_V2; fields?: CustomField[] } {
  const folded = foldCustomFields(fields)
  return folded ? { v: BLOB_VERSION_V2, fields: folded } : {}
}

/**
 * Pin the dedicated credential 2FA field for editing. If a TOTP field already
 * exists it is used as-is; otherwise a legacy top-level `totp` URI is parsed and
 * migrated into a field object, with the returned `baseline` reflecting that
 * migration so the form doesn't read as dirty on load.
 */
function pinCredentialTotp(pt: CredentialPlaintext): {
  pinned: CustomField | null
  rest: CustomField[]
  baseline: EntryPlaintext
} {
  const fields = readCustomFields(pt)
  const split = splitCredentialTotp(fields)
  if (split.pinned) return { pinned: split.pinned, rest: split.rest, baseline: pt }

  if (pt.totp) {
    const params = parseOtpauthUri(pt.totp)
    if (params) {
      const pinned: CustomField = {
        id: newFieldId(),
        label: DEFAULT_TOTP_LABEL,
        type: 'totp',
        value: params,
      }
      const baseline: EntryPlaintext = {
        ...pt,
        totp: undefined,
        v: BLOB_VERSION_V2,
        fields: mergeCredentialTotp(pinned, fields),
      }
      return { pinned, rest: fields, baseline }
    }
  }
  return { pinned: null, rest: fields, baseline: pt }
}

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
